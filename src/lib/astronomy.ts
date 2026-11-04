const DEG = Math.PI / 180;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Convert geographic coordinates to Three.js SphereGeometry world coordinates.
 * Equirectangular globe textures put 0° longitude at u = 0.5 (+X),
 * +90° east at u = 0.75 (-Z), and -90° west at u = 0.25 (+Z).
 * Do not flip the sign of Z: city markers AND the solar terminator depend on it.
 */
export function geoToCartesian(latitude: number, longitude: number, radius = 1): [number, number, number] {
  const lat = latitude * DEG;
  const lon = longitude * DEG;
  const cosLat = Math.cos(lat);
  return [radius * cosLat * Math.cos(lon), radius * Math.sin(lat), -radius * cosLat * Math.sin(lon)];
}

/** Approximate subsolar point using NOAA's fractional-year equations.
 * Accuracy is more than sufficient for the visual day/night terminator.
 */
export function subsolarPoint(date: Date): GeoPoint {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const day = (Date.UTC(year, date.getUTCMonth(), date.getUTCDate()) - start) / 86400000;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const daysInYear = (Date.UTC(year + 1, 0, 1) - start) / 86400000;
  const gamma = (2 * Math.PI / daysInYear) * (day + (minutes / 60 - 12) / 24);

  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma));

  // Solar noon happens at longitude = (720 - utcMinutes - equationOfTime)/4.
  const rawLongitude = (720 - minutes - eqTime) / 4;
  const longitude = ((rawLongitude + 540) % 360 + 360) % 360 - 180;
  return { latitude: declination / DEG, longitude };
}

/** A point is visible if the ray from the camera to it is not blocked by Earth. */
export function isSurfaceVisible(point: readonly number[], camera: readonly number[], radius: number): boolean {
  const dot = point[0] * camera[0] + point[1] * camera[1] + point[2] * camera[2];
  const cameraLength = Math.hypot(camera[0], camera[1], camera[2]);
  return dot > radius * radius && cameraLength > radius;
}
