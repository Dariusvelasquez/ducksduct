const test = require('node:test');
const assert = require('node:assert');
const H = require('../hvac.js');

test('parseModel reads nominal tonnage from common model-number styles', () => {
  const cases = { '4TTR4036': 3, 'GSX140361': 3, '24ACC636A003': 3, 'XC21-048': 4, 'RA1460': 5, '4TTR4060': 5 };
  for (const [m, tons] of Object.entries(cases)) assert.strictEqual(H.parseModel(m).tons, tons, m);
  assert.strictEqual(H.parseModel('nonsense').tons, null);
});

test('ductDia sizes round duct from airflow', () => {
  assert.strictEqual(H.ductDia(0), 0);
  assert.strictEqual(H.ductDia(100), 5);   // 100 CFM at 700 fpm
  assert.strictEqual(H.ductDia(800), 14);
});

const rooms = [{ id: 'a', name: 'Bed', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', name: 'Den', x: 10, y: 0, w: 10, h: 10 }];
const cfg = { btuPerSqft: 30 };
function scenario(extra) {
  return {
    equip: [
      { id: 'ah', type: 'ahu', x: 0, y: 12, tons: 2 }, { id: 'cd', type: 'condenser', x: -5, y: 12, tons: 2 },
      { id: 's1', type: 'supply', x: 5, y: 5 }, { id: 's2', type: 'supply', x: 15, y: 5 }, ...(extra || []),
    ],
    ducts: [
      { id: 'r', kind: 'refrig', a: 'cd', b: 'ah' },
      { id: 'd1', kind: 'supply', a: 'ah', b: 's1' }, { id: 'd2', kind: 'supply', a: 'ah', b: 's2' },
    ],
  };
}

test('analyze: airflow splits across outlets and matches room load', () => {
  const a = H.analyze(scenario(), rooms, cfg);
  assert.strictEqual(a.total.systemCfm, 800);                // 2 ton x 400 CFM
  assert.strictEqual(a.eq.s1.cfm + a.eq.s2.cfm, 800);
  assert.strictEqual(a.rooms[0].required, 3000);              // 100 sqft x 30
  assert.strictEqual(a.rooms[0].delivered, 400 * 30);         // 400 CFM x 30 BTU/CFM
  assert.ok(Math.abs(a.rooms[0].pct - 4) < 1e-9);
  assert.strictEqual(a.total.installedTons, 2);
});

test('analyze: damper weights shift airflow; unconnected outlet is flagged', () => {
  const s = scenario([{ id: 's3', type: 'supply', x: 5, y: 8 }]);
  s.equip.find((e) => e.id === 's1').weight = 3;
  const a = H.analyze(s, rooms, cfg);
  assert.ok(a.eq.s1.cfm > a.eq.s2.cfm * 2.9);
  assert.ok(a.warnings.some((w) => /not connected/.test(w)));
});

test('analyze: No A/C rooms and corridors do not count toward required load', () => {
  const r = rooms.concat([{ id: 'c', name: 'Attic', x: 0, y: 20, w: 10, h: 10, noAC: true }, { id: 'h', name: 'Hall', x: 0, y: 30, w: 10, h: 4 }]);
  const a = H.analyze(scenario(), r, cfg);
  assert.strictEqual(a.total.requiredBtu, 6000);
  assert.ok(!a.warnings.some((w) => /Attic|Hall/.test(w)));
});
