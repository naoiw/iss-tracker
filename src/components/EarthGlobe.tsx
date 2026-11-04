import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { geoToCartesian, subsolarPoint } from '../lib/astronomy';
import { predictPosition, type GeoPosition, type IssPosition, type OrbitModel } from '../lib/iss';

export interface EarthGlobeHandle {
  focusIss(): void;
}

interface EarthGlobeProps {
  model: OrbitModel | null;
  livePosition: IssPosition | null;
  track: { past: GeoPosition[]; future: GeoPosition[] } | null;
  autoRotate: boolean;
  showOrbit: boolean;
  onReady(): void;
  onError(message: string): void;
}

interface CameraTransition {
  from: THREE.Vector3;
  rotation: THREE.Quaternion;
  distance: number;
  start: number;
}

const RADIUS = 1.55;
const EARTH_RADIUS_KM = 6371;
const INITIAL_DISTANCE = 5.2;
const IMAGE_BASE = 'https://unpkg.com/three-globe@2.45.2/example/img/';

function radiusAt(altitudeKm: number): number {
  return RADIUS * (1 + altitudeKm / EARTH_RADIUS_KM);
}

function toVector(point: GeoPosition): THREE.Vector3 {
  return new THREE.Vector3(...geoToCartesian(
    point.latitude, point.longitude, radiusAt(point.altitude),
  ));
}

function createStars(): THREE.Points {
  const coords: number[] = [];
  let seed = 41839;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 1100; i += 1) {
    const y = rand() * 2 - 1;
    const theta = rand() * 2 * Math.PI;
    const distance = 22 + rand() * 20;
    const circle = Math.sqrt(1 - y * y);
    coords.push(distance * circle * Math.cos(theta), distance * y, distance * circle * Math.sin(theta));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xa5c8df, size: 0.09, transparent: true, opacity: 0.8, depthWrite: false,
  }));
}

function createEarthMaterial(): THREE.ShaderMaterial {
  const sun = subsolarPoint(new Date());
  return new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: null },
      nightMap: { value: null },
      hasDayMap: { value: false },
      hasNightMap: { value: false },
      sunDirection: { value: new THREE.Vector3(...geoToCartesian(sun.latitude, sun.longitude)) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vSphereNormal;
      void main() {
        vUv = uv;
        vSphereNormal = normalize(normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D dayMap;
      uniform sampler2D nightMap;
      uniform bool hasDayMap;
      uniform bool hasNightMap;
      uniform vec3 sunDirection;
      varying vec2 vUv;
      varying vec3 vSphereNormal;
      void main() {
        float light = dot(normalize(vSphereNormal), normalize(sunDirection));
        float dayAmount = smoothstep(-0.08, 0.14, light);
        vec3 dayColor = hasDayMap ? texture2D(dayMap, vUv).rgb : vec3(0.13, 0.34, 0.55);
        vec3 nightColor = hasNightMap ? texture2D(nightMap, vUv).rgb : vec3(0.015, 0.033, 0.065);
        vec3 sunlit = dayColor * (0.68 + 0.46 * max(light, 0.0));
        vec3 dark = nightColor * 0.88 + vec3(0.008, 0.014, 0.025);
        gl_FragColor = vec4(mix(dark, sunlit, dayAmount), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function createGlow(): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(RADIUS + 0.15, 96, 64),
    new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { glowColor: { value: new THREE.Color('#36b8da') } },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vNormal;
        void main() {
          float halo = pow(1.0 - abs(vNormal.z), 3.2);
          gl_FragColor = vec4(glowColor, halo * 0.30);
        }
      `,
    }));
}

function makeOrbitLine(points: GeoPosition[], color: number): THREE.Line | null {
  if (points.length < 2) return null;
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(toVector));
  const material = new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0.88, depthWrite: false,
  });
  return new THREE.Line(geometry, material);
}

const EarthGlobe = forwardRef<EarthGlobeHandle, EarthGlobeProps>(function EarthGlobe({
  model, livePosition, track, autoRotate, showOrbit, onReady, onError,
}, ref) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const markerLabelRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef(model);
  const positionRef = useRef(livePosition);
  const lastGeoRef = useRef<GeoPosition | null>(null);
  const focusRef = useRef<CameraTransition | null>(null);
  const orbitGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { positionRef.current = livePosition; }, [livePosition]);

  useImperativeHandle(ref, () => ({
    focusIss() {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const geo = lastGeoRef.current ?? positionRef.current;
      if (!camera || !controls || !geo) return;
      controls.autoRotate = false;
      const from = camera.position.clone().normalize();
      const target = toVector(geo).normalize();
      const rotation = new THREE.Quaternion().setFromUnitVectors(from, target);
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      if (reducedMotion) {
        camera.position.copy(target.multiplyScalar(camera.position.length()));
        controls.update();
        return;
      }
      focusRef.current = {
        from, rotation, distance: camera.position.length(), start: performance.now(),
      };
    },
  }), []);

  useEffect(() => {
    if (!controlsRef.current) return;
    controlsRef.current.autoRotate = autoRotate;
    if (autoRotate) focusRef.current = null;
  }, [autoRotate]);

  useEffect(() => {
    if (orbitGroupRef.current) orbitGroupRef.current.visible = showOrbit;
  }, [showOrbit]);

  useEffect(() => {
    const group = orbitGroupRef.current;
    if (!group) return;
    const lines: THREE.Line[] = [];
    if (track) {
      const past = makeOrbitLine(track.past, 0x6de5e1);
      const future = makeOrbitLine(track.future, 0xffb76f);
      if (past) lines.push(past);
      if (future) lines.push(future);
    }
    lines.forEach(line => group.add(line));
    return () => {
      lines.forEach(line => {
        group.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      });
    };
  }, [track]);

  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      onError('WebGL描画を開始できませんでした。対応ブラウザでお試しください。');
      return;
    }

    let disposed = false;
    let frame = 0;
    let lastPositionUpdate = 0;
    let initialFocusSet = false;
    let userInteracted = false;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, INITIAL_DISTANCE);
    cameraRef.current = camera;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.38;
    renderer.domElement.className = 'globe-canvas';
    renderer.domElement.setAttribute('aria-label', 'ISSの軌道を表示する地球儀。ドラッグで回転、ホイールでズーム');
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = Math.PI - 0.18;
    controls.minDistance = 2.6;
    controls.maxDistance = 9;
    controls.rotateSpeed = 0.38;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.23;
    controlsRef.current = controls;
    const onControlStart = () => {
      focusRef.current = null;
      userInteracted = true;
    };
    controls.addEventListener('start', onControlStart);

    const globeGeometry = new THREE.SphereGeometry(RADIUS, 96, 64);
    const globeMaterial = createEarthMaterial();
    scene.add(new THREE.Mesh(globeGeometry, globeMaterial));

    const glow = createGlow();
    scene.add(glow);
    const stars = createStars();
    scene.add(stars);

    const orbitGroup = new THREE.Group();
    orbitGroup.visible = showOrbit;
    orbitGroupRef.current = orbitGroup;
    scene.add(orbitGroup);

    const markerGeometry = new THREE.SphereGeometry(0.038, 16, 12);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffbd76 });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.visible = false;
    scene.add(marker);
    const outerRingGeometry = new THREE.TorusGeometry(0.070, 0.006, 8, 40);
    const outerRingMaterial = new THREE.MeshBasicMaterial({ color: 0xffc583 });
    const outerRing = new THREE.Mesh(outerRingGeometry, outerRingMaterial);
    outerRing.visible = false;
    scene.add(outerRing);

    const groundGeometry = new THREE.SphereGeometry(0.017, 12, 12);
    const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x78e9e1 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.visible = false;
    scene.add(ground);
    const tetherGeometry = new THREE.BufferGeometry();
    tetherGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const tetherMaterial = new THREE.LineBasicMaterial({ color: 0xffbd76, transparent: true, opacity: 0.44 });
    const tether = new THREE.Line(tetherGeometry, tetherMaterial);
    tether.visible = false;
    scene.add(tether);

    const loadedTextures: THREE.Texture[] = [];
    const loader = new THREE.TextureLoader();
    const loadImage = (name: 'day' | 'night', filename: string) => {
      loader.load(IMAGE_BASE + filename, texture => {
        if (disposed) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        loadedTextures.push(texture);
        globeMaterial.uniforms[name === 'day' ? 'dayMap' : 'nightMap'].value = texture;
        globeMaterial.uniforms[name === 'day' ? 'hasDayMap' : 'hasNightMap'].value = true;
      }, undefined, () => {
        // Keep solid colors when the CDN image cannot be loaded.
      });
    };
    loadImage('day', 'earth-blue-marble.jpg');
    loadImage('night', 'earth-night.jpg');

    const updateSun = () => {
      const sun = subsolarPoint(new Date());
      globeMaterial.uniforms.sunDirection.value.set(...geoToCartesian(sun.latitude, sun.longitude));
    };
    updateSun();
    const sunTimer = window.setInterval(updateSun, 60_000);

    const resize = () => {
      if (disposed) return;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const minimum = width < 520 ? 6.45 : width < 790 ? 5.85 : INITIAL_DISTANCE;
      if (camera.position.length() < minimum && !userInteracted) camera.position.setLength(minimum);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const earthSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), RADIUS);
    const ray = new THREE.Ray();
    const hit = new THREE.Vector3();
    const projected = new THREE.Vector3();

    function showMarker(geo: GeoPosition) {
      const satellite = toVector(geo);
      const surface = new THREE.Vector3(...geoToCartesian(geo.latitude, geo.longitude, RADIUS + 0.002));
      marker.position.copy(satellite);
      outerRing.position.copy(satellite);
      ground.position.copy(surface);
      const positionArray = tetherGeometry.attributes.position;
      positionArray.setXYZ(0, surface.x, surface.y, surface.z);
      positionArray.setXYZ(1, satellite.x, satellite.y, satellite.z);
      positionArray.needsUpdate = true;
      marker.visible = outerRing.visible = ground.visible = tether.visible = true;
    }

    const animate = (time: number) => {
      if (disposed) return;
      frame = window.requestAnimationFrame(animate);

      if (time - lastPositionUpdate > 100) {
        lastPositionUpdate = time;
        const geo = modelRef.current
          ? predictPosition(modelRef.current, new Date())
          : positionRef.current;
        if (geo) {
          lastGeoRef.current = geo;
          showMarker(geo);
          if (!initialFocusSet && !userInteracted) {
            camera.position.copy(toVector(geo).normalize().multiplyScalar(camera.position.length()));
            controls.update();
            initialFocusSet = true;
          }
        } else {
          lastGeoRef.current = null;
          marker.visible = outerRing.visible = ground.visible = tether.visible = false;
        }
      }

      const transition = focusRef.current;
      if (transition) {
        const progress = Math.min(1, (time - transition.start) / 1900);
        const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
        const rotation = new THREE.Quaternion().identity().slerp(transition.rotation, eased);
        camera.position.copy(transition.from).applyQuaternion(rotation).multiplyScalar(transition.distance);
        if (progress >= 1) focusRef.current = null;
      }
      controls.update();

      if (marker.visible) {
        outerRing.quaternion.copy(camera.quaternion);
        const label = markerLabelRef.current;
        if (label) {
          projected.copy(marker.position).project(camera);
          const distanceToMarker = camera.position.distanceTo(marker.position);
          ray.set(camera.position, marker.position.clone().sub(camera.position).normalize());
          const intersection = ray.intersectSphere(earthSphere, hit);
          const occluded = !!intersection && camera.position.distanceTo(intersection) < distanceToMarker - 0.015;
          const visible = !occluded && projected.z >= -1 && projected.z <= 1;
          label.style.display = visible ? 'flex' : 'none';
          if (visible) {
            label.style.left = ((projected.x + 1) * 0.5 * container.clientWidth) + 'px';
            label.style.top = ((1 - projected.y) * 0.5 * container.clientHeight) + 'px';
          }
        }
      } else if (markerLabelRef.current) {
        markerLabelRef.current.style.display = 'none';
      }
      renderer.render(scene, camera);
    };
    frame = window.requestAnimationFrame(animate);
    onReady();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.clearInterval(sunTimer);
      observer.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      controlsRef.current = null;
      cameraRef.current = null;
      orbitGroupRef.current = null;
      focusRef.current = null;
      globeGeometry.dispose();
      globeMaterial.dispose();
      glow.geometry.dispose();
      (glow.material as THREE.Material).dispose();
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      outerRingGeometry.dispose();
      outerRingMaterial.dispose();
      groundGeometry.dispose();
      groundMaterial.dispose();
      tetherGeometry.dispose();
      tetherMaterial.dispose();
      loadedTextures.forEach(texture => texture.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onReady, onError]);

  return <div className="globe-wrap">
    <div ref={viewportRef} className="globe-viewport" />
    <div ref={markerLabelRef} className="iss-marker-label" style={{ display: 'none' }}>
      <span className="iss-marker-core" /><span className="iss-marker-text">ISS</span>
    </div>
  </div>;
});

export default EarthGlobe;
