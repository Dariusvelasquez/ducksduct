/* Sizing table, equipment matching and quote list. Pure functions, no DOM. All numbers come from the catalog and
 * sizing tables passed in (config.js), so the company can change them without touching code. */
(function (root) {
  const round1 = (v) => Math.round(v * 10) / 10, money = (v) => Math.round(v * 100) / 100;

  // BTU per sq ft from the home-age and envelope tables in config.js
  function factor(sz, era, env) {
    const e = sz.era.find((x) => x.id === era) || sz.era[0], v = sz.envelope.find((x) => x.id === env) || sz.envelope.find((x) => x.mult === 1) || sz.envelope[0];
    return round1(e.btuPerSqft * v.mult);
  }
  // the newest era that started on or before the year built
  function eraFromYear(sz, year) {
    if (!(year > 0)) return null;
    let pick = sz.era[0];
    sz.era.forEach((e) => { if (year >= e.from && e.from >= pick.from) pick = e; });
    return pick.id;
  }
  // Tonnage suggestion for a floor area: exact tons, rounded up to the next half ton, and a +/-10% range.
  function suggest(sqft, btuPerSqft) {
    const btu = sqft * btuPerSqft, tons = btu / 12000, half = (v) => Math.max(1, Math.ceil(v * 2 - 1e-9) / 2);
    return { sqft, btu: Math.round(btu), tons: round1(tons), rounded: half(tons), low: Math.max(1, Math.floor(tons * 0.9 * 2 + 1e-9) / 2), high: half(tons * 1.1) };
  }

  // closest catalog item by a numeric field; ties go to the larger one
  function nearest(list, key, value) {
    return list.reduce((best, it) => (!best || Math.abs(it[key] - value) < Math.abs(best[key] - value) || (Math.abs(it[key] - value) === Math.abs(best[key] - value) && it[key] > best[key]) ? it : best), null);
  }
  // smallest catalog item that still covers the need (within 3%); the largest if none does
  function fitUp(list, key, value) {
    const ok = list.filter((it) => it[key] >= value * 0.97).sort((a, b) => a[key] - b[key]);
    return ok[0] || list.slice().sort((a, b) => b[key] - a[key])[0];
  }
  // what to suggest for one piece of equipment: { item, need, unit }
  function matchFor(cat, e, ctx) {
    if (e.type === 'condenser') return { item: fitUp(cat.condensers, 'tons', ctx.tons), need: ctx.tons, unit: 'ton' };
    if (e.type === 'ahu') return { item: fitUp(cat.airHandlers, 'tons', ctx.tons), need: ctx.tons, unit: 'ton' };
    if (e.type === 'head') return { item: fitUp(cat.heads, 'btu', ctx.btu), need: ctx.btu, unit: 'BTU' };
    return null;
  }

  const priceFor = (table, key) => (table && (table[key] != null ? table[key] : table.default != null ? table.default : 0)) || 0;

  /* Quote lines from a design. runs = [{ kind, dia, len, flex }] (feet, from the drawing); regDia = { equipmentId: duct dia in } */
  function quote(scn, an, cat, runs, regDia) {
    const map = new Map(), P = cat.parts, L = cat.labor;
    const add = (key, desc, qty, unit, unitPrice, hours) => {
      if (!(qty > 0)) return;
      const l = map.get(key) || { key, desc, qty: 0, unit, unitPrice, hours: 0 };
      l.qty += qty; l.hours += qty * (hours || 0); map.set(key, l);
    };
    scn.equip.forEach((e) => {
      if (e.type === 'condenser') {
        const it = nearest(cat.condensers, 'tons', e.tons);
        add('c:' + it.id, it.label, 1, 'ea', it.price, L.condenser); add('pad', P.pad.label, 1, 'ea', P.pad.price, 0); add('disc', P.disconnect.label, 1, 'ea', P.disconnect.price, 0);
      } else if (e.type === 'ahu') {
        const t = (an.eq[e.id] && an.eq[e.id].tons) || e.tons, it = nearest(cat.airHandlers, 'tons', t);
        add('a:' + it.id, it.label, 1, 'ea', it.price, L.ahu); add('drain', P.drainKit.label, 1, 'ea', P.drainKit.price, 0); add('filter', P.filterRack.label, 1, 'ea', P.filterRack.price, 0); add('tstat', P.thermostat.label, 1, 'ea', P.thermostat.price, 0);
      } else if (e.type === 'head') {
        const it = nearest(cat.heads, 'btu', e.btu || 12000);
        add('h:' + it.id, it.label, 1, 'ea', it.price, L.head); add('tstat', P.thermostat.label, 1, 'ea', P.thermostat.price, 0);
      } else if (e.type === 'supply') {
        const d = regDia[e.id] || 0;
        add('reg:' + d, `Supply register and boot${d ? ' ' + d + '"' : ''}`, 1, 'ea', priceFor(P.register, d), L.register);
      } else if (e.type === 'return') {
        add('grille:' + (e.size || '20x20'), `Return grille ${e.size || '20x20'}`, 1, 'ea', priceFor(P.grille, e.size || '20x20'), L.register);
      } else if (e.type === 'splitter') add('split', P.plenum.label, 1, 'ea', P.plenum.price, L.plenum);
    });
    (runs || []).forEach((r) => {
      if (r.kind === 'refrig') add('line', P.lineSet.label, r.len * 1.1, 'ft', P.lineSet.price, L.lineSetPerFt);
      else if (r.dia > 0) add(`duct:${r.kind}:${r.dia}:${r.flex ? 'f' : 'r'}`, `${r.kind === 'return' ? 'Return' : 'Supply'} ${r.flex ? 'flex ' : ''}duct ${r.dia}"`, r.len, 'ft', priceFor(P.ductPerFt, r.dia) * (r.flex ? 0.85 : 1), L.ductPerFt);
    });
    const lines = [...map.values()].map((l) => ({ ...l, qty: round1(l.qty), total: money(l.qty * l.unitPrice), hours: round1(l.hours) }));
    const materials = money(lines.reduce((s, l) => s + l.total, 0)), markup = money((materials * (cat.markupPct || 0)) / 100), tax = money(((materials + markup) * (cat.taxPct || 0)) / 100);
    const hours = round1(lines.reduce((s, l) => s + l.hours, 0)), labor = money(hours * (L.rate || 0));
    return { lines, materials, markup, tax, hours, labor, total: money(materials + markup + tax + labor) };
  }

  const csv = (q, name) => ['Item,Qty,Unit,Unit price,Total'].concat(q.lines.map((l) => [`"${l.desc.replace(/"/g, '""')}"`, l.qty, l.unit, l.unitPrice.toFixed(2), l.total.toFixed(2)].join(',')),
    [`Materials,,,,${q.materials.toFixed(2)}`, `Markup,,,,${q.markup.toFixed(2)}`, `Tax,,,,${q.tax.toFixed(2)}`, `Labor (${q.hours} h),,,,${q.labor.toFixed(2)}`, `Total,,,,${q.total.toFixed(2)}`]).join('\n') + (name ? `\n# ${name}\n` : '\n');

  const api = { factor, eraFromYear, suggest, nearest, fitUp, matchFor, quote, csv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sizing = api;
})(typeof window !== 'undefined' ? window : globalThis);
