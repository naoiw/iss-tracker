import { eciToGeodetic, gstime, propagate, twoline2satrec } from 'satellite.js';

export const ISS_POSITION_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
export const ISS_TLE_URL = ISS_POSITION_URL + '/tles';

export interface GeoPosition {
  latitude: number;
  longitude: number;
  altitude: number; // km above mean sea level
}

export interface IssPosition extends GeoPosition {
  velocity: number; // km/h
  visibility: 'daylight' | 'eclipsed';
  timestamp: number; // Unix seconds
  footprint: number; // km
}

export interface IssTle {
  line1: string;
  line2: string;
  timestamp: number;
}

export interface OrbitModel {
  satrec: ReturnType<typeof twoline2satrec>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseIssPosition(value: unknown): IssPosition {
  if (!isObject(value) ||
      !finiteNumber(value.latitude) || Math.abs(value.latitude) > 90 ||
      !finiteNumber(value.longitude) || Math.abs(value.longitude) > 180 ||
      !finiteNumber(value.altitude) || value.altitude < 0 ||
      !finiteNumber(value.velocity) || value.velocity < 0 ||
      !finiteNumber(value.timestamp) ||
      !finiteNumber(value.footprint) ||
      (value.visibility !== 'daylight' && value.visibility !== 'eclipsed')) {
    throw new Error('位置データの形式が正しくありません。');
  }
  return {
    latitude: value.latitude,
    longitude: value.longitude,
    altitude: value.altitude,
    velocity: value.velocity,
    timestamp: value.timestamp,
    footprint: value.footprint,
    visibility: value.visibility,
  };
}

export function parseIssTle(value: unknown): IssTle {
  if (!isObject(value) ||
      typeof value.line1 !== 'string' || !value.line1.startsWith('1 25544') ||
      typeof value.line2 !== 'string' || !value.line2.startsWith('2 25544') ||
      !finiteNumber(value.tle_timestamp)) {
    throw new Error('軌道データの形式が正しくありません。');
  }
  return { line1: value.line1, line2: value.line2, timestamp: value.tle_timestamp };
}

export function createOrbitModel(tle: IssTle): OrbitModel {
  return { satrec: twoline2satrec(tle.line1, tle.line2) };
}

export function predictPosition(model: OrbitModel, date: Date): GeoPosition | null {
  const result = propagate(model.satrec, date);
  if (!result || !result.position) return null;
  const geo = eciToGeodetic(result.position, gstime(date));
  const latitude = geo.latitude * 180 / Math.PI;
  const longitude = geo.longitude * 180 / Math.PI;
  if (![latitude, longitude, geo.height].every(Number.isFinite) || geo.height < 0) {
    return null;
  }
  return { latitude, longitude, altitude: geo.height };
}

/** ±90 minutes of three-dimensional orbit, sampled every 45 seconds. */
export function generateOrbit(model: OrbitModel, now: Date): {
  past: GeoPosition[];
  future: GeoPosition[];
} {
  const past: GeoPosition[] = [];
  const future: GeoPosition[] = [];
  const origin = now.getTime();
  for (let offset = -90 * 60; offset <= 90 * 60; offset += 45) {
    const position = predictPosition(model, new Date(origin + offset * 1000));
    if (!position) continue;
    if (offset <= 0) past.push(position);
    if (offset >= 0) future.push(position);
  }
  return { past, future };
}
