const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const S = require('../sizing.js');
const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '../config.js'), 'utf8'), ctx);
const { sizing, catalog } = ctx.window.BRAND;

test('sizing factor comes from home age and envelope', () => {
  assert.strictEqual(S.factor(sizing, '1980', 'avg'), 30);
  assert.strictEqual(S.factor(sizing, 'pre1980', 'poor'), 38.1);
  assert.strictEqual(S.factor(sizing, '2016', 'good'), 19.8);
  assert.strictEqual(S.factor(sizing, 'nonsense', 'nonsense'), 34);   // falls back to the first row, average envelope
});

test('year built picks the right era', () => {
  assert.strictEqual(S.eraFromYear(sizing, 1965), 'pre1980');
  assert.strictEqual(S.eraFromYear(sizing, 1980), '1980');
  assert.strictEqual(S.eraFromYear(sizing, 1999), '1980');
  assert.strictEqual(S.eraFromYear(sizing, 2005), '2001');
  assert.strictEqual(S.eraFromYear(sizing, 2022), '2016');
  assert.strictEqual(S.eraFromYear(sizing, null), null);
});

test('tonnage suggestion rounds up to half tons and gives a range', () => {
  const s = S.suggest(1650, 30);               // 49,500 BTU = 4.125 ton
  assert.strictEqual(s.btu, 49500); assert.strictEqual(s.tons, 4.1); assert.strictEqual(s.rounded, 4.5);
  assert.ok(s.low <= 4 && s.high >= 4.5, JSON.stringify(s));
  assert.strictEqual(S.suggest(300, 30).rounded, 1);   // never below 1 ton
  assert.strictEqual(S.suggest(2400, 30).rounded, 6);
});

test('equipment matching picks sensible sizes', () => {
  assert.strictEqual(S.nearest(catalog.condensers, 'tons', 3.2).tons, 3);
  assert.strictEqual(S.fitUp(catalog.condensers, 'tons', 3.2).tons, 3.5);       // smallest that still covers the need
  assert.strictEqual(S.fitUp(catalog.condensers, 'tons', 3.5).tons, 3.5);
  assert.strictEqual(S.fitUp(catalog.condensers, 'tons', 9).tons, 5);           // nothing big enough: the largest
  assert.strictEqual(S.fitUp(catalog.heads, 'btu', 5700).btu, 9000);
  assert.strictEqual(S.fitUp(catalog.heads, 'btu', 13000).btu, 18000);
  assert.strictEqual(S.matchFor(catalog, { type: 'head' }, { btu: 10000 }).item.btu, 12000);
  assert.strictEqual(S.matchFor(catalog, { type: 'supply' }, {}), null);
});

const scn = {
  equip: [
    { id: 'c', type: 'condenser', tons: 3 }, { id: 'a', type: 'ahu', tons: 3 }, { id: 's1', type: 'supply' }, { id: 's2', type: 'supply' }, { id: 'r', type: 'return', size: '20x20' }, { id: 'sp', type: 'splitter' },
  ],
};
const an = { eq: { a: { tons: 3 } } };
const runs = [{ kind: 'supply', dia: 6, len: 10 }, { kind: 'supply', dia: 6, len: 5 }, { kind: 'return', dia: 14, len: 8, flex: true }, { kind: 'refrig', len: 20 }];

test('quote adds up equipment, parts, labor, markup and tax', () => {
  const q = S.quote(scn, an, catalog, runs, { s1: 6, s2: 6 });
  const by = (k) => q.lines.find((l) => l.key === k);
  assert.strictEqual(by('c:c3').total, 1950); assert.strictEqual(by('a:a3').total, 980);
  assert.strictEqual(by('reg:6').qty, 2); assert.strictEqual(by('duct:supply:6:r').qty, 15);
  assert.strictEqual(by('duct:return:14:f').unitPrice, 11 * 0.85);
  assert.ok(Math.abs(by('line').qty - 22) < 1e-9, 'line set has 10% slack');
  const mat = q.lines.reduce((s, l) => s + l.total, 0);
  assert.ok(Math.abs(q.materials - mat) < 0.011);
  assert.ok(Math.abs(q.markup - q.materials * 0.25) < 0.011);
  assert.ok(Math.abs(q.tax - (q.materials + q.markup) * 0.07) < 0.011);
  assert.ok(Math.abs(q.total - (q.materials + q.markup + q.tax + q.labor)) < 0.011);
  assert.ok(q.hours > 8 && q.labor === Math.round(q.hours * 85 * 100) / 100 || Math.abs(q.labor - q.hours * 85) < 1);
});

test('changing the design changes the quote, and CSV has a row per line plus totals', () => {
  const a = S.quote(scn, an, catalog, runs, { s1: 6, s2: 6 });
  const bigger = JSON.parse(JSON.stringify(scn)); bigger.equip[0].tons = 4;
  const b = S.quote(bigger, an, catalog, runs, { s1: 6, s2: 6 });
  assert.ok(b.total > a.total);
  const rows = S.csv(a, 'test').split('\n');
  assert.ok(rows.length >= a.lines.length + 6);
  assert.ok(rows[0].startsWith('Item,Qty'));
});
