const test = require('node:test');
const assert = require('node:assert');
const Layout = require('../layout.js');

const area = (r) => r.w * r.h;
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const CASES = [[60, 35, 3, 2], [70, 40, 4, 3], [48, 30, 2, 1], [34, 62, 3, 2], [55, 55, 3, 2]];

test('rooms never overlap and stay inside the bounding box', () => {
  for (const [W, D, b, ba] of CASES) {
    const { rooms } = Layout.buildHome(W, D, b, ba);
    rooms.forEach((r, i) => {
      assert.ok(r.w > 0 && r.h > 0, `${r.name} has size at ${W}x${D}`);
      assert.ok(r.x >= -0.01 && r.y >= -0.01 && r.x + r.w <= W + 0.5 && r.y + r.h <= D + 0.5, `${r.name} inside ${W}x${D}`);
      for (let j = i + 1; j < rooms.length; j++) assert.ok(overlap(r, rooms[j]) < 0.01, `${r.name} overlaps ${rooms[j].name} at ${W}x${D}`);
    });
  }
});

test('room areas add up to the outline area', () => {
  for (const [W, D, b, ba] of CASES) {
    const { rooms } = Layout.buildHome(W, D, b, ba);
    const sum = rooms.reduce((s, r) => s + area(r), 0), target = W * D * Layout.TEMPLATE_FRACTION;
    assert.ok(Math.abs(sum - target) / target < 0.06, `${W}x${D}: ${Math.round(sum)} vs ${Math.round(target)}`);
  }
});

test('base plan is a split-bedroom ranch with realistic room sizes', () => {
  const { rooms } = Layout.buildHome(60, 35, 3, 2);
  const by = Object.fromEntries(rooms.map((r) => [r.name, r]));
  const sqft = rooms.reduce((s, r) => s + area(r), 0);
  assert.ok(sqft > 1600 && sqft < 1850, 'about 1,700 sq ft: ' + sqft);
  assert.ok(area(by['Master Bed']) >= 200 && area(by['Master Bed']) <= 300, 'master 200-300 sq ft');
  assert.ok(area(by['Bed 2']) >= 100 && area(by['Bed 2']) <= 160 && area(by['Bed 3']) >= 100 && area(by['Bed 3']) <= 160, 'secondary bedrooms 100-160 sq ft');
  assert.ok(area(by['Kitchen']) >= 100 && area(by['Kitchen']) <= 200, 'kitchen size');
  assert.ok(area(by['Great Room']) >= 280 && area(by['Great Room']) <= 420, 'great room size');
  assert.ok(by['Hall'].h >= 3, 'hall at least 3 ft wide');
  // split plan: master suite is far from the other bedrooms, which are not in one straight row
  assert.ok(by['Master Bed'].x - (by['Bed 2'].x + by['Bed 2'].w) >= 20, 'master at the opposite end');
  assert.ok(by['Bed 3'].y >= by['Bed 2'].y + by['Bed 2'].h + 3, 'hall separates Bed 2 and Bed 3');
  // wet wall: kitchen touches laundry; laundry sits below the master bath
  assert.strictEqual(by['Kitchen'].x + by['Kitchen'].w, by['Laundry'].x);
  assert.strictEqual(by['Master Bath'].y + by['Master Bath'].h, by['Laundry'].y);
});

test('bed and bath counts change which rooms exist', () => {
  const names = (b, ba) => Layout.buildHome(60, 35, b, ba).rooms.map((r) => r.name);
  assert.ok(names(4, 2).includes('Bed 4') && !names(3, 2).includes('Bed 4'));
  assert.ok(names(2, 2).includes('Study') && !names(2, 2).includes('Bed 3'));
  assert.ok(!names(3, 1).includes('Master Bath') && names(3, 1).includes('Walk-in Closet'));
  assert.ok(names(3, 3).includes('Powder Bath'));
});

test('tall footprints turn the plan 90 degrees', () => {
  const { rooms, footprint } = Layout.buildHome(34, 62, 3, 2);
  assert.ok(Math.max(...footprint.map((p) => p.y)) > Math.max(...footprint.map((p) => p.x)));
  assert.ok(rooms.every((r) => r.x + r.w <= 34.5 && r.y + r.h <= 62.5));
});
