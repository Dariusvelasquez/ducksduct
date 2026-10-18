const test = require('node:test');
const assert = require('node:assert');
const Detect = require('../detect.js');

const WALL = [8, 64, 152], FLOOR = [235, 245, 255], OUT = [120, 110, 100];
function canvas(w, h, bg) { const data = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { data[i * 4] = bg[0]; data[i * 4 + 1] = bg[1]; data[i * 4 + 2] = bg[2]; data[i * 4 + 3] = 255; } return { data, width: w, height: h }; }
function rect(img, x0, y0, x1, y1, c) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * img.width + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; } }

// 10 px per foot. Outer box 20..300 x 20..200, wall 6 px. Interior wall at x=160 with a 30 px doorway, and a
// horizontal wall at y=110 on the right with a doorway.
function plan() {
  const img = canvas(320, 220, OUT);
  rect(img, 20, 20, 300, 200, WALL); rect(img, 26, 26, 294, 194, FLOOR);
  rect(img, 157, 26, 163, 194, WALL); rect(img, 157, 80, 163, 110, FLOOR);          // vertical wall, doorway y 80-110
  rect(img, 163, 107, 294, 113, WALL); rect(img, 200, 107, 230, 113, FLOOR);         // horizontal wall, doorway x 200-230
  rect(img, 60, 60, 70, 70, WALL); rect(img, 240, 150, 250, 160, WALL);              // blue symbols inside rooms
  return img;
}

test('finds three rooms, ignores symbols and the outside', () => {
  const { rooms } = Detect.detect(plan(), { pxPerFt: 10, wall: WALL });
  assert.strictEqual(rooms.length, 3, JSON.stringify(rooms));
  const left = rooms.find((r) => r.x < 100), tr = rooms.find((r) => r.x > 100 && r.y < 100), br = rooms.find((r) => r.x > 100 && r.y > 100);
  assert.ok(left && tr && br);
  assert.ok(Math.abs(left.w - 131) <= 6 && Math.abs(left.h - 168) <= 6, 'left room ~131x168 px: ' + JSON.stringify(left));
  assert.ok(Math.abs(tr.w - 131) <= 6 && Math.abs(tr.h - 81) <= 6, 'top right ~131x81: ' + JSON.stringify(tr));
  assert.ok(Math.abs(br.w - 131) <= 6 && Math.abs(br.h - 81) <= 6, 'bottom right ~131x81: ' + JSON.stringify(br));
});

test('guesses the wall colour on its own', () => {
  const c = Detect.guessWallColor(plan());
  assert.ok(Math.abs(c[0] - WALL[0]) < 20 && Math.abs(c[1] - WALL[1]) < 20 && Math.abs(c[2] - WALL[2]) < 20, String(c));
  assert.strictEqual(Detect.detect(plan(), { pxPerFt: 10 }).rooms.length, 3);
});

test('an L-shaped room becomes two rectangles', () => {
  const img = canvas(260, 220, OUT);
  rect(img, 20, 20, 240, 200, WALL); rect(img, 26, 26, 234, 194, FLOOR);
  rect(img, 130, 26, 234, 110, WALL);   // solid block that carves an L out of the room (top-right notch)
  const { rooms } = Detect.detect(img, { pxPerFt: 10, wall: WALL });
  assert.ok(rooms.length >= 2, JSON.stringify(rooms));
  const area = rooms.reduce((s, r) => s + r.w * r.h, 0), truth = 208 * 168 - 104 * 84;
  assert.ok(area > truth * 0.9 && area <= truth * 1.02, `covers the L: ${area} vs ${truth}`);
});

test('requires a scale', () => { assert.throws(() => Detect.detect(plan(), {}), /pxPerFt/); });

test('outline of rectangles is a simplified rectilinear loop', () => {
  const o = Detect.outlineOfRects([{ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 6 }], 0.5);
  assert.strictEqual(o.length, 6, JSON.stringify(o));   // an L has six corners
  const xs = o.map((p) => p.x), ys = o.map((p) => p.y);
  assert.deepStrictEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [0, 20, 0, 10]);
});

test('big window gaps in an outer wall do not let the outside leak in (floor-colour route)', () => {
  const img = plan();
  rect(img, 20, 60, 26, 150, FLOOR);   // a 9 ft window gap in the left outer wall of the left room, floor-tinted like a door/window strip
  rect(img, 20, 60, 26, 150, [250, 250, 250]);
  const { rooms } = Detect.detect(img, { pxPerFt: 10 });
  assert.strictEqual(rooms.length, 3, JSON.stringify(rooms));
});

test('floor tint can differ in brightness from room to room (translucent plan over a photo)', () => {
  const img = plan();
  rect(img, 26, 26, 157, 194, [226, 236, 246]);     // left room darker, same blue tint
  rect(img, 163, 26, 294, 107, [244, 252, 255]);    // top right lighter
  const { rooms } = Detect.detect(img, { pxPerFt: 10 });
  assert.strictEqual(rooms.length, 3, JSON.stringify(rooms));
  const left = rooms.find((r) => r.x < 100);
  assert.ok(left.h > 160, 'left room is not cut short: ' + JSON.stringify(left));
});

test('white floors on a white page fall back to the wall-colour route', () => {
  const img = canvas(320, 220, [255, 255, 255]);
  rect(img, 20, 20, 300, 200, WALL); rect(img, 26, 26, 294, 194, [255, 255, 255]);
  rect(img, 157, 26, 163, 194, WALL); rect(img, 157, 80, 163, 110, [255, 255, 255]);
  const r = Detect.detect(img, { pxPerFt: 10, wall: WALL });
  assert.strictEqual(r.route, 'wall');
  assert.strictEqual(r.rooms.length, 2, JSON.stringify(r.rooms));
  assert.ok(r.outline.length >= 4);
});

test('outline of a detected plan is a closed rectilinear loop around the rooms', () => {
  const r = Detect.detect(plan(), { pxPerFt: 10 });
  const xs = r.outline.map((p) => p.x), ys = r.outline.map((p) => p.y);
  assert.ok(Math.min(...xs) <= 26 && Math.max(...xs) >= 294 && Math.min(...ys) <= 26 && Math.max(...ys) >= 194, JSON.stringify(r.outline));
});
