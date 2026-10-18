const test = require('node:test');
const assert = require('node:assert');
const G = require('../geo.js');

const g = { lat0: 27.9477, lon0: -82.4572, ang: 0.4, mx: 12, my: -7, s: 1.25, dx: 3, dy: -2, rot: 15 };

test('plan and lat/lon convert back and forth', () => {
  const p = G.toPlan(g, 27.94795, -82.45705), b = G.toGeo(g, p.x, p.y);
  assert.ok(Math.abs(b.lat - 27.94795) < 1e-9 && Math.abs(b.lon + 82.45705) < 1e-9, JSON.stringify(b));
});

test('a point 100 ft east of the anchor is about 100 ft away in the plan', () => {
  const h = { lat0: 28, lon0: -82, ang: 0, mx: 0, my: 0, s: 1 };
  const kx = 111320 * Math.cos((28 * Math.PI) / 180) * 3.28084;
  const p = G.toPlan(h, 28, -82 + 100 / kx);
  assert.ok(Math.abs(p.x - 100) < 1e-6 && Math.abs(p.y) < 1e-6, JSON.stringify(p));
});

test('tile corners and tile indexes agree', () => {
  const z = 17, lat = 27.9477, lon = -82.4572, x = Math.floor(G.tileX(lon, z)), y = Math.floor(G.tileY(lat, z));
  assert.ok(G.tileLon(x, z) <= lon && lon < G.tileLon(x + 1, z));
  assert.ok(G.tileLat(y + 1, z) < lat && lat <= G.tileLat(y, z));
});

test('tilesFor covers the view with a sensible number of tiles', () => {
  const h = { lat0: 27.9477, lon0: -82.4572, ang: 0, mx: 0, my: 0, s: 1 };
  const view = { x: -60, y: -40, w: 120, h: 80 };
  const t = G.tilesFor(h, view, 800, { url: 'https://t.example/{z}/{x}/{y}.png', maxZoom: 19 });
  assert.ok(t.length >= 1 && t.length <= 40, 'count ' + t.length);
  assert.ok(t[0].z >= 17 && t[0].z <= 19, 'zoom ' + t[0].z);
  assert.ok(/^https:\/\/t\.example\/\d+\/\d+\/\d+\.png$/.test(t[0].url));
  // the view centre (0,0) is the anchor: some tile must contain it
  const inside = t.some((q) => { const [a, b, c, d, e, f] = q.m, det = a * d - b * c, px = ((0 - e) * d - (0 - f) * c) / det, py = (a * (0 - f) - b * (0 - e)) / det; return px >= -1e-6 && px <= 1 + 1e-6 && py >= -1e-6 && py <= 1 + 1e-6; });
  assert.ok(inside, 'a tile contains the anchor');
});

test('zooming out never asks for more than the tile limit', () => {
  const h = { lat0: 27.9477, lon0: -82.4572, ang: 0.3, mx: 0, my: 0, s: 1 };
  const t = G.tilesFor(h, { x: -5000, y: -5000, w: 10000, h: 8000 }, 800, { maxTiles: 40 });
  assert.ok(t.length <= 40, 'count ' + t.length);
});

test('resizing the drawing (scale) keeps map and plan in step', () => {
  const a = { lat0: 28, lon0: -82, ang: 0.2, mx: 3, my: 4, s: 1, dx: 0, dy: 0 }, p1 = G.toPlan(a, 28.0002, -82.0003);
  const b = { ...a, s: 2 }, p2 = G.toPlan(b, 28.0002, -82.0003);
  assert.ok(Math.abs(p2.x - 2 * p1.x) < 1e-6 && Math.abs(p2.y - 2 * p1.y) < 1e-6);
});
