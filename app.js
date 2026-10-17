(function () {
  const H = window.HVAC, L = window.Lookup;
  const $ = (s) => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const KEY = 'ductlayout.v1';
  const THEMES = {
    paper: { bg: '#fbfbf4', grid: '#8db8e0', gridOp: 0.45, line: '#111111', supply: '#1d3fc4', return: '#d21a1a', refrig: '#c48a00', sel: '#e6007e', ok: '#0a7a3d', warn: '#b36b00', bad: '#c4001a' },
    blueprint: { bg: '#0b3a6b', grid: '#ffffff', gridOp: 0.09, line: '#cfe3ff', supply: '#ff8a5c', return: '#5ce1ff', refrig: '#ffd75c', sel: '#ffffff', ok: '#3ecf8e', warn: '#f5b942', bad: '#ff6b6b' },
  };
  const COL = Object.assign({}, THEMES.paper);
  function applyTheme() { Object.assign(COL, THEMES[state.theme] || THEMES.paper); }
  const SIZE = { condenser: [3.6, 3.6], ahu: [2.4, 3.4], supply: [1.5, 1.5], return: [2.4, 2.4], splitter: [2.4, 2.4], head: [3.4, 1.1], scuttle: [1.8, 1.8], note: [7, 1.8] };
  const NAME = { condenser: 'Condenser', ahu: 'Air handler', supply: 'Outlet', return: 'Intake', splitter: 'Splitter', head: 'Mini-split', scuttle: 'Scuttle', note: 'Note' };

  let uidn = 0;
  const uid = (p) => p + Date.now().toString(36) + (++uidn);
  const num = (v, d) => (isFinite(parseFloat(v)) ? parseFloat(v) : d);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const state = {
    address: '', parcel: '', model: '', footprint: [], rooms: [],
    scenarios: { existing: { equip: [], ducts: [] }, proposed: { equip: [], ducts: [] } },
    active: 'existing', theme: 'paper', walls: [], listing: {}, underlay: null, draft: null, calib: [], cfg: { btuPerSqft: 30 }, curTons: 5, view: null, tool: 'select', sel: null, pending: null,
  };

  /* ---------- persistence ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ ...state, pending: null, sel: null, underlay: null, draft: null, calib: [] })); } catch (e) {} }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.rooms) { Object.assign(state, s, { pending: null, sel: null, tool: 'select', underlay: null, draft: null, calib: [], listing: s.listing || {} }); return true; } } catch (e) {}
    return false;
  }
  const scn = () => state.scenarios[state.active];

  /* ---------- geometry helpers ---------- */
  function bbox() {
    const xs = [], ys = [];
    state.footprint.forEach((p) => { xs.push(p.x); ys.push(p.y); });
    state.rooms.forEach((r) => { xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.h); });
    ['existing', 'proposed'].forEach((k) => state.scenarios[k].equip.forEach((e) => { xs.push(e.x); ys.push(e.y); }));
    const u = state.underlay;
    if (u) { xs.push(u.x, u.x + u.w); ys.push(u.y, u.y + u.h); }
    if (!xs.length) return { x: 0, y: 0, w: 60, h: 40 };
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function fit() {
    const b = bbox(), pad = 9;
    state.view = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  }
  function port(e, which) {
    const [w] = SIZE[e.type];
    if (e.type === 'ahu') return which === 'return' ? { x: e.x - w / 2, y: e.y } : { x: e.x + w / 2, y: e.y };
    return { x: e.x, y: e.y };
  }

  /* ---------- SVG drawing ---------- */
  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  let FS = 1; // label scale: smaller buildings get smaller text so labels don't pile up
  function label(parent, x, y, t, o) {
    o = o || {};
    const n = el('text', { x, y, 'font-size': (o.size || 1.15) * FS, fill: o.fill || COL.line, 'text-anchor': o.anchor || 'middle', 'font-family': 'ui-monospace,Menlo,monospace', 'font-weight': o.bold ? 700 : 400, 'pointer-events': 'none' }, parent, t);
    n.style.paintOrder = 'stroke'; n.setAttribute('stroke', COL.bg); n.setAttribute('stroke-width', '0.35');
    return n;
  }

  function drawEquip(g, e, a, interactive) {
    const [w, h] = SIZE[e.type];
    const info = a.eq[e.id] || {};
    const grp = el('g', { transform: `translate(${e.x} ${e.y})`, 'data-id': e.id, style: interactive ? 'cursor:move' : '' }, g);
    const sel = interactive && (state.sel === e.id || state.pending === e.id);
    const stroke = sel ? COL.sel : COL.line;
    const sw = sel ? 0.35 : 0.2;
    const box = (fill) => el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: fill || COL.bg, stroke, 'stroke-width': sw }, grp);
    const fmt = (v) => Math.round(v);
    if (e.type === 'condenser') {
      box(); el('circle', { r: w * 0.38, fill: 'none', stroke, 'stroke-width': 0.15 }, grp);
      for (let i = 0; i < 4; i++) el('path', { d: `M0 0 L${Math.cos(i * 1.571) * w * 0.38} ${Math.sin(i * 1.571) * w * 0.38}`, stroke, 'stroke-width': 0.15 }, grp);
      label(grp, 0, h / 2 + 1.4, `${e.label || 'CONDENSER'} ${e.tons}T`, { bold: true });
      label(grp, 0, -h / 2 - 0.7, 'OUTLET (fan discharge)', { size: 0.9, fill: COL.supply });
      label(grp, -w / 2 - 0.3, 0.3, 'INTAKE', { size: 0.9, anchor: 'end', fill: COL.return });
    } else if (e.type === 'ahu') {
      box(); el('rect', { x: -w / 2 + 0.4, y: -h / 2 + 0.4, width: w - 0.8, height: h - 0.8, fill: 'none', stroke, 'stroke-width': 0.1, 'stroke-dasharray': '0.4 0.3' }, grp);
      label(grp, 0, 0.35, 'AHU', { bold: true });
      label(grp, 0, h / 2 + 1.2, `${e.label || 'AIR HANDLER'} ${info.tons || e.tons}T`, { size: 0.9, bold: true });
      label(grp, -w / 2 - 0.4, -0.5, 'INTAKE', { size: 0.95, anchor: 'end', fill: COL.return, bold: true });
      label(grp, w / 2 + 0.4, -0.5, 'OUTLET', { size: 0.95, anchor: 'start', fill: COL.supply, bold: true });
    } else if (e.type === 'supply') {
      box(); el('path', { d: `M${-w / 2} ${-h / 2}L${w / 2} ${h / 2}M${w / 2} ${-h / 2}L${-w / 2} ${h / 2}`, stroke: COL.supply, 'stroke-width': 0.15 }, grp);
      const dd = a.eqDia && a.eqDia[e.id];
      label(grp, 0, -h / 2 - 0.5, `OUTLET${dd ? ' ' + dd + '"' : ''}`, { size: 0.85, fill: COL.supply, bold: true });
      label(grp, 0, h / 2 + 1, `${fmt(info.cfm || 0)} CFM`, { size: 0.75, fill: COL.supply });
    } else if (e.type === 'return') {
      el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: COL.bg, stroke: sel ? COL.sel : COL.return, 'stroke-width': 0.35 }, grp);
      label(grp, 0, 0.55, 'R', { size: 1.7, bold: true, fill: COL.return });
      label(grp, 0, -h / 2 - 0.5, `INTAKE ${e.size || '20x20'}`, { size: 0.85, fill: COL.return, bold: true });
      label(grp, 0, h / 2 + 1, `${fmt(info.cfm || 0)} CFM`, { size: 0.75, fill: COL.return });
} else if (e.type === 'splitter') {
      el('path', { d: `M${-w / 2} ${-h / 2}L${w / 2} 0L${-w / 2} ${h / 2}Z`, fill: COL.bg, stroke: sel ? COL.sel : COL.supply, 'stroke-width': 0.3 }, grp);
      label(grp, 0, h / 2 + 1, 'PLENUM / SPLIT', { size: 0.75, fill: COL.supply });
} else if (e.type === 'head') {
      box(); for (let i = 0; i < 3; i++) el('path', { d: `M${-w / 2 + 0.3} ${-0.2 + i * 0.25}H${w / 2 - 0.3}`, stroke: COL.supply, 'stroke-width': 0.1 }, grp);
      label(grp, 0, -h / 2 - 0.5, `${e.label || 'MINI-SPLIT'} · OUTLET ${Math.round((e.btu || 0) / 1000)}k BTU`, { size: 0.9, fill: COL.supply });
    } else if (e.type === 'scuttle') {
      box(); el('path', { d: `M${-w / 2} ${-h / 2}L${w / 2} ${h / 2}M${w / 2} ${-h / 2}L${-w / 2} ${h / 2}`, stroke, 'stroke-width': 0.12 }, grp);
      label(grp, w / 2 + 0.4, 0.35, e.label || 'Scuttle', { size: 1, anchor: 'start', bold: true });
    } else if (e.type === 'note') {
      el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: 'transparent', stroke: sel ? COL.sel : 'none', 'stroke-width': 0.2, 'stroke-dasharray': '0.4 0.3' }, grp);
      label(grp, 0, 0.5, e.label || 'Note', { size: e.fs || 1.5, bold: true });
    }
    return grp;
  }

  function ductPath(a, b, kind) {
    return `M${a.x} ${a.y}V${b.y}H${b.x}`;
  }

  function renderPlan(svg, key, interactive) {
    const s = state.scenarios[key];
    const a = H.analyze(s, state.rooms, state.cfg);
    { const xs = state.rooms.flatMap((r) => [r.x, r.x + r.w]), ys = state.rooms.flatMap((r) => [r.y, r.y + r.h]); const span = xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 50; FS = Math.max(0.6, Math.min(1, span / 50)); }
    const v = state.view || { x: 0, y: 0, w: 60, h: 40 };
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.innerHTML = '';
    svg.style.background = COL.bg;
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'g' + svg.id, width: 2, height: 2, patternUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M2 0H0V2', fill: 'none', stroke: COL.grid, 'stroke-opacity': COL.gridOp, 'stroke-width': 0.06 }, pat);
    const hat = el('pattern', { id: 'h' + svg.id, width: 1.2, height: 1.2, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('path', { d: 'M0 0V1.2', stroke: COL.line, 'stroke-opacity': 0.3, 'stroke-width': 0.2 }, hat);
    el('rect', { x: v.x - 500, y: v.y - 500, width: v.w + 1000, height: v.h + 1000, fill: `url(#g${svg.id})`, 'data-bg': 1 }, svg);

    const U = state.underlay;
    if (interactive && U && U.show) el('image', { href: U.url, x: U.x, y: U.y, width: U.w, height: U.h, opacity: U.op, preserveAspectRatio: 'none', 'pointer-events': 'none' }, svg);
    if (state.footprint.length) el('path', { d: 'M' + state.footprint.map((p) => `${p.x} ${p.y}`).join('L') + 'Z', fill: 'none', stroke: COL.line, 'stroke-width': 0.8, 'stroke-linejoin': 'miter', 'pointer-events': 'none' }, svg);
    state.rooms.forEach((r) => {
      const row = a.rooms.find((x) => x.id === r.id);
      const cls = row ? (row.pct < 0.85 ? COL.bad : row.pct > 1.25 ? COL.warn : COL.ok) : COL.line;
      el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: r.noAC ? `url(#h${svg.id})` : 'none', stroke: COL.line, 'stroke-opacity': r.noAC ? 0.9 : 0.55, 'stroke-width': r.noAC ? 0.5 : 0.15, 'stroke-dasharray': r.noAC ? '' : '0.6 0.4', 'pointer-events': 'none' }, svg);
      label(svg, r.x + r.w / 2, r.y + 1.7, r.name.toUpperCase(), { size: 1.05, bold: true });
      if (r.noAC) { label(svg, r.x + r.w / 2, r.y + r.h / 2 + 1, 'NO A/C', { size: Math.min(4, r.w / 7), bold: true }); return; }
      label(svg, r.x + r.w / 2, r.y + 3, `${Math.round(H.roomSqft(r))} sf · need ${(row ? row.required / 1000 : 0).toFixed(1)}k`, { size: 0.85 });
      if (row) label(svg, r.x + r.w / 2, r.y + 4.2, `${Math.round(row.pct * 100)}% served`, { size: 0.85, fill: cls });
    });

    (state.walls || []).forEach((w) => {
      el('line', { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, stroke: COL.line, 'stroke-width': w.removed ? 0.9 : 0.7, 'stroke-dasharray': w.removed ? '0.25 0.45' : '', 'stroke-linecap': 'butt', 'pointer-events': 'none' }, svg);
      if (w.removed) label(svg, (w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2 - 1, 'WALL REMOVED', { size: 0.8, bold: true });
    });
    const byId = Object.fromEntries(s.equip.map((e) => [e.id, e]));
    a.eqDia = {};
    const items = [];
    s.ducts.forEach((d) => {
      const A = byId[d.a], B = byId[d.b];
      if (!A || !B) return;
      const pa = port(A, d.kind), pb = port(B, d.kind);
      const cfm = a.ductFlow[d.id] || 0;
      const dia = d.dia > 0 ? d.dia : H.ductDia(cfm);
      const toOutlet = B.type === 'supply' || B.type === 'return' || A.type === 'supply' || A.type === 'return';
      const dpath = d.kind === 'refrig' ? `M${pa.x} ${pa.y}L${pb.x} ${pb.y}` : d.flex ? `M${pa.x} ${pa.y}Q${pa.x} ${pb.y} ${pb.x} ${pb.y}` : toOutlet ? ductPath(pa, pb, d.kind) : `M${pa.x} ${pa.y}H${pb.x}V${pb.y}`;
      const wFt = d.kind === 'refrig' ? 0.2 : Math.max(0.9, dia / 12);
      [A, B].forEach((q) => { if ((q.type === 'supply' || q.type === 'return') && dia) a.eqDia[q.id] = Math.max(a.eqDia[q.id] || 0, dia); });
      items.push({ d, pa, pb, cfm, dia, toOutlet, dpath, wFt });
    });
    const rigid = items.filter((p) => p.d.kind !== 'refrig' && !p.d.flex);
    rigid.forEach((p) => el('path', { d: p.dpath, fill: 'none', stroke: COL[p.d.kind], 'stroke-width': p.wFt + 0.3, 'stroke-linejoin': 'round' }, svg));
    rigid.forEach((p) => el('path', { d: p.dpath, fill: 'none', stroke: COL.bg, 'stroke-width': Math.max(0.3, p.wFt - 0.05), 'stroke-linejoin': 'round' }, svg));
    items.forEach((p) => {
      const d = p.d;
      if (d.kind === 'refrig') el('path', { d: p.dpath, fill: 'none', stroke: COL.refrig, 'stroke-width': 0.25, 'stroke-dasharray': '1 0.6', 'pointer-events': 'none' }, svg);
      else if (d.flex) el('path', { d: p.dpath, fill: 'none', stroke: COL[d.kind], 'stroke-width': 0.4, 'stroke-linecap': 'round', 'pointer-events': 'none' }, svg);
      if (interactive) el('path', { d: p.dpath, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(1.4, p.wFt), 'data-duct': d.id, style: 'cursor:pointer' }, svg);
      if (d.kind !== 'refrig' && p.dia > 0) {
        const txt = `${p.dia}"`;
        if (d.flex) label(svg, (p.pa.x + p.pb.x) / 2 - 1.2, (p.pa.y + p.pb.y) / 2 - 1, txt, { size: 1.2, bold: true, fill: COL[d.kind] });
        else if (p.toOutlet) label(svg, p.pa.x + p.wFt / 2 + 0.5, (p.pa.y + p.pb.y) / 2 + 0.4, txt, { size: 1.05, bold: true, anchor: 'start', fill: COL[d.kind] });
        else label(svg, (p.pa.x + p.pb.x) / 2, p.pa.y - p.wFt / 2 - 0.5, txt, { size: 1.15, bold: true, fill: COL[d.kind] });
      }
      if (interactive && state.sel === d.id) el('path', { d: p.dpath, fill: 'none', stroke: COL.sel, 'stroke-width': 0.3, 'stroke-dasharray': '0.4 0.4', 'pointer-events': 'none' }, svg);
    });
    s.equip.forEach((e) => drawEquip(svg, e, a, interactive));
    if (interactive) {
      const dr = state.draft;
      if (dr && dr.kind === 'room') el('rect', { x: dr.x, y: dr.y, width: dr.w, height: dr.h, fill: COL.sel, 'fill-opacity': 0.1, stroke: COL.sel, 'stroke-width': 0.3, 'stroke-dasharray': '0.6 0.4', 'pointer-events': 'none' }, svg);
      if (dr && dr.kind === 'wall') el('line', { x1: dr.x1, y1: dr.y1, x2: dr.x2, y2: dr.y2, stroke: COL.sel, 'stroke-width': 0.6, 'pointer-events': 'none' }, svg);
      state.calib.forEach((c) => el('circle', { cx: c.x, cy: c.y, r: 0.6, fill: COL.sel, 'pointer-events': 'none' }, svg));
      if (dr && dr.kind === 'room') label(svg, dr.x + dr.w / 2, dr.y + dr.h / 2, `${dr.w} × ${dr.h} ft`, { size: 1.1, bold: true });
    }
    label(svg, v.x + 1.5, v.y + v.h * 0.07, key === 'proposed' ? 'After' : 'Before', { size: Math.max(2.2, v.h * 0.06), bold: true, anchor: 'start', fill: COL.warn });
    if (state.address) label(svg, v.x + v.w - 1.5, v.y + v.h - 1.5, state.address.split(',').slice(0, 2).join(','), { size: Math.max(1.4, v.h * 0.03), bold: true, anchor: 'end' });
    return a;
  }

  /* ---------- results / properties ---------- */
  const pctText = (r) => (r.noAC ? 'no A/C' : r.transfer ? 'transfer' : Math.round(r.pct * 100) + '%');
  const pctCls = (p) => (p < 0.85 ? 'bad' : p > 1.25 ? 'warn' : 'ok');
  function tonsLabel(t) { return (Math.round(t * 10) / 10).toString(); }
  function recommend(a) { return Math.ceil(a.total.requiredTons * 2) / 2; }

  function statCards(a) {
    const t = a.total;
    const overCls = t.oversize > 1.25 ? 'warn' : t.oversize < 0.9 ? 'bad' : 'ok';
    return `<div class="card"><b>${tonsLabel(t.installedTons)} T</b><span>Installed (${Math.round(t.installedBtu / 1000)}k BTU)</span></div>
      <div class="card"><b>${tonsLabel(t.requiredTons)} T</b><span>Calculated need</span></div>
      <div class="card"><b>${Math.round(t.sqftPerTon)}</b><span>sq ft per ton</span></div>
      <div class="card"><b class="${overCls}">${Math.round(t.oversize * 100)}%</b><span>Installed vs. need</span></div>`;
  }

  function recordNote() {
    const r = state.record; if (!r) return '';
    const drawn = Math.round(condArea());
    const bits = [r.county + ' record', r.sqft && `${r.sqft} sf heated`, r.beds && `${r.beds} bd`, r.baths && `${r.baths} ba`, r.yearBuilt && `built ${r.yearBuilt}`].filter(Boolean).join(' · ');
    const off = r.sqft && Math.abs(drawn - r.sqft) / r.sqft > 0.05;
    return `<p class="muted">${esc(bits)}${r.note ? ' · ' + esc(r.note) : ''}${off ? `<br>Drawn rooms total ${drawn} sf vs ${r.sqft} sf on record. <button id="btnScale">Scale rooms to record</button>` : ''}</p>`;
  }

  function renderResults() {
    const a = H.analyze(scn(), state.rooms, state.cfg);
    const rows = a.rooms.map((r) => `<tr><td>${esc(r.name)}</td><td>${Math.round(r.sqft)}</td><td>${Math.round(r.required)}</td><td>${Math.round(r.cfm)}</td><td>${Math.round(r.delivered)}</td><td class="${pctCls(r.pct)}">${pctText(r)}</td></tr>`).join('');
    const t = a.total;
    $('#results').innerHTML = `<h2>${state.active === 'existing' ? 'Existing' : 'Proposed'} system</h2>${recordNote()}
      <div class="cards">${statCards(a)}</div>
      <table><tr><th>Room</th><th>sf</th><th>Need BTU</th><th>CFM</th><th>Out BTU</th><th>Match</th></tr>${rows}
      <tr><td><b>Total</b></td><td>${Math.round(t.sqft)}</td><td>${Math.round(t.requiredBtu)}</td><td>${Math.round(t.systemCfm)}</td><td>${Math.round(t.deliveredBtu)}</td><td></td></tr></table>
      <p class="muted">Recommended capacity for this footprint: <b>${recommend(a)} ton</b> (rule-of-thumb ${state.cfg.btuPerSqft} BTU/sqft). Match = delivered / needed: under 85% is starved, over 125% is oversupplied.</p>
      ${a.warnings.length ? '<ul class="warns">' + a.warnings.map((w) => `<li>${esc(w)}</li>`).join('') + '</ul>' : ''}`;
  }

  const condArea = () => state.rooms.filter((x) => !x.noAC).reduce((t, x) => t + x.w * x.h, 0);
  function scaleToRecord() { if (state.record && state.record.sqft) scaleToSqft(state.record.sqft); }
  function scaleToSqft(target) {
    const drawn = condArea(); if (!drawn || !(target > 0)) return;
    const f = Math.sqrt(target / drawn);
    const sc = (v) => +(v * f).toFixed(1);
    state.rooms.forEach((x) => { x.x = sc(x.x); x.y = sc(x.y); x.w = sc(x.w); x.h = sc(x.h); });
    state.footprint.forEach((q) => { q.x = sc(q.x); q.y = sc(q.y); });
    state.walls.forEach((w) => { w.x1 = sc(w.x1); w.y1 = sc(w.y1); w.x2 = sc(w.x2); w.y2 = sc(w.y2); });
    ['existing', 'proposed'].forEach((k) => state.scenarios[k].equip.forEach((e) => { e.x = sc(e.x); e.y = sc(e.y); }));
    fit(); renderRooms(); renderWalls(); renderAll();
  }

  function renderProps() {
    const body = $('#propBody');
    const s = scn();
    const e = s.equip.find((x) => x.id === state.sel);
    const d = s.ducts.find((x) => x.id === state.sel);
    if (d) {
      body.className = '';
      const auto = H.ductDia(H.analyze(s, state.rooms, state.cfg).ductFlow[d.id] || 0);
      body.innerHTML = `<b>${d.kind} duct</b>` + (d.kind === 'refrig' ? '' : `<label>Diameter (in, blank = auto ${auto || '-'}")<input data-dk="dia" type="number" step="1" value="${d.dia || ''}"></label><label><input data-dk="flex" type="checkbox" ${d.flex ? 'checked' : ''} style="width:auto"> Flex duct (curved)</label>`) + `<button class="x" data-del>Delete</button>`;
      return;
    }
    if (!e) { body.className = 'muted'; body.textContent = 'Nothing selected'; return; }
    body.className = '';
    const a = H.analyze(s, state.rooms, state.cfg).eq[e.id] || {};
    const f = (k, lbl, step) => `<label>${lbl}<input data-k="${k}" type="number" step="${step || 0.5}" value="${e[k] == null ? '' : e[k]}"></label>`;
    let h = `<b>${NAME[e.type]}</b><label>Label<input data-k="label" data-t="text" value="${esc(e.label || '')}"></label>`;
    if (e.type === 'condenser' || e.type === 'ahu') h += f('tons', 'Capacity (tons)', 0.5);
    if (e.type === 'ahu') h += f('cfm', 'Airflow override (CFM, blank = 400/ton)', 25) + `<p class="muted">Airflow now: ${Math.round(a.cfm || 0)} CFM</p>`;
    if (e.type === 'head') h += f('btu', 'Capacity (BTU/h)', 1000);
    if (e.type === 'return') h += `<label>Grille size<input data-k="size" data-t="text" value="${esc(e.size || '20x20')}"></label>`;
    if (e.type === 'supply') h += f('weight', 'Damper balance weight (higher = more air)', 0.5);
    if (e.type === 'supply' || e.type === 'return') h += `<p class="muted">Airflow: ${Math.round(a.cfm || 0)} CFM · ${H.ductDia(a.cfm || 0)}" round duct</p>`;
    h += `<div class="row"><label>X ft<input data-k="x" type="number" step="0.5" value="${e.x}"></label><label>Y ft<input data-k="y" type="number" step="0.5" value="${e.y}"></label></div><button class="x" data-del>Delete item</button>`;
    body.innerHTML = h;
  }

  function renderRooms() {
    $('#roomTable').innerHTML = '<table><tr><th>Name</th><th>X</th><th>Y</th><th>W</th><th>D</th><th>A/C</th><th></th></tr>' + state.rooms.map((r) => `<tr data-room="${r.id}"><td><input class="nm" data-rk="name" value="${esc(r.name)}"></td>${['x', 'y', 'w', 'h'].map((k) => `<td><input data-rk="${k}" type="number" step="0.5" value="${r[k]}" style="width:44px"></td>`).join('')}<td><input data-rk="ac" type="checkbox" ${r.noAC ? '' : 'checked'} style="width:auto"></td><td><button class="x" data-rdel>×</button></td></tr>`).join('') + '</table>';
  }

  function renderXcheck() {
    const drawn = Math.round(condArea()), r = state.record || {}, l = state.listing || {};
    const rows = [['Drawn rooms (A/C)', drawn, null], [(r.county || 'County') + ' record', r.sqft, 'rec'], ['Listing', l.sqft, 'lst']].filter((x) => x[1]);
    let h = '<table><tr><th>Source</th><th>sq ft</th><th>vs drawn</th><th></th></tr>' + rows.map(([n, v, k]) => {
      const d = drawn ? (v - drawn) / drawn : 0, cls = k && Math.abs(d) > 0.1 ? 'warn' : '';
      return `<tr><td>${esc(n)}</td><td>${Math.round(v)}</td><td class="${cls}">${k ? (d >= 0 ? '+' : '') + Math.round(d * 100) + '%' : ''}</td><td>${k ? `<button data-useq="${v}">Scale</button>` : ''}</td></tr>`;
    }).join('') + '</table>';
    const notes = [];
    if (r.sqft && l.sqft && Math.abs(r.sqft - l.sqft) / r.sqft > 0.1) notes.push(`Record and listing differ by ${Math.round(Math.abs(r.sqft - l.sqft))} sq ft. Listings often count garages, porches or additions, so confirm on site.`);
    if (r.beds && l.beds && r.beds !== l.beds) notes.push(`Beds: record ${r.beds} vs listing ${l.beds}.`);
    if (r.baths && l.baths && r.baths !== l.baths) notes.push(`Baths: record ${r.baths} vs listing ${l.baths}.`);
    $('#xcheck').innerHTML = h + notes.map((n) => `<p class="warn">${esc(n)}</p>`).join('');
    const q = encodeURIComponent(state.address || ''), dash = (state.address || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    $('#lnkZ').href = 'https://www.zillow.com/homes/' + dash + '_rb/';
    $('#lnkR').href = 'https://www.realtor.com/realestateandhomes-search/' + dash;
  }

  function renderWalls() {
    $('#wallTable').innerHTML = '<table><tr><th>X1</th><th>Y1</th><th>X2</th><th>Y2</th><th>rem</th><th></th></tr>' + (state.walls || []).map((w) => `<tr data-wall="${w.id}">${['x1', 'y1', 'x2', 'y2'].map((k) => `<td><input data-wk="${k}" type="number" step="0.5" value="${w[k]}" style="width:42px"></td>`).join('')}<td><input data-wk="removed" type="checkbox" ${w.removed ? 'checked' : ''} style="width:auto"></td><td><button class="x" data-wdel>×</button></td></tr>`).join('') + '</table>';
  }

  function renderAll() {
    document.body.dataset.theme = state.theme;
    renderPlan($('#plan'), state.active, true);
    renderResults(); renderProps(); renderXcheck();
    document.querySelectorAll('#scnSeg button').forEach((b) => b.classList.toggle('on', b.dataset.scn === state.active));
    document.querySelectorAll('#toolSeg button').forEach((b) => b.classList.toggle('on', b.dataset.tool === state.tool));
    $('#plan').style.cursor = state.tool === 'select' ? 'grab' : 'crosshair';
    save();
  }
  function refreshLight() { renderPlan($('#plan'), state.active, true); renderResults(); save(); }

  /* ---------- building rooms and layouts ---------- */
  function autoRooms(w, d, beds, baths) {
    const hallH = Math.min(6, d * 0.16), topH = (d - hallH) * 0.45, botH = d - hallH - topH;
    const rooms = [];
    const top = [];
    for (let i = 0; i < beds; i++) top.push({ name: i === 0 ? 'Master Bed' : `Bed ${i + 1}`, wt: i === 0 ? 1.3 : 1 });
    for (let i = 0; i < baths; i++) top.push({ name: baths > 1 ? `Bath ${i + 1}` : 'Bath', wt: 0.55 });
    const bot = [{ name: 'Living', wt: 1.4 }, { name: 'Kitchen', wt: 1 }, { name: 'Dining', wt: 0.9 }];
    const strip = (items, y, hh) => {
      const tw = items.reduce((s, i) => s + i.wt, 0); let x = 0;
      items.forEach((i) => { const ww = (w * i.wt) / tw; rooms.push({ id: uid('r'), name: i.name, x: +x.toFixed(1), y: +y.toFixed(1), w: +ww.toFixed(1), h: +hh.toFixed(1), ceiling: 8 }); x += ww; });
    };
    strip(top, 0, topH);
    rooms.push({ id: uid('r'), name: 'Hall', x: 0, y: +topH.toFixed(1), w, h: +hallH.toFixed(1), ceiling: 8 });
    strip(bot, topH + hallH, botH);
    return rooms;
  }

  function autoLayout(key, opts) {
    opts = opts || {};
    const s = state.scenarios[key];
    const b = bbox();
    const rooms = state.rooms;
    const hall = rooms.find((r) => /hall/i.test(r.name)) || rooms[0];
    const ahuAt = hall ? { x: hall.x + 4, y: hall.y + hall.h / 2 } : { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const fpMaxX = state.footprint.length ? Math.max(...state.footprint.map((p) => p.x)) : b.x + b.w;
    const mk = (type, x, y, extra) => Object.assign({ id: uid('e'), type, x: +x.toFixed(1), y: +y.toFixed(1) }, extra);
    const tons = opts.tons || state.curTons;
    const ahu = mk('ahu', ahuAt.x, ahuAt.y, { tons, label: 'AIR HANDLER' });
    const cond = mk('condenser', fpMaxX + 5, ahuAt.y, { tons, label: 'CONDENSER' });
    s.equip = [ahu, cond]; s.ducts = [{ id: uid('d'), kind: 'refrig', a: cond.id, b: ahu.id }];
    const regs = [];
    rooms.forEach((r) => {
      if (r === hall || r.noAC) return;
      const n = r.w * r.h > 300 ? 2 : 1;
      const wt = Math.max(0.5, Math.round((H.roomLoadBtu(r, state.cfg) / n / 1000) * 10) / 10);
      for (let i = 0; i < n; i++) regs.push(mk('supply', r.x + (r.w * (i + 1)) / (n + 1), r.y + r.h / 2 + 2.5, { room: r.id, weight: wt }));
    });
    s.equip.push(...regs);
    const ret = mk('return', ahuAt.x + 4, hall.y + hall.h + 4, { size: '20x20' });
    s.equip.push(ret);
    s.ducts.push({ id: uid('d'), kind: 'return', a: ret.id, b: ahu.id, flex: true });
    if (opts.splitters) {
      regs.sort((p, q) => p.x - q.x);
      for (let i = 0; i < regs.length; i += 3) {
        const chunk = regs.slice(i, i + 3);
        const cx = chunk.reduce((t, r) => t + r.x, 0) / chunk.length, cy = chunk.reduce((t, r) => t + r.y, 0) / chunk.length;
        const sp = mk('splitter', cx, ahuAt.y);
        s.equip.push(sp);
        s.ducts.push({ id: uid('d'), kind: 'supply', a: ahu.id, b: sp.id });
        chunk.forEach((r) => s.ducts.push({ id: uid('d'), kind: 'supply', a: sp.id, b: r.id }));
      }
    } else regs.forEach((r) => s.ducts.push({ id: uid('d'), kind: 'supply', a: ahu.id, b: r.id }));
  }

  function setFootprintAndRooms(fp, beds, baths) {
    state.footprint = fp; state.walls = []; state.generated = true;
    const w = Math.max(...fp.map((p) => p.x)), d = Math.max(...fp.map((p) => p.y));
    state.rooms = autoRooms(w, d, beds, baths);
    autoLayout('existing', { tons: state.curTons });
    autoLayout('proposed', { tons: Math.max(1.5, state.curTons - 1), splitters: true });
    fit(); renderRooms(); renderWalls(); renderAll();
  }

  // Real job recreated from a hand sketch. Proposed = the sketched "After" layout; Existing = placeholder (same duct layout, 3 ton).
  function loadExample(ex) {
    const ids = {};
    const id = (k, p) => ids[k] || (ids[k] = uid(p));
    state.address = ex.address; state.parcel = ex.parcel; state.model = ''; state.curTons = 3; state.generated = false;
    state.footprint = ex.footprint.map((p) => ({ ...p }));
    state.rooms = ex.rooms.map((r) => ({ id: id(r.k, 'r'), name: r.name, x: r.x, y: r.y, w: r.w, h: r.h, ceiling: 8, noAC: !!r.noAC }));
    state.walls = ex.walls.map((w) => ({ id: uid('w'), ...w }));
    const build = (tons, keepSizes) => ({
      equip: ex.equip.map((e) => { const { k, ...rest } = e; const o = { id: id(k, 'e'), ...rest }; if (o.type === 'ahu' || o.type === 'condenser') o.tons = tons; return o; }),
      ducts: ex.ducts.map((d) => { const o = { id: uid('d'), kind: d.kind, a: id(d.a, 'e'), b: id(d.b, 'e') }; if (d.flex) o.flex = true; if (keepSizes && d.dia) o.dia = d.dia; return o; }),
    });
    state.scenarios.proposed = build(2, true);
    state.scenarios.existing = build(3, false);
    state.record = { county: 'Pinellas', parcelId: ex.parcel, source: 'Florida DOR statewide parcels', note: 'Parcel number matched exactly. Pinellas data has no living area: enter the listing sq ft under Cross-check and press Scale.' };
    state.listing = {}; ['lsSqft', 'lsBeds', 'lsBaths'].forEach((i) => ($('#' + i).value = ''));
    state.active = 'proposed'; state.sel = state.pending = null; state.underlay = null;
    $('#address').value = state.address; $('#parcel').value = state.parcel; $('#model').value = ''; $('#curTons').value = '3';
    setStatus('Example loaded. Scale assumed from the building outline (~27 ft wide). Confirm with the listing sq ft.');
    fit(); renderRooms(); renderWalls(); renderAll();
  }

  function loadSample() {
    state.address = '123 Sample St'; state.parcel = '30-4102-001-0010'; state.model = '4TTR4060'; state.curTons = 5;
    $('#address').value = state.address; $('#parcel').value = state.parcel; $('#model').value = state.model;
    $('#curTons').value = '5';
    setFootprintAndRooms(L.rectFootprint(54, 36), 3, 2);
  }

  /* ---------- editing ---------- */
  function svgPoint(svg, ev) {
    const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  const snap = (v) => Math.round(v * 2) / 2;

  function addEquip(type) {
    const v = state.view || { x: 0, y: 0, w: 60, h: 40 };
    const e = { id: uid('e'), type, x: snap(v.x + v.w / 2), y: snap(v.y + v.h / 2), label: '' };
    if (type === 'condenser' || type === 'ahu') e.tons = state.curTons;
    if (type === 'head') e.btu = 12000;
    if (type === 'note') e.label = 'Note';
    if (type === 'return') e.size = '20x20';
    scn().equip.push(e); state.sel = e.id; renderAll();
  }

  function linkClick(id) {
    const s = scn();
    if (!state.pending) { state.pending = id; renderAll(); return; }
    const a = state.pending; state.pending = null;
    const A = s.equip.find((e) => e.id === a), B = s.equip.find((e) => e.id === id);
    let ok = A && B && a !== id;
    if (ok && state.tool === 'refrig') ok = (A.type === 'condenser' && (B.type === 'ahu' || B.type === 'head')) || (B.type === 'condenser' && (A.type === 'ahu' || A.type === 'head'));
    if (ok && state.tool === 'supply') ok = A.type !== 'return' && B.type !== 'return' && A.type !== 'condenser' && B.type !== 'condenser';
    if (ok && state.tool === 'return') ok = A.type !== 'supply' && B.type !== 'supply' && A.type !== 'condenser' && B.type !== 'condenser';
    if (ok && s.ducts.some((d) => d.kind === state.tool && ((d.a === a && d.b === id) || (d.a === id && d.b === a)))) ok = false;
    if (ok) s.ducts.push({ id: uid('d'), kind: state.tool, a, b: id });
    else $('#hint').textContent = 'That connection is not valid (outlets only take supply ducts, intakes only return ducts, refrigerant joins condenser to air handler or mini-split).';
    renderAll();
  }

  function removeSel() {
    const s = scn();
    if (!state.sel) return;
    s.equip = s.equip.filter((e) => e.id !== state.sel);
    s.ducts = s.ducts.filter((d) => d.id !== state.sel && s.equip.some((e) => e.id === d.a) && s.equip.some((e) => e.id === d.b));
    state.sel = null; renderAll();
  }

  function bindPlan() {
    const svg = $('#plan');
    let drag = null;
    svg.addEventListener('pointerdown', (ev) => {
      const g = ev.target.closest('[data-id]'), du = ev.target.closest('[data-duct]');
      const p = svgPoint(svg, ev);
      if (g) {
        const id = g.dataset.id;
        if (['supply', 'return', 'refrig'].includes(state.tool)) { linkClick(id); return; }
        if (state.tool !== 'select') { startTrace(p, ev); ev.preventDefault(); return; }
        const e = scn().equip.find((x) => x.id === id);
        state.sel = id; drag = { kind: 'eq', e, dx: p.x - e.x, dy: p.y - e.y }; renderAll();
      } else if (du && state.tool === 'select') { state.sel = du.dataset.duct; renderAll(); }
      else if (state.tool !== 'select' && !['supply', 'return', 'refrig'].includes(state.tool)) startTrace(p, ev);
      else { state.sel = null; state.pending = null; drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, v: { ...state.view } }; renderProps(); }
      ev.preventDefault();
    });
    window.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      if (drag.kind === 'eq') { const p = svgPoint(svg, ev); drag.e.x = snap(p.x - drag.dx); drag.e.y = snap(p.y - drag.dy); refreshLight(); }
      else if (drag.kind === 'room') { const p = svgPoint(svg, ev), x = snap(p.x), y = snap(p.y); state.draft = { kind: 'room', x: Math.min(drag.x0, x), y: Math.min(drag.y0, y), w: Math.abs(x - drag.x0), h: Math.abs(y - drag.y0) }; refreshLight(); }
      else if (drag.kind === 'wall') { const p = svgPoint(svg, ev); let x = snap(p.x), y = snap(p.y); if (Math.abs(x - drag.x0) >= Math.abs(y - drag.y0)) y = drag.y0; else x = drag.x0; state.draft = { kind: 'wall', x1: drag.x0, y1: drag.y0, x2: x, y2: y }; refreshLight(); }
      else if (drag.kind === 'img') { const p = svgPoint(svg, ev), u = state.underlay; u.x = drag.ux + (p.x - drag.px); u.y = drag.uy + (p.y - drag.py); refreshLight(); }
      else if (drag.kind === 'pan') {
        const r = svg.getBoundingClientRect(), k = Math.max(drag.v.w / r.width, drag.v.h / r.height);
        state.view = { ...drag.v, x: drag.v.x - (ev.clientX - drag.sx) * k, y: drag.v.y - (ev.clientY - drag.sy) * k };
        svg.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
      }
    });
    window.addEventListener('pointerup', () => {
      if (drag && drag.kind === 'room' && state.draft && state.draft.w >= 3 && state.draft.h >= 3) {
        const d = state.draft; state.generated = false; state.rooms.push({ id: uid('r'), name: 'Room ' + (state.rooms.length + 1), x: d.x, y: d.y, w: d.w, h: d.h, ceiling: 8 }); renderRooms();
      } else if (drag && drag.kind === 'wall' && state.draft && Math.abs(state.draft.x2 - state.draft.x1) + Math.abs(state.draft.y2 - state.draft.y1) >= 2) {
        const d = state.draft; state.walls.push({ id: uid('w'), x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, removed: false }); renderWalls();
      }
      if (drag && ['room', 'wall'].includes(drag.kind)) state.draft = null;
      if (drag && drag.kind !== 'pan') renderAll();
      drag = null;
    });
    // Tracing tools: room/wall start a drag, moveimg drags the underlay, calib collects two points.
    function startTrace(p) {
      if (state.tool === 'room' || state.tool === 'wall') drag = { kind: state.tool, x0: snap(p.x), y0: snap(p.y) };
      else if (state.tool === 'moveimg' && state.underlay) drag = { kind: 'img', px: p.x, py: p.y, ux: state.underlay.x, uy: state.underlay.y };
      else if (state.tool === 'calib' && state.underlay) {
        state.calib.push({ x: p.x, y: p.y });
        if (state.calib.length === 2) {
          const [a, b] = state.calib, ft = parseFloat(prompt('Real-world distance between the two points (feet)?'));
          const meas = Math.hypot(b.x - a.x, b.y - a.y);
          if (ft > 0 && meas > 0) { const f = ft / meas, u = state.underlay; u.x = a.x - (a.x - u.x) * f; u.y = a.y - (a.y - u.y) * f; u.w *= f; u.h *= f; }
          state.calib = []; state.tool = 'select';
        }
        renderAll();
      }
    }
    svg.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const p = svgPoint(svg, ev), f = ev.deltaY > 0 ? 1.12 : 1 / 1.12, v = state.view;
      state.view = { x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f, w: v.w * f, h: v.h * f };
      svg.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
    }, { passive: false });
    window.addEventListener('keydown', (ev) => {
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) removeSel();
    });
  }

  /* ---------- presentation ---------- */
  function present() {
    const A = H.analyze(state.scenarios.existing, state.rooms, state.cfg), B = H.analyze(state.scenarios.proposed, state.rooms, state.cfg);
    $('#pTitle').textContent = state.address || 'HVAC proposal';
    $('#pSub').textContent = [state.parcel && 'Parcel / Folio ' + state.parcel, state.model && 'Current unit ' + state.model, new Date().toLocaleDateString()].filter(Boolean).join(' · ');
    $('#present').hidden = false;
    renderPlan($('#planA'), 'existing', false); renderPlan($('#planB'), 'proposed', false);
    $('#statA').innerHTML = statCards(A); $('#statB').innerHTML = statCards(B);
    const rows = A.rooms.map((r, i) => { const q = B.rooms[i]; return `<tr><td>${esc(r.name)}</td><td>${Math.round(r.sqft)}</td><td>${Math.round(r.required)}</td><td>${Math.round(r.delivered)}</td><td class="${pctCls(r.pct)}">${pctText(r)}</td><td>${Math.round(q.delivered)}</td><td class="${pctCls(q.pct)}">${pctText(q)}</td></tr>`; }).join('');
    $('#pTable').innerHTML = `<table><tr><th>Room</th><th>sq ft</th><th>Needed BTU</th><th>Existing BTU</th><th>Existing match</th><th>Proposed BTU</th><th>Proposed match</th></tr>${rows}</table>
      <p>Condenser size change: <b>${tonsLabel(A.total.installedTons)} ton &rarr; ${tonsLabel(B.total.installedTons)} ton</b> (${Math.round(A.total.sqftPerTon)} &rarr; ${Math.round(B.total.sqftPerTon)} sq ft per ton).</p>`;
  }

  /* ---------- wiring ---------- */
  function setStatus(t) { $('#status').textContent = t; }

  function bindUI() {
    // floor plan image, cross-check
    $('#imgFile').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          const k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          const b = bbox(), w = state.rooms.length ? b.w : 60;
          state.underlay = { url: c.toDataURL('image/jpeg', 0.85), x: state.rooms.length ? b.x : 0, y: state.rooms.length ? b.y : 0, w, h: (w * c.height) / c.width, op: 0.55, show: true };
          fit(); renderAll();
          setStatus('Image loaded at a guessed size. Click Set scale and mark a wall of known length.');
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(f);
    };
    $('#btnCalib').onclick = () => { if (!state.underlay) return setStatus('Upload a floor plan image first.'); state.tool = 'calib'; state.calib = []; $('#hint').textContent = 'Click two points on a wall of known length, then enter the length in feet.'; renderAll(); };
    $('#btnMoveImg').onclick = () => { if (!state.underlay) return setStatus('Upload a floor plan image first.'); state.tool = 'moveimg'; $('#hint').textContent = 'Drag to slide the image into place.'; renderAll(); };
    $('#imgShow').onchange = (e) => { if (state.underlay) { state.underlay.show = e.target.checked; renderAll(); } };
    $('#imgOp').oninput = (e) => { if (state.underlay) { state.underlay.op = e.target.value / 100; refreshLight(); } };
    $('#btnRmImg').onclick = () => { state.underlay = null; renderAll(); };
    $('#btnClearRooms').onclick = () => {
      if (!confirm('Start a blank plan? This removes all rooms, walls, the outline and all equipment in both scenarios.')) return;
      state.rooms = []; state.walls = []; state.footprint = []; state.record = null;
      ['existing', 'proposed'].forEach((k) => (state.scenarios[k] = { equip: [], ducts: [] }));
      renderRooms(); renderWalls(); renderAll();
    };
    [['lsSqft', 'sqft'], ['lsBeds', 'beds'], ['lsBaths', 'baths']].forEach(([id, k]) => { $('#' + id).oninput = (e) => { state.listing[k] = e.target.value === '' ? null : parseFloat(e.target.value); renderXcheck(); save(); }; });
    $('#xcheck').addEventListener('click', (e) => { if (e.target.dataset.useq) scaleToSqft(parseFloat(e.target.dataset.useq)); });
    $('#scnSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { state.active = b.dataset.scn; state.sel = state.pending = null; renderAll(); } });
    $('#toolSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { state.tool = b.dataset.tool; state.pending = null; $('#hint').textContent = state.tool === 'select' ? 'Drag equipment to move it.' : state.tool === 'room' ? 'Drag a rectangle over a room on the image. Rename and fine-tune it in the Rooms table.' : state.tool === 'wall' ? 'Drag to draw a wall (snaps horizontal or vertical).' : 'Click the first item, then the second item to connect them.'; renderAll(); } });
    document.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => addEquip(b.dataset.add)));
    $('#btnFit').onclick = () => { fit(); renderAll(); };
    $('#btnAuto').onclick = () => { if (!state.rooms.length) return alert('Add or trace rooms first.'); if (confirm('Replace the ' + state.active + ' layout with an automatic one?')) { autoLayout(state.active, { splitters: state.active === 'proposed' }); renderAll(); } };
    $('#btnCopy').onclick = () => { state.scenarios.proposed = JSON.parse(JSON.stringify(state.scenarios.existing)); state.active = 'proposed'; renderAll(); };
    $('#btnPresent').onclick = present;
    $('#pClose').onclick = () => { $('#present').hidden = true; };
    $('#pPrint').onclick = () => window.print();
    $('#btnSample').onclick = loadSample;
    $('#btnDiag').onclick = () => loadExample(window.EXAMPLES.diagonal);
    $('#btnTheme').onclick = () => { state.theme = state.theme === 'paper' ? 'blueprint' : 'paper'; applyTheme(); renderAll(); };
    $('#btnAddWall').onclick = () => { state.walls.push({ id: uid('w'), x1: 0, y1: 0, x2: 10, y2: 0, removed: false }); renderWalls(); renderAll(); };
    $('#wallTable').addEventListener('input', (e) => {
      const tr = e.target.closest('[data-wall]'); if (!tr) return;
      const w = state.walls.find((x) => x.id === tr.dataset.wall), k = e.target.dataset.wk;
      w[k] = k === 'removed' ? e.target.checked : num(e.target.value, w[k]);
      refreshLight();
    });
    $('#wallTable').addEventListener('click', (e) => {
      if (!e.target.matches('[data-wdel]')) return;
      state.walls = state.walls.filter((w) => w.id !== e.target.closest('[data-wall]').dataset.wall); renderWalls(); renderAll();
    });
    $('#btnAddRoom').onclick = () => { state.rooms.push({ id: uid('r'), name: 'Room', x: 0, y: 0, w: 12, h: 12, ceiling: 8 }); renderRooms(); renderAll(); };
    $('#btnRect').onclick = () => setFootprintAndRooms(L.rectFootprint(num($('#rectW').value, 54), num($('#rectD').value, 36)), Math.max(1, num($('#beds').value, 3)), Math.max(1, num($('#baths').value, 2)));

    $('#parcel').oninput = (e) => { state.parcel = e.target.value; save(); };
    $('#address').oninput = (e) => { state.address = e.target.value; save(); };
    $('#btuSqft').oninput = (e) => { state.cfg.btuPerSqft = num(e.target.value, 30); refreshLight(); };
    try { $('#token').value = localStorage.getItem('ductlayout.token') || ''; } catch (e) {}
    $('#token').onchange = (e) => { try { localStorage.setItem('ductlayout.token', e.target.value); } catch (x) {} };

    const tons = $('#curTons');
    for (let t = 1; t <= 6; t += 0.5) tons.add(new Option(t + ' ton', t));
    $('#model').oninput = (e) => {
      state.model = e.target.value;
      const r = H.parseModel(state.model);
      if (r.tons) { tons.value = r.tons; $('#modelNote').textContent = `Detected ${r.tons} ton (${r.btu / 1000}k BTU) from the model number. Verify on the nameplate.`; }
      else $('#modelNote').textContent = state.model ? 'Could not read capacity from this model number. Choose tons manually.' : '';
      save();
    };
    $('#btnApplyCur').onclick = () => {
      state.curTons = num(tons.value, 3);
      scn().equip.concat(state.scenarios.existing.equip).forEach((e) => {});
      state.scenarios.existing.equip.filter((e) => e.type === 'condenser' || e.type === 'ahu').forEach((e) => (e.tons = state.curTons));
      renderAll();
    };

    $('#results').addEventListener('click', (e) => { if (e.target.id === 'btnScale') scaleToRecord(); });
    $('#btnLookup').onclick = async () => {
      const addr = $('#address').value.trim();
      if (!addr) return setStatus('Enter an address first.');
      $('#btnLookup').disabled = true;
      try {
        const r = await L.lookup(addr, $('#token').value.trim(), setStatus);
        state.address = r.display || addr;
        if (r.parcelId) { state.parcel = r.parcelId; $('#parcel').value = r.parcelId; }
        state.record = r.record || null;
        if (state.record) {
          if (state.record.beds) $('#beds').value = state.record.beds;
          if (state.record.baths) $('#baths').value = Math.max(1, Math.round(state.record.baths));
        }
        if (r.footprint && (state.generated || !state.rooms.length)) { setFootprintAndRooms(r.footprint, num($('#beds').value, 3), num($('#baths').value, 2)); }
        else { if (r.footprint) r.notes.push('Existing rooms kept (traced or example). Use Blank plan to regenerate from the outline.'); renderAll(); }
        setStatus((r.footprint ? 'Building outline loaded. ' : 'No outline, use the rectangle option. ') + r.notes.join(' '));
      } catch (e) { setStatus('Lookup failed: ' + e.message + '. You can still draw a rectangle footprint.'); }
      $('#btnLookup').disabled = false;
    };

    $('#roomTable').addEventListener('input', (e) => {
      const tr = e.target.closest('[data-room]'); if (!tr) return;
      const r = state.rooms.find((x) => x.id === tr.dataset.room), k = e.target.dataset.rk;
      if (k === 'ac') r.noAC = !e.target.checked; else r[k] = k === 'name' ? e.target.value : num(e.target.value, r[k]);
      refreshLight();
    });
    $('#roomTable').addEventListener('click', (e) => {
      if (!e.target.matches('[data-rdel]')) return;
      state.rooms = state.rooms.filter((r) => r.id !== e.target.closest('[data-room]').dataset.room); renderRooms(); renderAll();
    });
    $('#propBody').addEventListener('input', (e) => {
      const dk = e.target.dataset.dk;
      if (dk) {
        const du = scn().ducts.find((x) => x.id === state.sel); if (!du) return;
        du[dk] = dk === 'flex' ? e.target.checked : (e.target.value === '' ? null : num(e.target.value, 0));
        refreshLight(); return;
      }
      const k = e.target.dataset.k; if (!k) return;
      const eq = scn().equip.find((x) => x.id === state.sel); if (!eq) return;
      eq[k] = e.target.dataset.t === 'text' ? e.target.value : (e.target.value === '' ? null : num(e.target.value, eq[k]));
      refreshLight();
    });
    $('#propBody').addEventListener('click', (e) => { if (e.target.matches('[data-del]')) removeSel(); });
  }

  bindUI(); bindPlan();
  if (load()) {
    $('#address').value = state.address; $('#parcel').value = state.parcel; $('#model').value = state.model;
    $('#curTons').value = state.curTons; $('#btuSqft').value = state.cfg.btuPerSqft;
    ['sqft', 'beds', 'baths'].forEach((k) => { const el2 = $('#ls' + k[0].toUpperCase() + k.slice(1)); if (el2 && state.listing[k] != null) el2.value = state.listing[k]; });
    state.walls = state.walls || []; state.theme = state.theme || 'paper'; applyTheme();
    if (!state.view) fit(); renderRooms(); renderWalls(); renderAll();
  } else loadSample();
})();
