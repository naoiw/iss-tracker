import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EarthGlobe, { type EarthGlobeHandle } from './components/EarthGlobe';
import { useIss } from './hooks/useIss';
import { createOrbitModel, generateOrbit, type OrbitModel } from './lib/iss';

const utcClock = (timestamp: number) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(timestamp);

const formatFetched = (timestamp: number | null) => timestamp === null ? '—' :
  new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(timestamp) + ' JST';

const coordinate = (value: number | undefined, positive: string, negative: string) =>
  value === undefined ? '—' : `${Math.abs(value).toFixed(3)}° ${value >= 0 ? positive : negative}`;

const numeric = (value: number | undefined, decimals: number) =>
  value === undefined ? '—' : value.toLocaleString('ja-JP', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

export default function App() {
  const globeRef = useRef<EarthGlobeHandle>(null);
  const [now, setNow] = useState(() => Date.now());
  const [autoRotate, setAutoRotate] = useState(false);
  const [focusEnabled, setFocusEnabled] = useState(true);
  const [showOrbit, setShowOrbit] = useState(true);
  const [ready, setReady] = useState(false);
  const [globeError, setGlobeError] = useState<string | null>(null);
  const { position, tle, loading, positionError, tleError, receivedAt, refresh } = useIss();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const model: OrbitModel | null = useMemo(
    () => tle ? createOrbitModel(tle) : null, [tle],
  );
  const minute = Math.floor(now / 60_000);
  const track = useMemo(
    () => model ? generateOrbit(model, new Date(minute * 60_000)) : null,
    [model, minute],
  );
  const dataAge = position ? now - position.timestamp * 1000 : Infinity;
  const dataStale = dataAge > 90_000;
  const tleAgeHours = tle ? (now - tle.timestamp * 1000) / 3_600_000 : null;

  const handleReady = useCallback(() => setReady(true), []);
  const handleGlobeError = useCallback((message: string) => {
    setGlobeError(message);
    setReady(false);
  }, []);
  const handleManualInteraction = useCallback(() => setFocusEnabled(false), []);
  const toggleFocusIss = () => {
    if (focusEnabled) {
      setFocusEnabled(false);
      return;
    }
    setAutoRotate(false);
    setFocusEnabled(true);
    globeRef.current?.focusIss();
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true">◎</span>
          <span>ISS <strong>TRACKER</strong></span>
        </div>
        <div className="topbar-right">
          <span className="topbar-stage">INTERNATIONAL SPACE STATION · NORAD 25544</span>
          <span className="topbar-divider" />
          <span className="utc-time"><span className={`live-dot ${dataStale ? 'stale' : ''}`} />
            {utcClock(now)} UTC</span>
        </div>
      </header>

      <main className="main-stage">
        <section className="globe-stage" aria-label="ISSの位置と軌道を示す3D地球儀">
          <div className="globe-backlight" aria-hidden="true" />
          <div className="orbit-decoration orbit-decoration-a" aria-hidden="true" />
          <div className="orbit-decoration orbit-decoration-b" aria-hidden="true" />
          <EarthGlobe
            ref={globeRef}
            model={model}
            livePosition={position}
            track={track}
            autoRotate={autoRotate}
            focusEnabled={focusEnabled}
            onManualInteraction={handleManualInteraction}
            showOrbit={showOrbit}
            onReady={handleReady}
            onError={handleGlobeError}
          />
          {globeError && <div className="globe-message" role="alert">{globeError}</div>}
          {!ready && !globeError && <div className="globe-message">地球儀を読み込んでいます…</div>}
          {ready && position && (
            <div className="orbit-legend" aria-label="軌道線の凡例">
              <span><i className="legend-past" /> PAST 90 MIN</span>
              <span><i className="legend-future" /> NEXT 90 MIN</span>
            </div>
          )}
        </section>

        <aside className="control-panel" aria-label="ISS位置情報と操作">
          <button
            type="button"
            className={`rotation-toggle ${autoRotate ? 'active' : ''}`}
            aria-pressed={autoRotate}
            disabled={!ready}
            onClick={() => {
              setAutoRotate(previous => !previous);
              setFocusEnabled(false);
            }}
          >
            <span><span className="rotation-icon">{autoRotate ? 'Ⅱ' : '▶'}</span> AUTO ROTATE</span>
            <span className="toggle-track"><span /></span>
          </button>

          <div className="action-row">
            <button
              type="button"
              className={`action-button ${focusEnabled ? 'selected' : ''}`}
              aria-pressed={focusEnabled}
              onClick={toggleFocusIss}
              disabled={!position || !ready}
            >
              {focusEnabled ? '◉' : '○'} FOCUS ISS
            </button>
            <button
              type="button"
              className={`action-button ${showOrbit ? 'selected' : ''}`}
              onClick={() => setShowOrbit(previous => !previous)}
              aria-pressed={showOrbit}
              disabled={!ready}
            >
              {showOrbit ? '◉' : '○'} ORBIT
            </button>
          </div>

          <div className="iss-feature">
            <div className="feature-eyebrow">
              <span>ISS / POSITION DATA</span>
              <span className={`data-status ${dataStale ? 'data-status-stale' : ''}`}>
                {dataStale ? 'OFFLINE / STALE' : 'LIVE API'}
              </span>
            </div>
            <div className="feature-name">INTERNATIONAL<br />SPACE STATION</div>
            <div className="feature-subtitle">ISS · ZARYA · NORAD 25544</div>
            <div className="altitude">
              <strong>{numeric(position?.altitude, 1)}</strong><span>km</span>
            </div>
            <div className="altitude-label">ALTITUDE ABOVE EARTH</div>

            <dl className="detail-grid">
              <Detail label="VELOCITY" value={position ? `${numeric(position.velocity, 0)} km/h` : '—'} />
              <Detail label="SUNLIGHT" value={position ? position.visibility === 'daylight' ? 'DAYLIGHT' : 'ECLIPSED' : '—'} />
              <Detail label="LATITUDE" value={coordinate(position?.latitude, 'N', 'S')} />
              <Detail label="LONGITUDE" value={coordinate(position?.longitude, 'E', 'W')} />
              <Detail label="FOOTPRINT" value={position ? `${numeric(position.footprint, 0)} km` : '—'} />
              <Detail label="ORBIT MODEL" value={tle ? 'SGP4 / TLE' : 'UNAVAILABLE'} />
            </dl>
            <p className="position-note">
              位置・高度・速度は30秒ごとにAPIから取得。
              地球儀の秒単位の移動と軌道線はTLEによる推定です。
            </p>
          </div>

          <div className="data-update">
            <div>
              <span className="label">LAST API UPDATE</span>
              <span className="data-time">{formatFetched(receivedAt)}</span>
            </div>
            <button type="button" onClick={refresh} aria-label="ISS位置を更新">↻ 更新</button>
          </div>
          <div className="tle-info">
            TLE軌道要素：{tle ? formatFetched(tle.timestamp * 1000) : '未取得'}
            {tleAgeHours !== null && tleAgeHours > 48 && <span className="warn"> · 古い軌道データ</span>}
          </div>
          {loading && <p className="status-message" role="status">ISSの位置を取得しています…</p>}
          {positionError && <p className="status-message warn" role="alert">{positionError}</p>}
          {tleError && <p className="status-message warn" role="status">{tleError}</p>}
          <p className="prediction-note">軌道は予測値であり、軌道修正などにより実際の位置と異なる場合があります。</p>
        </aside>
      </main>

      <footer className="footer">
        <span>ISS TRACKER</span>
        <span className="footer-links">
          <a href="https://wheretheiss.at/w/developer" target="_blank" rel="noreferrer">API: WHERE THE ISS AT? ↗</a>
          <span className="footer-separator">·</span><span>3D: THREE.JS</span>
          <span className="footer-separator">·</span><span>ORBIT: SATELLITE.JS</span>
          <span className="footer-separator">·</span>
          <a href="https://github.com/naoiw/iss-tracker" target="_blank" rel="noreferrer">GITHUB ↗</a>
        </span>
      </footer>
    </div>
  );
}
