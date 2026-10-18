const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Exif = require('../exif.js');
const ab = (f) => { const b = fs.readFileSync(path.join(__dirname, 'fixtures', f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

test('reads GPS position and capture time from a photo', () => {
  const r = Exif.parse(ab('gps.jpg'));
  assert.strictEqual(r.ts, '2026-10-18T09:15:42');
  assert.ok(Math.abs(r.lat - 27.9477) < 1e-4, 'lat ' + r.lat);
  assert.ok(Math.abs(r.lon + 82.4572) < 1e-4, 'lon ' + r.lon);
});

test('a photo with no EXIF gives an empty result', () => { assert.deepStrictEqual(Exif.parse(ab('plain.jpg')), {}); });
test('garbage input does not throw', () => {
  assert.deepStrictEqual(Exif.parse(new ArrayBuffer(0)), {});
  assert.deepStrictEqual(Exif.parse(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer), {});
  const bad = new Uint8Array(ab('gps.jpg').slice(0, 60)); assert.doesNotThrow(() => Exif.parse(bad.buffer));
});
