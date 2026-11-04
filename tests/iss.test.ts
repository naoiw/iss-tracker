import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrbitModel, generateOrbit, parseIssPosition, parseIssTle, predictPosition } from '../src/lib/iss.ts';

const tle = parseIssTle({
  tle_timestamp: 1787082431,
  line1: '1 25544U 98067A   26230.82443714  .00008426  00000+0  15812-3 0  9995',
  line2: '2 25544  51.6332 350.0835 0007621  60.8158 299.3593 15.49494626581464',
});

test('parses valid position data', () => {
  const result = parseIssPosition({
    latitude: 12, longitude: -45, altitude: 420, velocity: 27600,
    timestamp: 1787208386, visibility: 'daylight', footprint: 4450,
  });
  assert.equal(result.longitude, -45);
  assert.equal(result.altitude, 420);
});

test('rejects invalid or incomplete API responses', () => {
  assert.throws(() => parseIssPosition({ latitude: 100, longitude: 0 }));
  assert.throws(() => parseIssTle({ line1: 'not a tle', line2: '', tle_timestamp: 2 }));
});

test('SGP4 orbit is in plausible low-Earth orbit', () => {
  const model = createOrbitModel(tle);
  const now = new Date('2026-08-19T00:00:00Z');
  const position = predictPosition(model, now);
  assert.ok(position);
  assert.ok(Math.abs(position.latitude) <= 52);
  assert.ok(Math.abs(position.longitude) <= 180);
  assert.ok(position.altitude > 300 && position.altitude < 600);
  const track = generateOrbit(model, now);
  assert.ok(track.past.length > 100);
  assert.ok(track.future.length > 100);
});
