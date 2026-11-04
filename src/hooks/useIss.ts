import { useCallback, useEffect, useRef, useState } from 'react';
import { ISS_POSITION_URL, ISS_TLE_URL, parseIssPosition, parseIssTle, type IssPosition, type IssTle } from '../lib/iss';

interface IssState {
  position: IssPosition | null;
  tle: IssTle | null;
  loading: boolean;
  positionError: string | null;
  tleError: string | null;
  receivedAt: number | null;
}

const POLL_MS = 30_000;
const TLE_POLL_MS = 3 * 60 * 60 * 1000;

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json() as Promise<unknown>;
}

export function useIss() {
  const [state, setState] = useState<IssState>({
    position: null, tle: null, loading: true,
    positionError: null, tleError: null, receivedAt: null,
  });
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    let positionBusy = false;
    let tleBusy = false;
    const controller = new AbortController();

    async function getPosition() {
      if (!active || positionBusy || document.visibilityState === 'hidden') return;
      positionBusy = true;
      try {
        const position = parseIssPosition(await getJson(ISS_POSITION_URL, controller.signal));
        if (active) setState(previous => ({
          ...previous, position, positionError: null, loading: false, receivedAt: Date.now(),
        }));
      } catch (error) {
        if (active) setState(previous => ({
          ...previous, loading: false,
          positionError: 'ISSの位置を取得できませんでした。' +
            (error instanceof Error ? ' (' + error.message + ')' : ''),
        }));
      } finally {
        positionBusy = false;
      }
    }

    async function getTle() {
      if (!active || tleBusy || document.visibilityState === 'hidden') return;
      tleBusy = true;
      try {
        const tle = parseIssTle(await getJson(ISS_TLE_URL, controller.signal));
        if (active) setState(previous => ({ ...previous, tle, tleError: null }));
      } catch (error) {
        if (active) setState(previous => ({
          ...previous,
          tleError: '軌道データを取得できませんでした。' +
            (error instanceof Error ? ' (' + error.message + ')' : ''),
        }));
      } finally {
        tleBusy = false;
      }
    }

    refreshRef.current = () => { void getPosition(); };
    void getPosition();
    // Stagger the first TLE request to respect the API's ~1 request/sec limit.
    const firstTle = window.setTimeout(() => { void getTle(); }, 1600);
    const positionTimer = window.setInterval(() => { void getPosition(); }, POLL_MS);
    const tleTimer = window.setInterval(() => { void getTle(); }, TLE_POLL_MS);
    const visible = () => {
      if (document.visibilityState === 'visible') void getPosition();
    };
    document.addEventListener('visibilitychange', visible);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(firstTle);
      window.clearInterval(positionTimer);
      window.clearInterval(tleTimer);
      document.removeEventListener('visibilitychange', visible);
      refreshRef.current = () => {};
    };
  }, []);

  const refresh = useCallback(() => refreshRef.current(), []);
  return { ...state, refresh };
}
