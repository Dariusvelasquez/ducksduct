(function () {
  const H = window.HVAC, L = window.Lookup;
  const $ = (s) => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  // White-label settings come from config.js (window.BRAND); every field has a default.
  const BR = window.BRAND || {};
  const BX = {
    name: BR.name || 'HVAC Designer', logo: BR.logo || '', accent: BR.accent || '', company: BR.company || {},
    disclaimer: BR.disclaimer || 'Preliminary sizing estimate, not an ACCA Manual J load calculation.',
    defaults: Object.assign({ btuPerSqft: 30, theme: 'paper' }, BR.defaults),
    features: Object.assign({ sample: true, lookup: true, print: true, showPrices: false }, BR.features),
    storageKey: BR.storageKey || 'ductlayout.v2', poweredBy: BR.poweredBy || '',
    map: Object.assign({ tileUrl: '', attribution: '', maxZoom: 19 }, BR.map),
    sizing: BR.sizing || null, catalog: BR.catalog || null,
  };
  const KEY = BX.storageKey;
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
    active: 'existing', theme: BX.defaults.theme, walls: [], listing: {}, underlay: null, draft: null, calib: [], selRoom: null, photos: [], measures: [], notes: '', sizing: { era: BR.sizing ? BR.sizing.defaultEra : '', envelope: BR.sizing ? BR.sizing.defaultEnvelope : '', basis: 'auto' }, geo: null, mapOn: false, mapOp: 0.9, point: null, jobId: null, jobName: '', savedSig: null, cfg: { btuPerSqft: BX.defaults.btuPerSqft }, curTons: 5, view: null, tool: 'select', sel: null, pending: null,
  };

  // In-page replacement for confirm()/prompt(), which hosted pages cannot show.
  function ask(msg, withInput) {
    return new Promise((res) => {
      const d = $('#dlg'), inp = $('#dlgIn');
      $('#dlgMsg').textContent = msg; inp.hidden = !withInput; inp.value = ''; d.hidden = false;
      if (withInput) inp.focus();
      const done = (v) => { d.hidden = true; $('#dlgOk').onclick = $('#dlgNo').onclick = inp.onkeydown = null; res(v); };
      $('#dlgOk').onclick = () => done(withInput ? inp.value : true);
      $('#dlgNo').onclick = () => done(withInput ? null : false);
      inp.onkeydown = (e) => { if (e.key === 'Enter') done(inp.value); if (e.key === 'Escape') done(null); };
    });
  }

  /* ---------- persistence ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ ...state, pending: null, sel: null, underlay: null, draft: null, calib: [] })); } catch (e) {} histSchedule(); }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.rooms) { Object.assign(state, s, { pending: null, sel: null, tool: 'select', underlay: null, draft: null, calib: [], listing: s.listing || {} }); return true; } } catch (e) {}
    return false;
  }
  const scn = () => state.scenarios[state.active];

  /* ---------- field capture: photos, tape measurements ---------- */
  const localIso = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  function dataURLToBlob(u) { const [h, b64] = u.split(','), bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: /^data:([^;]+)/.exec(h)[1] }); }
  const num2 = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const cleanPhotos = (a) => (Array.isArray(a) ? a : []).filter((p) => p && typeof p.id === 'string').slice(0, 200).map((p) => ({ id: p.id, ts: String(p.ts || '').slice(0, 30), lat: num2(p.lat), lon: num2(p.lon), acc: num2(p.acc), src: ['photo', 'device', 'none'].includes(p.src) ? p.src : 'none', note: String(p.note || '').slice(0, 1000), x: num2(p.x), y: num2(p.y) }));
  const cleanMeasures = (a) => (Array.isArray(a) ? a : []).filter((m) => m && typeof m.val === 'string').slice(0, 300).map((m) => ({ id: String(m.id || uid('m')), what: String(m.what || '').slice(0, 60), val: m.val.slice(0, 60), room: String(m.room || '').slice(0, 60), note: String(m.note || '').slice(0, 300), ts: String(m.ts || '').slice(0, 30) }));
  const photoURLs = new Map();
  async function photoURL(id) {
    if (photoURLs.has(id)) return photoURLs.get(id);
    const b = await Media.get(id); if (!b) return null;
    const u = URL.createObjectURL(b); photoURLs.set(id, u); return u;
  }
  let gpsPromise = null;
  function startGps() {   // ask for the position as the camera opens, so it is ready when the photo comes back
    gpsPromise = new Promise((res) => { if (!navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition((p) => res({ lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }), () => res(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }); });
  }
  async function shrinkImage(file) {   // longest side 1600 px, JPEG, upright
    let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bmp = await createImageBitmap(file); }
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('image'))), 'image/jpeg', 0.82));
  }
  const setPhotoStatus = (t) => { $('#photoStatus').textContent = t; };
  async function addPhotos(files, fromCamera) {
    if (!files.length) return;
    const gps = fromCamera && gpsPromise ? await gpsPromise : null;
    let added = 0, noLoc = 0;
    for (const f of files) {
      try {
        const ex = Exif.parse(await f.arrayBuffer()), blob = await shrinkImage(f), id = uid('ph');
        await Media.put(id, blob);
        const loc = ex.lat != null ? { lat: ex.lat, lon: ex.lon, src: 'photo' } : gps ? { lat: gps.lat, lon: gps.lon, acc: gps.acc, src: 'device' } : null;
        if (!loc) noLoc++;
        state.photos.push({ id, ts: ex.ts || localIso(new Date()), lat: loc ? loc.lat : null, lon: loc ? loc.lon : null, acc: loc && loc.acc ? loc.acc : null, src: loc ? loc.src : 'none', note: '', x: null, y: null });
        added++;
      } catch (e) { /* unreadable file: skip it */ }
    }
    setPhotoStatus(added ? `Added ${added} photo${added > 1 ? 's' : ''}.${noLoc ? ` ${noLoc} without a location (allow location access when taking photos, or use photos that already carry GPS).` : ''}` : 'Could not read that file as a photo.');
    renderAll();
  }
  const fmtTs = (ts) => { const d = new Date(ts); return isNaN(d) ? ts : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };
  const gpsText = (p) => (p.lat != null ? `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}${p.acc ? ` (±${p.acc} m)` : ''}` : 'no location');
  function renderPhotos() {
    $('#photoList').innerHTML = state.photos.map((p, i) => `<div class="ph" data-ph="${esc(p.id)}"><img data-phimg="${esc(p.id)}" alt="Photo ${i + 1}"><div><div class="meta">${i + 1}. ${esc(fmtTs(p.ts))}<br>${esc(gpsText(p))}${p.src === 'device' ? ' · from this device' : ''}</div><input data-phnote placeholder="Note" value="${esc(p.note)}"><div class="row"><button data-phpin>${p.x != null ? 'Move pin' : 'Pin on plan'}</button><button data-phdel class="x">Delete</button></div></div></div>`).join('');
    $('#photoList').querySelectorAll('[data-phimg]').forEach((img) => photoURL(img.dataset.phimg).then((u) => { if (u && img.isConnected) img.src = u; }));
  }
  let viewId = null;
  async function openViewer(id) {
    const p = state.photos.find((x) => x.id === id), u = p && (await photoURL(id)); if (!p) return;
    viewId = id; $('#pvImg').src = u || '';
    const link = p.lat != null ? ` · <a href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=19/${p.lat}/${p.lon}" target="_blank" rel="noopener">map</a>` : '';
    $('#pvMeta').innerHTML = `${esc(fmtTs(p.ts))} · ${esc(gpsText(p))}${link}`; $('#pvNote').value = p.note; $('#pv').hidden = false;
  }
  function closeViewer() { $('#pv').hidden = true; viewId = null; renderAll(); }
  function deletePhoto(id) { state.photos = state.photos.filter((p) => p.id !== id); renderAll(); }   // the picture itself stays until the next clean-up, so Undo can bring it back
  function pinPhoto(id) {
    const p = state.photos.find((x) => x.id === id), v = state.view || { x: 0, y: 0, w: 60, h: 40 }; if (!p) return;
    p.x = snap(v.x + v.w / 2); p.y = snap(v.y + v.h / 2); state.tool = 'select';
    $('#tabs [data-tab=plan]').click(); $('#hint').textContent = 'Drag the pin to where the photo was taken. Click it to see the photo.'; renderAll();
  }
  function renderMeasures() {
    const sel = $('#msRoom'), cur = sel.value;
    sel.innerHTML = '<option value="">No room</option>' + state.rooms.map((r) => `<option>${esc(r.name)}</option>`).join(''); sel.value = cur;
    $('#measureList').innerHTML = state.measures.map((m) => `<div class="ms" data-ms="${esc(m.id)}"><span><b>${esc(m.what)}</b> ${esc(m.val)}${m.room ? ' · ' + esc(m.room) : ''}${m.note ? '<br><small>' + esc(m.note) + '</small>' : ''}</span><button class="x" data-msdel>&times;</button></div>`).join('');
    if (document.activeElement !== $('#jobNotes') && $('#jobNotes').value !== (state.notes || '')) $('#jobNotes').value = state.notes || '';
  }
  function renderField() { renderPhotos(); renderMeasures(); }
  async function cleanUpMedia() {   // drop pictures no saved job, autosave or open design refers to
    const keep = new Set(state.photos.map((p) => p.id)); readJobs().forEach((j) => ((j.data && j.data.photos) || []).forEach((p) => keep.add(p.id)));
    const keys = (await Media.keys()) || []; for (const k of keys) if (!keep.has(k)) await Media.del(k);
  }

  /* ---------- sizing, equipment matching, quote ---------- */
  function basisSqft() {
    const b = state.sizing.basis, r = state.record || {}, drawn = Math.round(condArea()), fp = state.footprint.length > 2 ? Math.round(polyAreaFt2(state.footprint) * (r.stories || 1)) : 0;
    const opts = { drawn: [drawn, 'drawn rooms'], record: [r.sqft, 'county record'], listing: [state.listing.sqft, 'listing'], footprint: [fp, 'footprint outline' + (r.stories > 1 ? ' x ' + r.stories + ' floors' : '')] };
    if (b !== 'auto' && opts[b] && opts[b][0] > 0) return { sqft: opts[b][0], label: opts[b][1] };
    for (const k of ['record', 'listing', 'drawn']) if (opts[k][0] > 0) return { sqft: opts[k][0], label: opts[k][1] };
    return { sqft: 0, label: '' };
  }
  function sizingNow() { const b = basisSqft(); return b.sqft > 0 ? { ...b, ...Sizing.suggest(b.sqft, state.cfg.btuPerSqft) } : null; }
  function setFactorFromTable() { if (BX.sizing) state.cfg.btuPerSqft = Sizing.factor(BX.sizing, state.sizing.era, state.sizing.envelope); $('#btuSqft').value = state.cfg.btuPerSqft; }
  function fillSizingSelects() {
    if (!BX.sizing) { $('#sizingSec').hidden = true; return; }
    $('#szEra').innerHTML = BX.sizing.era.map((e) => `<option value="${esc(e.id)}">${esc(e.label)} (${e.btuPerSqft} BTU/sqft)</option>`).join('');
    $('#szEnv').innerHTML = BX.sizing.envelope.map((e) => `<option value="${esc(e.id)}">${esc(e.label)}</option>`).join('');
  }
  function renderSizing() {
    if (!BX.sizing) return;
    $('#szEra').value = state.sizing.era; $('#szEnv').value = state.sizing.envelope; $('#szBasis').value = state.sizing.basis;
    const s = sizingNow();
    $('#szOut').innerHTML = s ? `${s.sqft} sq ft (${esc(s.label)}) x ${state.cfg.btuPerSqft} BTU/sqft = ${s.btu.toLocaleString()} BTU = ${s.tons} ton.<br><b>Suggested size: ${s.rounded} ton</b> (range ${s.low} to ${s.high} ton).` : 'Add rooms or enter a square footage to get a suggestion.';
  }
  // runs and register sizes taken off the drawing, for the quote
  function takeoff(key) {
    const s = state.scenarios[key], a = H.analyze(s, state.rooms, state.cfg), byId = Object.fromEntries(s.equip.map((e) => [e.id, e])), runs = [], regDia = {};
    s.ducts.forEach((d) => {
      const A = byId[d.a], B = byId[d.b]; if (!A || !B) return;
      const pa = port(A, d.kind), pb = port(B, d.kind), pts = [pa, ...(d.via || []), pb];
      let len = 0; for (let i = 0; i < pts.length - 1; i++) len += Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
      if (d.kind === 'refrig') len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      else if (d.flex && !(d.via && d.via.length)) len = (Math.hypot(pb.x - pa.x, pb.y - pa.y) + len) / 2;
      const dia = d.kind === 'refrig' ? 0 : d.dia > 0 ? d.dia : H.ductDia(a.ductFlow[d.id] || 0);
      runs.push({ kind: d.kind, dia, len, flex: !!d.flex });
      [A, B].forEach((q) => { if (q.type === 'supply' && dia) regDia[q.id] = Math.max(regDia[q.id] || 0, dia); });
    });
    return { a, runs, regDia };
  }
  const quoteFor = (key) => { const t = takeoff(key); return Sizing.quote(state.scenarios[key], t.a, BX.catalog, t.runs, t.regDia); };
  const $$ = (n) => '$' + Math.round(n).toLocaleString();
  function renderQuote() {
    const box = $('#quote');
    if (!BX.catalog) { box.hidden = true; return; }
    if (!scn().equip.length) { box.innerHTML = '<h2>Parts and quote</h2><p class="muted">Add equipment to the plan and the parts list builds itself.</p>'; return; }
    const q = quoteFor(state.active), other = quoteFor(state.active === 'existing' ? 'proposed' : 'existing');
    const ex = state.active === 'existing' ? q : other, pr = state.active === 'proposed' ? q : other;
    box.innerHTML = `<h2>Parts and quote (${state.active})</h2>
      ${BX.catalog.note ? `<p class="warn">${esc(BX.catalog.note)}</p>` : ''}
      <table><tr><th>Item</th><th>Qty</th><th>Each</th><th>Total</th></tr>${q.lines.map((l) => `<tr><td>${esc(l.desc)}</td><td>${l.qty}${l.unit === 'ft' ? ' ft' : ''}</td><td>${l.unitPrice.toFixed(2)}</td><td>${l.total.toFixed(2)}</td></tr>`).join('')}
      <tr><td colspan="3">Materials</td><td>${$$(q.materials)}</td></tr><tr><td colspan="3">Markup ${BX.catalog.markupPct}%</td><td>${$$(q.markup)}</td></tr><tr><td colspan="3">Tax ${BX.catalog.taxPct}%</td><td>${$$(q.tax)}</td></tr>
      <tr><td colspan="3">Labor (${q.hours} h)</td><td>${$$(q.labor)}</td></tr><tr><td colspan="3"><b>Total</b></td><td><b>${$$(q.total)}</b></td></tr></table>
      <p class="muted">Existing ${$$(ex.total)} · Proposed ${$$(pr.total)} · difference ${pr.total - ex.total >= 0 ? '+' : '-'}${$$(Math.abs(pr.total - ex.total))}</p>
      <div class="row"><button id="btnCsv">Export CSV</button><button id="btnCopyList">Copy list</button></div>`;
  }
  const listText = (q, name) => [name, ...q.lines.map((l) => `${l.qty}${l.unit === 'ft' ? ' ft' : ' x'} ${l.desc}: ${l.total.toFixed(2)}`), `Materials ${q.materials.toFixed(2)}, markup ${q.markup.toFixed(2)}, tax ${q.tax.toFixed(2)}, labor ${q.labor.toFixed(2)} (${q.hours} h)`, `TOTAL ${q.total.toFixed(2)}`].join('\n');
  // equipment suggestion for the selected item
  function matchHtml(e, a) {
    if (!BX.catalog || !['condenser', 'ahu', 'head'].includes(e.type)) return '';
    const sug = sizingNow(), sys = scn().equip.filter((x) => x.type === 'condenser' || x.type === 'ahu').length ? Math.max(1, scn().equip.filter((x) => x.type === 'condenser').length) : 1;
    let ctx;
    if (e.type === 'head') { const room = state.rooms.find((r) => H.inRoom(e, r)), row = room && a.rooms.find((r) => r.id === room.id); ctx = { btu: row && row.required > 0 ? row.required : 12000, room: room && room.name }; }
    else { if (!sug) return ''; ctx = { tons: Math.max(1, Math.ceil((sug.tons / sys) * 2 - 1e-9) / 2) }; }
    const m = Sizing.matchFor(BX.catalog, e, ctx); if (!m || !m.item) return '';
    const val = e.type === 'head' ? m.item.btu : m.item.tons, cur = e.type === 'head' ? e.btu : e.tons;
    return `<p class="muted">Suggested for this home: <b>${esc(m.item.label)}</b> (needs ${e.type === 'head' ? Math.round(m.need).toLocaleString() + ' BTU' + (ctx.room ? ' in ' + esc(ctx.room) : '') : m.need + ' ton'}).</p>${cur === val ? '<p class="ok">This item already matches.</p>' : `<button data-apply-match="${val}">Set to ${e.type === 'head' ? val / 1000 + 'k BTU' : val + ' ton'}</button>`}`;
  }

  /* ---------- share a picture ---------- */
  function exportView(aspect) {   // the whole design, framed to the picture's shape (not the current zoom)
    const b = bbox(), pad = 8; let x = b.x - pad, y = b.y - pad, w = b.w + pad * 2, h = b.h + pad * 2;
    if (w / h < aspect) { const nw = h * aspect; x -= (nw - w) / 2; w = nw; } else { const nh = w / aspect; y -= (nh - h) / 2; h = nh; }
    return { x, y, w, h };
  }
  async function planCanvas(key, w, h) {
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('xmlns', NS); svg.id = 'xp' + key; svg.__px = w;
    const v = exportView(w / h);
    renderPlan(svg, key, false, v);
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    let missing = false;
    await Promise.all([...svg.querySelectorAll('image')].map(async (im) => {   // a picture cannot load web images, so put the map tiles inside it
      const u = im.getAttribute('href'); if (!/^https?:/.test(u)) return;
      try { const r = await fetch(u, { mode: 'cors' }); if (!r.ok) throw new Error('tile'); im.setAttribute('href', await blobToDataURL(await r.blob())); } catch (e) { im.remove(); missing = true; }
    }));
    svg.insertBefore(el('rect', { x: v.x, y: v.y, width: v.w, height: v.h, fill: COL.bg }), svg.firstChild);
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)); await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
    return { canvas: c, missing };
  }
  function wrapText(ctx, text, maxW) {
    const out = []; let line = '';
    String(text).split(/\s+/).forEach((word) => { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t; });
    if (line) out.push(line); return out;
  }
  async function composePicture(both) {
    const W = both ? 2000 : 1600, pad = 40, head = 130, ph = both ? 740 : 1000, pw = both ? (W - pad * 3) / 2 : W - pad * 2;
    const keys = both ? ['existing', 'proposed'] : [state.active], plans = await Promise.all(keys.map((k) => planCanvas(k, Math.round(pw), ph)));
    const an = keys.map((k) => H.analyze(state.scenarios[k], state.rooms, state.cfg));
    const probe = document.createElement('canvas').getContext('2d'); probe.font = '15px system-ui, sans-serif';
    const disc = wrapText(probe, BX.disclaimer, W - pad * 2), foot = disc.length * 20 + 30, statH = 70, H2 = head + ph + statH + foot + pad;
    const c = document.createElement('canvas'); c.width = W; c.height = H2; const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H2);
    const co = BX.company, name = co.name || BX.name;
    g.fillStyle = '#10243f'; g.font = '700 36px system-ui, sans-serif'; g.fillText(name, pad, 58);
    g.fillStyle = '#44556f'; g.font = '22px system-ui, sans-serif'; g.fillText(state.address || 'HVAC layout', pad, 96);
    g.textAlign = 'right'; g.font = '18px system-ui, sans-serif'; g.fillText([co.phone, co.email].filter(Boolean).join('  ·  '), W - pad, 58); g.fillText([state.parcel && 'Parcel ' + state.parcel, new Date().toLocaleDateString()].filter(Boolean).join('  ·  '), W - pad, 90); g.textAlign = 'left';
    plans.forEach((p, i) => {
      const x = pad + i * (pw + pad), t = an[i].total;
      g.drawImage(p.canvas, x, head); g.strokeStyle = '#9aa7ba'; g.lineWidth = 2; g.strokeRect(x, head, pw, ph);
      g.fillStyle = '#10243f'; g.font = '700 26px system-ui, sans-serif'; g.fillText(keys[i] === 'proposed' ? 'Proposed system' : 'Existing system', x, head + ph + 36);
      g.fillStyle = '#44556f'; g.font = '19px system-ui, sans-serif';
      g.fillText(`${tonsLabel(t.installedTons)} ton installed  ·  ${tonsLabel(t.requiredTons)} ton calculated need  ·  ${Math.round(t.oversize * 100)}% of need  ·  ${Math.round(t.sqftPerTon)} sq ft per ton`, x, head + ph + 66);
    });
    g.fillStyle = '#667892'; g.font = '15px system-ui, sans-serif'; disc.forEach((l, i) => g.fillText(l, pad, head + ph + statH + 24 + i * 20));
    if (mapShown()) { g.font = '13px system-ui, sans-serif'; g.fillText(BX.map.attribution || '', pad, H2 - 12); }
    return { canvas: c, missing: plans.some((p) => p.missing) };
  }
  function downloadBlob(name, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function sharePicture(both) {
    if (!state.rooms.length && !state.scenarios[state.active].equip.length) return setStatus('Nothing to share yet. Build a plan first.');
    setStatus('Making the picture...');
    try {
      const { canvas, missing } = await composePicture(both);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png')), slug = (state.address || 'layout').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'layout';
      const name = `${slug}-${both ? 'proposal' : state.active}.png`, file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: (BX.company.name || BX.name) + ' layout', text: state.address || '' }); setStatus('Shared.'); return; } catch (e) { if (e.name === 'AbortError') return setStatus(''); }
      }
      downloadBlob(name, blob); setStatus(`Saved ${name}.${missing ? ' The map could not be included (the map server did not allow it).' : ''}`);
    } catch (e) { setStatus('Could not make the picture: ' + e.message); }
  }

  /* ---------- map under the plan ---------- */
  const mapShown = () => !!(state.mapOn && state.geo && BX.map.tileUrl);
  const polyAreaFt2 = (p) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0)) / 2;
  function drawMap(svg, v) {
    if (!mapShown()) return;
    const tiles = Geo.tilesFor(state.geo, v, svg.__px || svg.getBoundingClientRect().width || 800, { url: BX.map.tileUrl, maxZoom: BX.map.maxZoom });
    tiles.forEach((t) => el('image', { href: t.url, x: 0, y: 0, width: 1, height: 1, transform: `matrix(${t.m.join(' ')})`, preserveAspectRatio: 'none', opacity: state.mapOp, 'pointer-events': 'none' }, svg));
  }
  // Put the plan on the map: its centre sits on the geocoded address point, no rotation. A hand-drawn or estimated outline
  // is only approximately placed, so Align map and Rotate map are there to line it up.
  function anchorMap() {
    const pt = state.point; if (!pt || !state.footprint.length) return;
    const xs = state.footprint.map((p) => p.x), ys = state.footprint.map((p) => p.y);
    state.geo = { lat0: pt.lat, lon0: pt.lon, ang: 0, mx: -(Math.min(...xs) + Math.max(...xs)) / 2, my: -(Math.min(...ys) + Math.max(...ys)) / 2, s: 1, dx: 0, dy: 0, rot: 0 };
    state.mapOn = !!BX.map.tileUrl;
  }
  let mapTimer = null;
  const mapSoon = () => { if (!mapShown()) return; clearTimeout(mapTimer); mapTimer = setTimeout(refreshLight, 220); };   // reload tiles after panning or zooming
  function renderMapUI() {
    const has = !!state.geo && !!BX.map.tileUrl;
    $('#mapOn').checked = !!state.mapOn; $('#mapOp').value = Math.round(state.mapOp * 100); $('#mapRot').value = state.geo ? state.geo.rot || 0 : 0;
    ['mapOn', 'mapOp', 'mapRot', 'btnMoveMap'].forEach((id) => ($('#' + id).disabled = !has)); $('#btnGeo').disabled = !state.geo;
    $('#mapNote').textContent = !BX.map.tileUrl ? 'No map provider is set in config.js.' : !state.geo ? 'Look up an address to place the plan on the map.' : '';
  }
  function downloadText(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function geoJSON() {
    const g = state.geo; if (!g) return null;
    const ll = (p) => { const q = Geo.toGeo(g, p.x, p.y); return [+q.lon.toFixed(7), +q.lat.toFixed(7)]; };
    const ring = (pts) => { const r = pts.map(ll); r.push(r[0]); return [r]; };
    const feats = [];
    if (state.footprint.length > 2) feats.push({ type: 'Feature', properties: { kind: 'building', sqft: Math.round(polyAreaFt2(state.footprint)) }, geometry: { type: 'Polygon', coordinates: ring(state.footprint) } });
    state.rooms.forEach((r) => feats.push({ type: 'Feature', properties: { kind: 'room', name: r.name, sqft: Math.round(r.w * r.h), noAC: !!r.noAC }, geometry: { type: 'Polygon', coordinates: ring([{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }]) } }));
    scn().equip.forEach((e) => feats.push({ type: 'Feature', properties: { kind: 'equipment', type: e.type, label: e.label || '', tons: e.tons || null, btu: e.btu || null }, geometry: { type: 'Point', coordinates: ll(e) } }));
    return { type: 'FeatureCollection', properties: { address: state.address || '', parcel: state.parcel || '' }, features: feats };
  }

  /* ---------- selection actions ---------- */
  function rotateSel() { const e = scn().equip.find((x) => x.id === state.sel); if (!e) return; e.rot = ((e.rot || 0) + 90) % 360; renderAll(); }
  function duplicateSel() {
    const e = scn().equip.find((x) => x.id === state.sel); if (!e) return;
    const c = { ...JSON.parse(JSON.stringify(e)), id: uid('e'), x: +(e.x + 3).toFixed(1), y: +(e.y + 3).toFixed(1) };
    scn().equip.push(c); state.sel = c.id; renderAll();
  }
  function syncInputs() {
    $('#address').value = state.address || ''; $('#parcel').value = state.parcel || ''; $('#model').value = state.model || '';
    $('#curTons').value = state.curTons; $('#btuSqft').value = state.cfg.btuPerSqft;
    [['lsSqft', 'sqft'], ['lsBeds', 'beds'], ['lsBaths', 'baths']].forEach(([i, k]) => { $('#' + i).value = state.listing[k] != null ? state.listing[k] : ''; });
    $('#jobNotes').value = state.notes || '';
  }

  /* ---------- undo / redo ---------- */
  // Every edit is saved as a snapshot once the user pauses for 0.4 s, so one drag is one undo step.
  let undoStack = [], redoStack = [], lastSnap = null, histTimer = null, restoring = false;
  function updateUndoButtons() { const u = $('#btnUndo'), r = $('#btnRedo'); if (u) u.disabled = !undoStack.length; if (r) r.disabled = !redoStack.length; }
  function commitHist() {
    clearTimeout(histTimer);
    const s = sig();
    if (lastSnap === null) { lastSnap = s; return; }
    if (s !== lastSnap) { undoStack.push(lastSnap); if (undoStack.length > 100) undoStack.shift(); redoStack = []; lastSnap = s; }
    updateUndoButtons();
  }
  function histSchedule() { if (restoring) return; clearTimeout(histTimer); histTimer = setTimeout(commitHist, 400); }
  function restoreSnap(snap) {
    const arr = JSON.parse(snap); restoring = true;
    try { SIG.forEach((k, i) => (state[k] = arr[i])); Object.assign(state, { sel: null, pending: null, selRoom: null, draft: null, calib: [] }); syncInputs(); renderRooms(); renderWalls(); renderAll(); } finally { restoring = false; }
    lastSnap = snap; updateUndoButtons();
  }
  function undo() { commitHist(); if (!undoStack.length) return; redoStack.push(lastSnap); restoreSnap(undoStack.pop()); }
  function redo() { commitHist(); if (!redoStack.length) return; undoStack.push(lastSnap); restoreSnap(redoStack.pop()); }

  /* ---------- jobs library, export / import ---------- */
  const JOBS_KEY = KEY + '.jobs';
  const CORE = ['address', 'parcel', 'model', 'footprint', 'rooms', 'walls', 'scenarios', 'cfg', 'curTons', 'listing', 'record', 'theme', 'active', 'generated', 'geo', 'mapOn', 'point', 'sizing', 'photos', 'measures', 'notes'];
  const SIG = ['address', 'parcel', 'model', 'footprint', 'rooms', 'walls', 'scenarios', 'cfg', 'curTons', 'listing', 'record', 'geo', 'mapOn', 'sizing', 'photos', 'measures', 'notes'];
  const sig = () => JSON.stringify(SIG.map((k) => state[k]));
  const hasWork = () => state.rooms.length > 0 || ['existing', 'proposed'].some((k) => state.scenarios[k].equip.length > 0);
  const isDirty = () => hasWork() && sig() !== state.savedSig;
  const okToReplace = async () => !isDirty() || ask('Your current work has changes that are not saved as a job. Replace it anyway?');
  const jobData = (withImage) => { const o = {}; CORE.forEach((k) => (o[k] = state[k])); o.underlay = withImage && state.underlay ? state.underlay : null; return JSON.parse(JSON.stringify(o)); };
  const fin = (v) => typeof v === 'number' && isFinite(v);
  function validJob(d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.rooms) || !d.scenarios) return false;
    if (!d.rooms.every((r) => r && fin(r.x) && fin(r.y) && fin(r.w) && fin(r.h))) return false;
    return ['existing', 'proposed'].every((k) => { const s = d.scenarios[k]; return s && Array.isArray(s.equip) && Array.isArray(s.ducts) && s.equip.every((e) => e && fin(e.x) && fin(e.y) && typeof e.type === 'string') && s.ducts.every((x) => x && typeof x.kind === 'string'); });
  }
  const validGeo = (g) => !!g && ['lat0', 'lon0', 'ang', 'mx', 'my', 's'].every((k) => typeof g[k] === 'number' && isFinite(g[k])) && Math.abs(g.lat0) <= 90 && Math.abs(g.lon0) <= 180;
  function resetJob() {
    Object.assign(state, { jobId: null, jobName: '', savedSig: null, listing: {}, record: null, geo: null, mapOn: false, point: null, photos: [], measures: [], notes: '', sizing: { era: BX.sizing ? BX.sizing.defaultEra : '', envelope: BX.sizing ? BX.sizing.defaultEnvelope : '', basis: 'auto' }, underlay: null, calib: [], draft: null, selRoom: null, sel: null, pending: null });
    ['jobName', 'lsSqft', 'lsBeds', 'lsBaths'].forEach((i) => { $('#' + i).value = ''; });
  }
  function applyJob(d) {
    Object.assign(state, { address: '', parcel: '', model: '', footprint: [], rooms: [], walls: [], listing: {}, record: null, generated: false, curTons: 5, active: 'existing',
      scenarios: { existing: { equip: [], ducts: [] }, proposed: { equip: [], ducts: [] } }, cfg: { btuPerSqft: BX.defaults.btuPerSqft }, geo: null, mapOn: false, point: null, photos: [], measures: [], notes: '', sizing: { era: BX.sizing ? BX.sizing.defaultEra : '', envelope: BX.sizing ? BX.sizing.defaultEnvelope : '', basis: 'auto' } });
    CORE.forEach((k) => { if (d[k] !== undefined && d[k] !== null) state[k] = d[k]; });
    if (!validGeo(state.geo)) { state.geo = null; state.mapOn = false; }
    state.photos = cleanPhotos(state.photos); state.measures = cleanMeasures(state.measures); state.notes = typeof state.notes === 'string' ? state.notes.slice(0, 5000) : '';
    state.underlay = d.underlay && typeof d.underlay.url === 'string' && /^data:image\//.test(d.underlay.url) ? d.underlay : null;
    Object.assign(state, { sel: null, pending: null, selRoom: null, tool: 'select', draft: null, calib: [], view: null });
    $('#address').value = state.address; $('#parcel').value = state.parcel; $('#model').value = state.model;
    $('#curTons').value = state.curTons; $('#btuSqft').value = state.cfg.btuPerSqft;
    [['lsSqft', 'sqft'], ['lsBeds', 'beds'], ['lsBaths', 'baths']].forEach(([i, k]) => { $('#' + i).value = state.listing[k] != null ? state.listing[k] : ''; });
    applyTheme(); fit(); renderRooms(); renderWalls(); renderAll();
  }
  const readJobs = () => { try { const j = JSON.parse(localStorage.getItem(JOBS_KEY)); return Array.isArray(j) ? j : []; } catch (e) { return []; } };
  const writeJobs = (list) => { try { localStorage.setItem(JOBS_KEY, JSON.stringify(list)); return true; } catch (e) { return false; } };
  const setJobMsg = (t) => { $('#jobState').dataset.msg = t; renderJobs(); };
  function putJob(asNew) {
    if (!hasWork()) return setJobMsg('Nothing to save yet.');
    const name = ($('#jobName').value.trim() || state.address || 'Untitled job').slice(0, 80);
    const list = readJobs();
    let job = !asNew && state.jobId && list.find((j) => j.id === state.jobId);
    if (!job) { job = { id: uid('j') }; list.unshift(job); }
    job.name = name; job.updated = Date.now(); job.data = jobData(true);
    let ok = writeJobs(list), imageKept = !!job.data.underlay;
    if (!ok && job.data.underlay) { job.data = jobData(false); imageKept = false; ok = writeJobs(list); }
    if (!ok) return setJobMsg('Could not save: browser storage is full. Use Export file to keep a copy.');
    state.jobId = job.id; state.jobName = name; state.savedSig = sig(); $('#jobName').value = name;
    save();
    setJobMsg(`Saved "${name}".` + (state.underlay && !imageKept ? ' The floor-plan image was too big to keep here. Export file includes it.' : ''));
  }
  async function openJob(id) {
    const job = readJobs().find((j) => j.id === id); if (!job) return;
    if (id !== state.jobId && !(await okToReplace())) return;
    applyJob(job.data); state.jobId = job.id; state.jobName = job.name; state.savedSig = sig(); $('#jobName').value = job.name;
    save(); setJobMsg(`Opened "${job.name}".`);
  }
  function copyJob(id) {
    const list = readJobs(), job = list.find((j) => j.id === id); if (!job) return;
    list.unshift({ id: uid('j'), name: (job.name + ' (copy)').slice(0, 80), updated: Date.now(), data: JSON.parse(JSON.stringify(job.data)) });
    setJobMsg(writeJobs(list) ? `Copied "${job.name}".` : 'Could not copy: browser storage is full.');
  }
  async function deleteJob(id) {
    const list = readJobs(), job = list.find((j) => j.id === id); if (!job) return;
    if (!(await ask(`Delete the saved job "${job.name}"? This cannot be undone.`))) return;
    writeJobs(list.filter((j) => j.id !== id));
    if (state.jobId === id) { state.jobId = null; state.savedSig = null; save(); }
    setJobMsg(`Deleted "${job.name}".`);
  }
  async function exportJob() {
    const name = $('#jobName').value.trim() || state.jobName || state.address || 'job';
    const media = {};
    for (const ph of state.photos) { const b = await Media.get(ph.id); if (b) media[ph.id] = await blobToDataURL(b); }
    const file = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.ductjob.json';
    const blob = new Blob([JSON.stringify({ format: 'ductlayout-job', version: 1, name, saved: new Date().toISOString(), data: jobData(true), media })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setJobMsg('Exported ' + file + '.');
  }
  async function importJob(file) {
    if (!file) return;
    if (file.size > 15e6) return setJobMsg('That file is too large to be a job file.');
    let j;
    try { j = JSON.parse(await file.text()); } catch (e) { return setJobMsg('That is not a valid job file.'); }
    if (!j || j.format !== 'ductlayout-job' || !validJob(j.data)) return setJobMsg('That file is not a job file from this app, or it is damaged.');
    if (!(await okToReplace())) return;
    for (const [id, url] of Object.entries(j.media || {})) if (typeof id === 'string' && /^data:image\//.test(url)) await Media.put(id, dataURLToBlob(url));
    applyJob(j.data); state.jobId = null; state.savedSig = null; state.jobName = ''; $('#jobName').value = String(j.name || '').slice(0, 80);
    save(); setJobMsg(`Imported "${j.name || 'job'}". Press Save to keep it in the jobs list.`);
  }
  // Cheap enough to run on every edit: uses the cached job name, never reads saved jobs from storage.
  function renderJobState() {
    const msg = $('#jobState').dataset.msg || '';
    const st = state.jobId ? `Open: ${esc(state.jobName)}${isDirty() ? ' (unsaved changes)' : ''}` : hasWork() ? 'Not saved as a job yet.' : 'No job open.';
    $('#jobState').innerHTML = msg ? `${st}<br>${esc(msg)}` : st;
  }
  function renderJobs() {
    const list = readJobs().sort((a, b) => b.updated - a.updated);
    renderJobState();
    $('#jobList').innerHTML = list.map((j) => `<div class="job${j.id === state.jobId ? ' cur' : ''}" data-jid="${j.id}"><span class="jn">${esc(j.name)}<small>${new Date(j.updated).toLocaleString()}</small></span><button data-jact="open">Open</button><button data-jact="copy">Copy</button><button class="x" data-jact="del" title="Delete">×</button></div>`).join('');
  }

  /* ---------- geometry helpers ---------- */
  function bbox() {
    const xs = [], ys = [];
    state.footprint.forEach((p) => { xs.push(p.x); ys.push(p.y); });
    state.rooms.forEach((r) => { xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.h); });
    ['existing', 'proposed'].forEach((k) => state.scenarios[k].equip.forEach((e) => { xs.push(e.x); ys.push(e.y); }));
    const u = state.underlay;
    if (u && !state.rooms.length) { xs.push(u.x, u.x + u.w); ys.push(u.y, u.y + u.h); }   // frame the image only until there are rooms
    if (!xs.length) return { x: 0, y: 0, w: 60, h: 40 };
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function fit() {
    const b = bbox(), pad = 9;
    state.view = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  }
  const rotPt = (e, dx, dy) => { const a = ((e.rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return { x: e.x + dx * c - dy * s, y: e.y + dx * s + dy * c }; };
  function port(e, which) {
    const [w] = SIZE[e.type];
    if (e.type === 'ahu') return rotPt(e, which === 'return' ? -w / 2 : w / 2, 0);
    return { x: e.x, y: e.y };
  }
  // orthogonal path through a list of points: supply ducts go across then along, returns along then across
  const viaPath = (pts, kind) => pts.slice(1).reduce((s, q) => s + (kind === 'return' ? `V${q.y}H${q.x}` : `H${q.x}V${q.y}`), `M${pts[0].x} ${pts[0].y}`);

  /* ---------- SVG drawing ---------- */
  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  let LABEL_ROT = 0; // equipment rotation in degrees: labels are turned back so they stay upright
  let FS = 1; // label scale: smaller buildings get smaller text so labels don't pile up
  function label(parent, x, y, t, o) {
    o = o || {};
    const n = el('text', { x, y, 'font-size': (o.size || 1.15) * FS, fill: o.fill || COL.line, 'text-anchor': o.anchor || 'middle', 'font-family': 'ui-monospace,Menlo,monospace', 'font-weight': o.bold ? 700 : 400, 'pointer-events': 'none' }, parent, t);
    n.style.paintOrder = 'stroke'; n.setAttribute('stroke', COL.bg); n.setAttribute('stroke-width', '0.35');
    if (LABEL_ROT) n.setAttribute('transform', `rotate(${-LABEL_ROT} ${x} ${y})`);
    return n;
  }

  function drawEquip(g, e, a, interactive) {
    const [w, h] = SIZE[e.type];
    const info = a.eq[e.id] || {};
    LABEL_ROT = e.rot || 0;
    const grp = el('g', { transform: `translate(${e.x} ${e.y})${e.rot ? ` rotate(${e.rot})` : ''}`, 'data-id': e.id, style: interactive ? 'cursor:move' : '' }, g);
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
      label(grp, 0, h / 2 + 1, 'SPLIT', { size: 0.75, fill: COL.supply });
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
    LABEL_ROT = 0;
    return grp;
  }

  function ductPath(a, b, kind) {
    return `M${a.x} ${a.y}V${b.y}H${b.x}`;
  }

  function renderPlan(svg, key, interactive, viewOverride) {
    const s = state.scenarios[key];
    const a = H.analyze(s, state.rooms, state.cfg);
    { const xs = state.rooms.flatMap((r) => [r.x, r.x + r.w]), ys = state.rooms.flatMap((r) => [r.y, r.y + r.h]); const span = xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 50; FS = Math.max(0.6, Math.min(1, span / 50)); }
    const v = viewOverride || state.view || { x: 0, y: 0, w: 60, h: 40 };
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

    drawMap(svg, v);
    const U = state.underlay;
    if (interactive && U && U.show) el('image', { href: U.url, x: U.x, y: U.y, width: U.w, height: U.h, opacity: U.op, preserveAspectRatio: 'none', 'pointer-events': 'none' }, svg);
    if (state.footprint.length) el('path', { d: 'M' + state.footprint.map((p) => `${p.x} ${p.y}`).join('L') + 'Z', fill: 'none', stroke: COL.line, 'stroke-width': 0.8, 'stroke-linejoin': 'miter', 'pointer-events': 'none' }, svg);
    state.rooms.forEach((r) => {
      const row = a.rooms.find((x) => x.id === r.id);
      const cls = row ? (row.pct < 0.85 ? COL.bad : row.pct > 1.25 ? COL.warn : COL.ok) : COL.line;
      el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: r.noAC ? `url(#h${svg.id})` : 'none', stroke: COL.line, 'stroke-opacity': r.noAC ? 0.9 : 0.55, 'stroke-width': r.noAC ? 0.5 : 0.15, 'stroke-dasharray': r.noAC ? '' : '0.6 0.4', 'pointer-events': 'none' }, svg);
      // Text is fitted to the room: small rooms (closets, hall, linen) get a shrunken name only; larger rooms also get
      // their detail lines along the bottom, clear of the outlet that sits in the middle.
      const big = r.w >= 9 && r.h >= 9, nm = r.name.toUpperCase();
      const nsz = Math.max(0.55, Math.min(1.05, (r.w - 0.6) / (nm.length * 0.62)));
      label(svg, r.x + r.w / 2, big ? r.y + 1.7 : r.y + r.h / 2 + nsz * 0.35, nm, { size: nsz, bold: true });
      if (r.noAC) { label(svg, r.x + r.w / 2, r.y + r.h / 2 + 1, 'NO A/C', { size: Math.min(4, r.w / 7), bold: true }); return; }
      if (big) {
        label(svg, r.x + r.w / 2, r.y + r.h - 2.5, `${Math.round(H.roomSqft(r))} sf · need ${(row ? row.required / 1000 : 0).toFixed(1)}k`, { size: 0.85 });
        if (row) label(svg, r.x + r.w / 2, r.y + r.h - 1.2, `${Math.round(row.pct * 100)}% served`, { size: 0.85, fill: cls });
      }
    });

    if (interactive && state.tool === 'rooms') {
      const hs = Math.max(0.7, v.w / 70);
      state.rooms.forEach((r) => el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: COL.sel, 'fill-opacity': r.id === state.selRoom ? 0.12 : 0.04, stroke: r.id === state.selRoom ? COL.sel : 'none', 'stroke-width': 0.4, 'pointer-events': 'none' }, svg));
      const sr = state.rooms.find((r) => r.id === state.selRoom);
      if (sr) {
        handlePts(sr).forEach((h) => el('rect', { x: h.x - hs / 2, y: h.y - hs / 2, width: hs, height: hs, fill: COL.bg, stroke: COL.sel, 'stroke-width': 0.25, 'pointer-events': 'none' }, svg));
        label(svg, sr.x + sr.w / 2, sr.y + sr.h - 0.8, `${sr.w} × ${sr.h} ft = ${Math.round(sr.w * sr.h)} sf`, { size: 1.1, bold: true, fill: COL.sel });
      }
    }
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
      const via = d.kind !== 'refrig' && d.via && d.via.length ? d.via : null;
      const dpath = d.kind === 'refrig' ? `M${pa.x} ${pa.y}L${pb.x} ${pb.y}` : via ? (d.flex ? 'M' + [pa, ...via, pb].map((q) => `${q.x} ${q.y}`).join('L') : viaPath([pa, ...via, pb], d.kind)) : d.flex ? `M${pa.x} ${pa.y}Q${pa.x} ${pb.y} ${pb.x} ${pb.y}` : toOutlet ? ductPath(pa, pb, d.kind) : `M${pa.x} ${pa.y}H${pb.x}V${pb.y}`;
      const wFt = d.kind === 'refrig' ? 0.2 : Math.max(0.9, dia / 12);
      [A, B].forEach((q) => { if ((q.type === 'supply' || q.type === 'return') && dia) a.eqDia[q.id] = Math.max(a.eqDia[q.id] || 0, dia); });
      items.push({ d, pa, pb, cfm, dia, toOutlet, dpath, wFt, via });
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
        if (p.via) { const pts = [p.pa, ...p.via, p.pb]; let best = 0, bl = -1; for (let i = 0; i < pts.length - 1; i++) { const l = Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y); if (l > bl) { bl = l; best = i; } } const q0 = pts[best], q1 = pts[best + 1]; label(svg, (q0.x + q1.x) / 2, (d.kind === 'return' ? (q0.y + q1.y) / 2 : q0.y) - p.wFt / 2 - 0.5, txt, { size: 1.1, bold: true, fill: COL[d.kind] }); }
        else if (d.flex) label(svg, (p.pa.x + p.pb.x) / 2 - 1.2, (p.pa.y + p.pb.y) / 2 - 1, txt, { size: 1.2, bold: true, fill: COL[d.kind] });
        else if (p.toOutlet) label(svg, p.pa.x + p.wFt / 2 + 0.5, (p.pa.y + p.pb.y) / 2 + 0.4, txt, { size: 1.05, bold: true, anchor: 'start', fill: COL[d.kind] });
        else label(svg, (p.pa.x + p.pb.x) / 2, p.pa.y - p.wFt / 2 - 0.5, txt, { size: 1.15, bold: true, fill: COL[d.kind] });
      }
      if (interactive && state.sel === d.id) el('path', { d: p.dpath, fill: 'none', stroke: COL.sel, 'stroke-width': 0.3, 'stroke-dasharray': '0.4 0.4', 'pointer-events': 'none' }, svg);
    });
    // wall click areas sit above the ducts so a wall can always be picked, and below the equipment
    if (interactive) (state.walls || []).forEach((w) => {
      if (interactive) el('line', { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, stroke: 'transparent', 'stroke-width': 1.8, 'data-wall': w.id, style: 'cursor:pointer' }, svg);
      if (interactive && state.sel === w.id) el('line', { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, stroke: COL.sel, 'stroke-width': 0.35, 'stroke-dasharray': '0.5 0.4', 'pointer-events': 'none' }, svg);
    });
    s.equip.forEach((e) => drawEquip(svg, e, a, interactive));
    if (interactive) {
      const dr = state.draft;
      if (dr && dr.kind === 'room') el('rect', { x: dr.x, y: dr.y, width: dr.w, height: dr.h, fill: COL.sel, 'fill-opacity': 0.1, stroke: COL.sel, 'stroke-width': 0.3, 'stroke-dasharray': '0.6 0.4', 'pointer-events': 'none' }, svg);
      if (dr && dr.kind === 'wall') el('line', { x1: dr.x1, y1: dr.y1, x2: dr.x2, y2: dr.y2, stroke: COL.sel, 'stroke-width': 0.6, 'pointer-events': 'none' }, svg);
      state.calib.forEach((c) => el('circle', { cx: c.x, cy: c.y, r: 0.6, fill: COL.sel, 'pointer-events': 'none' }, svg));
      if (dr && dr.kind === 'room') label(svg, dr.x + dr.w / 2, dr.y + dr.h / 2, `${dr.w} × ${dr.h} ft`, { size: 1.1, bold: true });
    }
    if (interactive) state.photos.forEach((p, i) => {   // photo pins
      if (p.x == null) return;
      const g = el('g', { transform: `translate(${p.x} ${p.y})`, 'data-photo': p.id, style: 'cursor:pointer' }, svg);
      el('rect', { x: -2, y: -1.5, width: 4, height: 5, fill: 'transparent' }, g);   // generous tap area
      el('rect', { x: -1.3, y: -0.9, width: 2.6, height: 1.8, rx: 0.3, fill: COL.warn, stroke: COL.line, 'stroke-width': 0.15 }, g);
      el('circle', { r: 0.55, fill: COL.bg, stroke: COL.line, 'stroke-width': 0.15 }, g);
      label(g, 0, 2.6, String(i + 1), { size: 1, bold: true });
    });
    if (interactive && state.tool === 'select') {      // bend handles on the selected duct
      const sel = items.find((p) => p.d.id === state.sel && p.d.kind !== 'refrig');
      if (sel) {
        const hs = Math.max(0.8, v.w / 80), pts = [sel.pa, ...(sel.via || []), sel.pb];
        for (let i = 0; i < pts.length - 1; i++) { const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2; el('rect', { x: mx - hs * 0.45, y: my - hs * 0.45, width: hs * 0.9, height: hs * 0.9, fill: COL.bg, stroke: COL.sel, 'stroke-width': 0.2, transform: `rotate(45 ${mx} ${my})`, 'data-viaadd': sel.d.id + ':' + i, style: 'cursor:copy' }, svg); }
        (sel.via || []).forEach((q, i) => el('circle', { cx: q.x, cy: q.y, r: hs * 0.6, fill: COL.sel, stroke: COL.bg, 'stroke-width': 0.2, 'data-via': sel.d.id + ':' + i, style: 'cursor:move' }, svg));
      }
    }
    if (interactive && !state.rooms.length && !state.footprint.length && !s.equip.length) {
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2, k = Math.max(1, v.w / 60);
      label(svg, cx, cy - 3 * k, 'Start a new plan', { size: 2.2 * k, bold: true });
      ['Enter an address and press Look up,', 'draw a rectangle footprint,', 'upload a floor plan image to trace,', 'or press Load example home.'].forEach((t, i) => label(svg, cx, cy + (1.5 + i * 2.4) * k, t, { size: 1.5 * k }));
    }
    label(svg, v.x + 1.5, v.y + v.h * 0.07, key === 'proposed' ? 'After' : 'Before', { size: Math.max(2.2, v.h * 0.06), bold: true, anchor: 'start', fill: COL.warn });
    if (state.address) label(svg, v.x + v.w - 1.5, v.y + v.h - 1.5, state.address.split(',').slice(0, 2).join(','), { size: Math.max(1.4, v.h * 0.03), bold: true, anchor: 'end' });
    if (mapShown()) label(svg, v.x + 1, v.y + v.h - 0.8, BX.map.attribution || '', { size: 0.8, anchor: 'start' });
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
    const off = r.sqft && !r.estimated && Math.abs(drawn - r.sqft) / r.sqft > 0.05;
    return `<p class="muted">${esc(bits)}${r.note ? ' · ' + esc(r.note) : ''}${r.estimated ? ' · footprint is a rectangle estimated from this sq ft, not the real shape. Use Edit rooms to adjust.' : ''}${off ? `<br>Drawn rooms total ${drawn} sf vs ${r.sqft} sf on record. <button id="btnScale">Scale rooms to record</button>` : ''}</p>`;
  }

  function suggestHtml(a) {
    const s = sizingNow(); if (!s) return '';
    const hasSys = scn().equip.some((e) => e.type === 'condenser' || e.type === 'ahu'), cur = a.total.installedTons;
    const note = state.record && state.record.stories > 1 && /record/.test(s.label) ? ' The plan shows one floor; sizing uses the whole living area.' : '';
    return `<p class="muted">Suggested system size: <b>${s.rounded} ton</b> (range ${s.low} to ${s.high}) from ${s.sqft} sq ft (${esc(s.label)}) at ${state.cfg.btuPerSqft} BTU/sqft. Installed here: ${tonsLabel(cur)} ton.${note}</p>${hasSys && cur !== s.rounded ? `<button data-fit-sys="${s.rounded}">Set equipment to ${s.rounded} ton</button>` : ''}`;
  }

  function renderResults() {
    if (!state.rooms.length) { $('#results').innerHTML = `<h2>${state.active === 'existing' ? 'Existing' : 'Proposed'} system</h2><p class="muted">Add or trace rooms to see the capacity comparison.</p>`; return; }
    const a = H.analyze(scn(), state.rooms, state.cfg);
    const rows = a.rooms.map((r) => `<tr><td>${esc(r.name)}</td><td>${Math.round(r.sqft)}</td><td>${Math.round(r.required)}</td><td>${Math.round(r.cfm)}</td><td>${Math.round(r.delivered)}</td><td class="${pctCls(r.pct)}">${pctText(r)}</td></tr>`).join('');
    const t = a.total;
    $('#results').innerHTML = `<h2>${state.active === 'existing' ? 'Existing' : 'Proposed'} system</h2>${recordNote()}
      <div class="cards">${statCards(a)}</div>
      <table><tr><th>Room</th><th>sf</th><th>Need BTU</th><th>CFM</th><th>Out BTU</th><th>Match</th></tr>${rows}
      <tr><td><b>Total</b></td><td>${Math.round(t.sqft)}</td><td>${Math.round(t.requiredBtu)}</td><td>${Math.round(t.systemCfm)}</td><td>${Math.round(t.deliveredBtu)}</td><td></td></tr></table>
      ${suggestHtml(a)}
      <p class="muted">Match = delivered / needed: under 85% is starved, over 125% is oversupplied.</p>
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
    if (state.underlay) { const u = state.underlay; u.x *= f; u.y *= f; u.w *= f; u.h *= f; }   // keep the image aligned with the drawing
    if (state.geo) { state.geo.s *= f; state.geo.dx = (state.geo.dx || 0) * f; state.geo.dy = (state.geo.dy || 0) * f; }
    ['existing', 'proposed'].forEach((k) => state.scenarios[k].equip.forEach((e) => { e.x = sc(e.x); e.y = sc(e.y); }));
    fit(); renderRooms(); renderWalls(); renderAll();
  }

  function renderProps() {
    const body = $('#propBody');
    const s = scn();
    const e = s.equip.find((x) => x.id === state.sel);
    const d = s.ducts.find((x) => x.id === state.sel);
    const wl = state.walls.find((x) => x.id === state.sel);
    if (wl) {
      body.className = '';
      body.innerHTML = `<b>${wl.removed ? 'Removed wall' : 'Wall'}</b><p class="muted">${Math.round(Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1) * 10) / 10} ft long</p><label><input data-wprop="removed" type="checkbox" ${wl.removed ? 'checked' : ''} style="width:auto"> Removed wall (drawn hatched)</label><button class="x" data-del>Delete wall</button>`;
      return;
    }
    if (d) {
      body.className = '';
      const auto = H.ductDia(H.analyze(s, state.rooms, state.cfg).ductFlow[d.id] || 0);
      body.innerHTML = `<b>${d.kind} duct</b>` + (d.kind === 'refrig' ? '' : `<label>Diameter (in, blank = auto ${auto || '-'}")<input data-dk="dia" type="number" step="1" value="${d.dia || ''}"></label><label><input data-dk="flex" type="checkbox" ${d.flex ? 'checked' : ''} style="width:auto"> Flex duct (curved)</label>`) + (d.kind === 'refrig' ? '' : `<p class="muted">Drag a small diamond to add a bend, drag a round handle to move it, double-click it to remove it.</p>${d.via && d.via.length ? '<button data-straight>Straighten (remove bends)</button>' : ''}`) + `<button class="x" data-del>Delete</button>`;
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
    h += `<div class="row"><label>X ft<input data-k="x" type="number" step="0.5" value="${e.x}"></label><label>Y ft<input data-k="y" type="number" step="0.5" value="${e.y}"></label></div><div class="row"><button data-rot>Rotate 90&deg; (R)</button><button data-dup>Duplicate (Ctrl+D)</button></div>${matchHtml(e, H.analyze(s, state.rooms, state.cfg))}<button class="x" data-del>Delete item</button>`;
    body.innerHTML = h;
  }

  function renderRooms() {
    $('#roomTable').innerHTML = state.rooms.map((r) => `<div class="rm${state.selRoom === r.id ? ' sel' : ''}" data-room="${r.id}">
      <div class="rrow"><input class="nm" data-rk="name" value="${esc(r.name)}"><label class="ac"><input data-rk="ac" type="checkbox" ${r.noAC ? '' : 'checked'}> A/C</label><button class="x" data-rdel title="Delete room">×</button></div>
      <div class="rrow">${[['x', 'X'], ['y', 'Y'], ['w', 'W'], ['h', 'D']].map(([k, n]) => `<label>${n}<input data-rk="${k}" type="number" step="0.5" value="${r[k]}"></label>`).join('')}</div>
      <div class="rrow"><label>Ceiling ft<input data-rk="ceiling" type="number" step="0.5" value="${r.ceiling || 8}"></label><label>Sun<select data-rk="exposure">${[['low', 'Shaded'], ['normal', 'Normal'], ['high', 'Sunny']].map(([v, t]) => `<option value="${v}"${(r.exposure || 'normal') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div></div>`).join('');
  }

  function renderXcheck() {
    const drawn = Math.round(condArea()), r = state.record || {}, l = state.listing || {};
    const fpA = state.footprint.length > 2 ? Math.round(polyAreaFt2(state.footprint)) : 0;
    const rows = [['Drawn rooms (A/C)', drawn, null], ['Footprint outline', fpA, null], [(r.county || 'County') + ' record', r.sqft, 'rec'], ['Listing', l.sqft, 'lst']].filter((x) => x[1]);
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
    renderResults(); renderProps(); renderXcheck(); renderJobs(); renderMapUI(); renderSizing(); renderQuote(); renderField();
    if (!restoring) commitHist();   // a finished action (drop, rotate, delete, end of a drag) is its own undo step
    document.querySelectorAll('#scnSeg button').forEach((b) => b.classList.toggle('on', b.dataset.scn === state.active));
    document.querySelectorAll('#toolSeg button').forEach((b) => b.classList.toggle('on', b.dataset.tool === state.tool));
    $('#plan').style.cursor = state.tool === 'select' ? 'grab' : 'crosshair';
    save();
  }
  function refreshLight() { renderPlan($('#plan'), state.active, true); renderResults(); renderSizing(); renderQuote(); renderJobState(); save(); }

  /* ---------- building rooms and layouts ---------- */
  function autoLayout(key, opts) {
    opts = opts || {};
    const s = state.scenarios[key], rooms = state.rooms;
    const mk = (type, x, y, extra) => Object.assign({ id: uid('e'), type, x: +x.toFixed(1), y: +y.toFixed(1) }, extra);
    const hall = rooms.find((r) => /^hall$/i.test(r.name)) || rooms[0];
    const ahRoom = rooms.find((r) => /a\/h|air handler/i.test(r.name));
    const home = ahRoom || hall;
    const ahuAt = home ? { x: home.x + home.w / 2, y: home.y + home.h / 2 } : { x: 10, y: 10 };
    // condenser goes 5 ft outside the nearest outside wall to the air handler
    const pts = state.footprint.length ? state.footprint : rooms.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }]);
    const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x)), minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
    const edges = [[ahuAt.y - minY, ahuAt.x, minY - 5], [ahuAt.x - minX, minX - 5, ahuAt.y], [maxX - ahuAt.x, maxX + 5, ahuAt.y], [maxY - ahuAt.y, ahuAt.x, maxY + 5]].sort((p, q) => p[0] - q[0])[0];
    const tons = opts.tons || state.curTons;
    const ahu = mk('ahu', ahuAt.x, ahuAt.y, { tons, label: 'AIR HANDLER' });
    const cond = mk('condenser', edges[1], edges[2], { tons, label: 'CONDENSER' });
    s.equip = [ahu, cond]; s.ducts = [{ id: uid('d'), kind: 'refrig', a: cond.id, b: ahu.id }];
    const regs = [];
    rooms.forEach((r) => {
      if (r.noAC || H.isTransferName(r.name)) return;
      const n = r.w * r.h > 300 ? 2 : 1;
      const wt = Math.max(0.5, Math.round((H.roomLoadBtu(r, state.cfg) / n / 1000) * 10) / 10);
      for (let i = 0; i < n; i++) regs.push(mk('supply', r.x + (r.w * (i + 1)) / (n + 1), r.y + r.h / 2, { room: r.id, weight: wt }));
    });
    s.equip.push(...regs);
    const rh = hall || home;
    const ret = mk('return', rh ? rh.x + rh.w * 0.55 : ahuAt.x, rh ? rh.y + rh.h / 2 : ahuAt.y + 6, { size: '20x20' });
    s.equip.push(ret);
    s.ducts.push({ id: uid('d'), kind: 'return', a: ret.id, b: ahu.id, flex: true });
    const per = opts.perBranch || 3;   // outlets per splitter
    if (opts.splitters) {
      regs.sort((p, q) => p.x - q.x);
      for (let i = 0; i < regs.length; i += per) {
        const chunk = regs.slice(i, i + per);
        const cx = chunk.reduce((t, r) => t + r.x, 0) / chunk.length;
        const sp = mk('splitter', cx, ahuAt.y);
        s.equip.push(sp);
        s.ducts.push({ id: uid('d'), kind: 'supply', a: ahu.id, b: sp.id });
        chunk.forEach((r) => s.ducts.push({ id: uid('d'), kind: 'supply', a: sp.id, b: r.id }));
      }
    } else regs.forEach((r) => s.ducts.push({ id: uid('d'), kind: 'supply', a: ahu.id, b: r.id }));
  }

  function setFootprintAndRooms(fp, beds, baths) {
    state.walls = []; state.generated = true;
    const minX = Math.min(...fp.map((p) => p.x)), minY = Math.min(...fp.map((p) => p.y));
    const w = Math.max(...fp.map((p) => p.x)) - minX, d = Math.max(...fp.map((p) => p.y)) - minY;
    const home = Layout.buildHome(w, d, beds, baths);
    const isRect = fp.length === 4 && new Set(fp.map((p) => p.x)).size === 2 && new Set(fp.map((p) => p.y)).size === 2;
    state.footprint = isRect ? home.footprint.map((p) => ({ x: +(p.x + minX).toFixed(1), y: +(p.y + minY).toFixed(1) })) : fp;
    state.rooms = home.rooms.map((r) => ({ id: uid('r'), ceiling: 8, ...r, x: +(r.x + minX).toFixed(1), y: +(r.y + minY).toFixed(1) }));
    anchorMap();   // a rectangle built after an address lookup sits on that address
    autoLayout('existing', { tons: state.curTons, splitters: true, perBranch: 4 });
    autoLayout('proposed', { tons: Math.max(1.5, state.curTons - 1), splitters: true, perBranch: 3 });
    fit(); renderRooms(); renderWalls(); renderAll();
  }

  function loadSample() {
    state.address = '123 Sample St'; state.parcel = '30-4102-001-0010'; state.model = '4TTR4060'; state.curTons = 5;
    $('#address').value = state.address; $('#parcel').value = state.parcel; $('#model').value = state.model;
    $('#curTons').value = '5';
    setFootprintAndRooms(L.rectFootprint(60, 35), 3, 2);
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
    if (state.tool === 'rooms' && state.selRoom) { state.rooms = state.rooms.filter((r) => r.id !== state.selRoom); state.selRoom = null; renderRooms(); renderAll(); return; }
    if (!state.sel) return;
    if (state.walls.some((w) => w.id === state.sel)) { state.walls = state.walls.filter((w) => w.id !== state.sel); state.sel = null; renderWalls(); renderAll(); return; }
    s.equip = s.equip.filter((e) => e.id !== state.sel);
    s.ducts = s.ducts.filter((d) => d.id !== state.sel && s.equip.some((e) => e.id === d.a) && s.equip.some((e) => e.id === d.b));
    state.sel = null; renderAll();
  }

  /* ---------- detect rooms from the floor-plan image ---------- */
  async function detectRooms() {
    const u = state.underlay;
    if (!u) return setStatus('Upload a floor plan image first.');
    if (!u.scaled) return setStatus('Press Set scale first: click two points on a wall whose length you know, then enter it. Room sizes depend on it.');
    if (state.rooms.length && !(await ask('Replace the current rooms, walls and equipment with the rooms found in the image?'))) return;
    setStatus('Looking for rooms...');
    await new Promise((r) => setTimeout(r, 30));   // let the message paint before the heavy work
    try {
      const im = new Image(); im.src = u.url; await im.decode();
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), cw = Math.round(im.naturalWidth * k), ch = Math.round(im.naturalHeight * k);
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, cw, ch);
      const res = Detect.detect(g.getImageData(0, 0, cw, ch), { pxPerFt: cw / u.w });
      const fx = (px) => snap(u.x + (px * u.w) / cw), fy = (py) => snap(u.y + (py * u.h) / ch);
      let nr = 0, nc = 0, nh = 0;
      const rooms = res.rooms.map((r) => {
        const x0 = fx(r.x), y0 = fy(r.y), w = +(fx(r.x + r.w) - x0).toFixed(1), h = +(fy(r.y + r.h) - y0).toFixed(1), mn = Math.min(w, h), mx = Math.max(w, h);
        const name = w * h < 40 ? 'Closet ' + ++nc : mn <= 3.6 && mx > 9 ? (nh++ ? 'Hall ' + nh : 'Hall') : 'Room ' + ++nr;
        return { id: uid('r'), name, x: x0, y: y0, w, h, ceiling: 8 };
      }).filter((r) => r.w > 0 && r.h > 0);
      if (!rooms.length) return setStatus('No rooms found. Check that the scale is right, or trace the rooms with Draw room.');
      state.rooms = rooms; state.walls = []; state.generated = false; state.selRoom = null; state.sel = null;
      state.footprint = res.outline.map((p) => ({ x: fx(p.x), y: fy(p.y) })).filter((p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y);
      ['existing', 'proposed'].forEach((key) => (state.scenarios[key] = { equip: [], ducts: [] }));
      fit(); renderRooms(); renderWalls(); renderAll();
      setStatus(`Found ${rooms.length} rooms. Rename them and fix any that are wrong with Edit rooms (open-plan areas often come out as one big room, and L-shaped rooms as two). Then press Auto layout.`);
    } catch (e) { setStatus('Could not detect rooms: ' + e.message); }
  }

  function handlePts(r) {
    const x1 = r.x + r.w, y1 = r.y + r.h, mx = r.x + r.w / 2, my = r.y + r.h / 2;
    return [{ k: 'nw', x: r.x, y: r.y }, { k: 'n', x: mx, y: r.y }, { k: 'ne', x: x1, y: r.y }, { k: 'e', x: x1, y: my },
      { k: 'se', x: x1, y: y1 }, { k: 's', x: mx, y: y1 }, { k: 'sw', x: r.x, y: y1 }, { k: 'w', x: r.x, y: my }];
  }
  // Pull an edge position onto a neighbouring room's edge when it is within 0.75 ft.
  function magnet(v, room, axis) {
    let best = v, bd = 0.75;
    state.rooms.forEach((o) => {
      if (o === room) return;
      (axis === 'x' ? [o.x, o.x + o.w] : [o.y, o.y + o.h]).forEach((c) => { if (Math.abs(c - v) < bd) { bd = Math.abs(c - v); best = c; } });
    });
    return best;
  }
  function moveRoom(r, nx, ny) {
    const sx = magnet(nx, r, 'x'), ex = magnet(nx + r.w, r, 'x'), sy = magnet(ny, r, 'y'), ey = magnet(ny + r.h, r, 'y');
    r.x = Math.abs(sx - nx) <= Math.abs(ex - (nx + r.w)) && sx !== nx ? sx : ex !== nx + r.w ? ex - r.w : nx;
    r.y = Math.abs(sy - ny) <= Math.abs(ey - (ny + r.h)) && sy !== ny ? sy : ey !== ny + r.h ? ey - r.h : ny;
    r.x = +r.x.toFixed(1); r.y = +r.y.toFixed(1);
  }
  function resizeRoom(r, o, k, p) {
    let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
    const gx = magnet(snap(p.x), r, 'x'), gy = magnet(snap(p.y), r, 'y');
    if (k.includes('w')) x0 = Math.min(gx, x1 - 3);
    if (k.includes('e')) x1 = Math.max(gx, x0 + 3);
    if (k.includes('n')) y0 = Math.min(gy, y1 - 3);
    if (k.includes('s')) y1 = Math.max(gy, y0 + 3);
    r.x = +x0.toFixed(1); r.y = +y0.toFixed(1); r.w = +(x1 - x0).toFixed(1); r.h = +(y1 - y0).toFixed(1);
  }
  function roomAt(p) {
    return state.rooms.filter((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h).sort((a, b) => a.w * a.h - b.w * b.h)[0];
  }

  function bindPlan() {
    const svg = $('#plan');
    let drag = null;
    const touches = new Map();   // active pointers, for two-finger pinch-zoom and pan
    let pinch = null;
    svg.addEventListener('pointerdown', (ev) => {
      touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (touches.size === 2) {
        drag = null; const [a, b] = [...touches.values()], m = { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 };
        pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: { x: m.clientX, y: m.clientY }, v0: { ...state.view }, p0: svgPoint(svg, m) };
        ev.preventDefault(); return;
      }
      if (touches.size > 2) return;
      const g = ev.target.closest('[data-id]'), du = ev.target.closest('[data-duct]') || ev.target.closest('[data-wall]');
      const p = svgPoint(svg, ev);
      if (state.tool === 'select') {   // bend handles on a selected duct; photo pins
        const pin = ev.target.closest('[data-photo]'), pp = pin && state.photos.find((x) => x.id === pin.dataset.photo);
        if (pp) { drag = { kind: 'pin', ph: pp, dx: p.x - pp.x, dy: p.y - pp.y, sx: p.x, sy: p.y, moved: false }; ev.preventDefault(); return; }
        const vh = ev.target.closest('[data-via]'), va = ev.target.closest('[data-viaadd]');
        if (vh || va) {
          const [id, i] = (vh || va).dataset[vh ? 'via' : 'viaadd'].split(':'), dd = scn().ducts.find((x) => x.id === id);
          if (dd) { dd.via = dd.via || []; if (va) dd.via.splice(+i, 0, { x: snap(p.x), y: snap(p.y) }); drag = { kind: 'via', d: dd, i: +i }; if (va) refreshLight(); ev.preventDefault(); return; }
        }
      }
      if (state.tool === 'rooms') {
        const sr = state.rooms.find((r) => r.id === state.selRoom), tol = Math.max(1, state.view.w / 45);
        const hit = sr && handlePts(sr).find((h) => Math.hypot(h.x - p.x, h.y - p.y) < tol);
        if (hit) drag = { kind: 'rh', room: sr, k: hit.k, o: { x: sr.x, y: sr.y, w: sr.w, h: sr.h } };
        else {
          const r = roomAt(p);
          state.selRoom = r ? r.id : null;
          drag = r ? { kind: 'rm', room: r, dx: p.x - r.x, dy: p.y - r.y } : { kind: 'pan', sx: ev.clientX, sy: ev.clientY, v: { ...state.view } };
          renderRooms(); refreshLight();
        }
        ev.preventDefault(); return;
      }
      if (g) {
        const id = g.dataset.id;
        if (['supply', 'return', 'refrig'].includes(state.tool)) { linkClick(id); return; }
        if (state.tool !== 'select') { startTrace(p, ev); ev.preventDefault(); return; }
        const e = scn().equip.find((x) => x.id === id);
        state.sel = id; drag = { kind: 'eq', e, dx: p.x - e.x, dy: p.y - e.y }; renderAll();
      } else if (du && state.tool === 'select') { state.sel = du.dataset.duct || du.dataset.wall; renderAll(); }
      else if (state.tool !== 'select' && !['supply', 'return', 'refrig'].includes(state.tool)) startTrace(p, ev);
      else { state.sel = null; state.pending = null; drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, v: { ...state.view } }; renderProps(); }
      ev.preventDefault();
    });
    window.addEventListener('pointermove', (ev) => {
      if (touches.has(ev.pointerId)) touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinch && touches.size >= 2) {
        const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, f = Math.min(20, Math.max(0.05, pinch.d0 / d));
        const v0 = pinch.v0, p0 = pinch.p0, w = Math.min(3000, Math.max(8, v0.w * f)), ff = w / v0.w, k = w / svg.getBoundingClientRect().width;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        state.view = { x: p0.x - (p0.x - v0.x) * ff - (mx - pinch.m0.x) * k, y: p0.y - (p0.y - v0.y) * ff - (my - pinch.m0.y) * k, w, h: v0.h * ff };
        svg.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
        mapSoon();
        return;
      }
      if (!drag) return;
      if (drag.kind === 'pin') { const p = svgPoint(svg, ev); if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 0.3) drag.moved = true; if (drag.moved) { drag.ph.x = snap(p.x - drag.dx); drag.ph.y = snap(p.y - drag.dy); refreshLight(); } }
      else if (drag.kind === 'via') { const p = svgPoint(svg, ev); drag.d.via[drag.i] = { x: snap(p.x), y: snap(p.y) }; refreshLight(); }
      else if (drag.kind === 'rm') { const p = svgPoint(svg, ev); moveRoom(drag.room, snap(p.x - drag.dx), snap(p.y - drag.dy)); refreshLight(); }
      else if (drag.kind === 'rh') { resizeRoom(drag.room, drag.o, drag.k, svgPoint(svg, ev)); refreshLight(); }
      else if (drag.kind === 'eq') { const p = svgPoint(svg, ev); drag.e.x = snap(p.x - drag.dx); drag.e.y = snap(p.y - drag.dy); refreshLight(); }
      else if (drag.kind === 'room') { const p = svgPoint(svg, ev), x = snap(p.x), y = snap(p.y); state.draft = { kind: 'room', x: Math.min(drag.x0, x), y: Math.min(drag.y0, y), w: Math.abs(x - drag.x0), h: Math.abs(y - drag.y0) }; refreshLight(); }
      else if (drag.kind === 'wall') { const p = svgPoint(svg, ev); let x = snap(p.x), y = snap(p.y); if (Math.abs(x - drag.x0) >= Math.abs(y - drag.y0)) y = drag.y0; else x = drag.x0; state.draft = { kind: 'wall', x1: drag.x0, y1: drag.y0, x2: x, y2: y }; refreshLight(); }
      else if (drag.kind === 'map') { const p = svgPoint(svg, ev); state.geo.dx = drag.dx + (p.x - drag.px); state.geo.dy = drag.dy + (p.y - drag.py); refreshLight(); }
      else if (drag.kind === 'img') { const p = svgPoint(svg, ev), u = state.underlay; u.x = drag.ux + (p.x - drag.px); u.y = drag.uy + (p.y - drag.py); refreshLight(); }
      else if (drag.kind === 'pan') {
        const r = svg.getBoundingClientRect(), k = Math.max(drag.v.w / r.width, drag.v.h / r.height);
        state.view = { ...drag.v, x: drag.v.x - (ev.clientX - drag.sx) * k, y: drag.v.y - (ev.clientY - drag.sy) * k };
        svg.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
        mapSoon();
      }
    });
    const endPointer = (ev) => { touches.delete(ev.pointerId); if (touches.size < 2) pinch = null; };
    window.addEventListener('pointercancel', endPointer);
    window.addEventListener('pointerup', (ev) => {
      endPointer(ev);
      if (drag && drag.kind === 'room' && state.draft && state.draft.w >= 3 && state.draft.h >= 3) {
        const d = state.draft; state.generated = false; state.rooms.push({ id: uid('r'), name: 'Room ' + (state.rooms.length + 1), x: d.x, y: d.y, w: d.w, h: d.h, ceiling: 8 }); renderRooms();
      } else if (drag && drag.kind === 'wall' && state.draft && Math.abs(state.draft.x2 - state.draft.x1) + Math.abs(state.draft.y2 - state.draft.y1) >= 2) {
        const d = state.draft; state.walls.push({ id: uid('w'), x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, removed: false }); renderWalls();
      }
      if (drag && ['room', 'wall'].includes(drag.kind)) state.draft = null;
      if (drag && (drag.kind === 'rm' || drag.kind === 'rh')) { state.generated = false; renderRooms(); }
      if (drag && drag.kind === 'pin' && !drag.moved) openViewer(drag.ph.id);
      if (drag && drag.kind !== 'pan') renderAll();
      drag = null;
    });
    // Tracing tools: room/wall start a drag, moveimg drags the underlay, calib collects two points.
    function startTrace(p) {
      if (state.tool === 'room' || state.tool === 'wall') drag = { kind: state.tool, x0: snap(p.x), y0: snap(p.y) };
      else if (state.tool === 'movemap' && state.geo) drag = { kind: 'map', px: p.x, py: p.y, dx: state.geo.dx || 0, dy: state.geo.dy || 0 };
      else if (state.tool === 'moveimg' && state.underlay) drag = { kind: 'img', px: p.x, py: p.y, ux: state.underlay.x, uy: state.underlay.y };
      else if (state.tool === 'calib' && state.underlay) {
        state.calib.push({ x: p.x, y: p.y });
        if (state.calib.length === 2) {
          const [a, b] = state.calib, meas = Math.hypot(b.x - a.x, b.y - a.y);
          ask('Real-world distance between the two points (feet)?', true).then((v) => {
            const ft = parseFloat(v);
            if (ft > 0 && meas > 0) { const f = ft / meas, u = state.underlay; u.x = a.x - (a.x - u.x) * f; u.y = a.y - (a.y - u.y) * f; u.w *= f; u.h *= f; u.scaled = true; }
            state.calib = []; state.tool = 'select'; renderAll();
          });
          return;
        }
        renderAll();
      }
    }
    svg.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const p = svgPoint(svg, ev), f = ev.deltaY > 0 ? 1.12 : 1 / 1.12, v = state.view;
      state.view = { x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f, w: v.w * f, h: v.h * f };
      svg.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
      mapSoon();
    }, { passive: false });
    svg.addEventListener('dblclick', (ev) => {   // double-click a bend handle to remove the bend
      const vh = ev.target.closest('[data-via]'); if (!vh) return;
      const [id, i] = vh.dataset.via.split(':'), dd = scn().ducts.find((x) => x.id === id);
      if (dd && dd.via) { dd.via.splice(+i, 1); renderAll(); }
    });
    window.addEventListener('keydown', (ev) => {
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      const mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
      if (ev.key === 'Delete' || ev.key === 'Backspace') removeSel();
      else if (mod && k === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); }
      else if (mod && k === 'y') { ev.preventDefault(); redo(); }
      else if (mod && k === 'd') { ev.preventDefault(); duplicateSel(); }
      else if (!mod && k === 'r') rotateSel();
    });
  }

  /* ---------- presentation ---------- */
  function present() {
    const A = H.analyze(state.scenarios.existing, state.rooms, state.cfg), B = H.analyze(state.scenarios.proposed, state.rooms, state.cfg);
    $('#pTitle').textContent = state.address || 'HVAC proposal';
    const co = BX.company, coLines = [co.phone, co.email, co.website, co.license && 'Lic. ' + co.license].filter(Boolean).map(esc).join(' · ');
    $('#pCo').innerHTML = (BX.logo ? `<img src="${esc(BX.logo)}" alt="">` : '') + `<b>${esc(co.name || BX.name)}</b>${coLines}`;
    $('#pDisc').textContent = BX.disclaimer; $('#pPowered').textContent = BX.poweredBy;
    $('#pSub').textContent = [state.parcel && 'Parcel / Folio ' + state.parcel, state.model && 'Current unit ' + state.model, new Date().toLocaleDateString()].filter(Boolean).join(' · ');
    $('#present').hidden = false;
    renderPlan($('#planA'), 'existing', false); renderPlan($('#planB'), 'proposed', false);
    $('#statA').innerHTML = statCards(A); $('#statB').innerHTML = statCards(B);
    const rows = A.rooms.map((r, i) => { const q = B.rooms[i]; return `<tr><td>${esc(r.name)}</td><td>${Math.round(r.sqft)}</td><td>${Math.round(r.required)}</td><td>${Math.round(r.delivered)}</td><td class="${pctCls(r.pct)}">${pctText(r)}</td><td>${Math.round(q.delivered)}</td><td class="${pctCls(q.pct)}">${pctText(q)}</td></tr>`; }).join('');
    $('#pTable').innerHTML = `<table><tr><th>Room</th><th>sq ft</th><th>Needed BTU</th><th>Existing BTU</th><th>Existing match</th><th>Proposed BTU</th><th>Proposed match</th></tr>${rows}</table>
      <p>Condenser size change: <b>${tonsLabel(A.total.installedTons)} ton &rarr; ${tonsLabel(B.total.installedTons)} ton</b> (${Math.round(A.total.sqftPerTon)} &rarr; ${Math.round(B.total.sqftPerTon)} sq ft per ton).</p>`;
    if (BX.features.showPrices && BX.catalog) {
      const qa = quoteFor('existing'), qb = quoteFor('proposed'), main = (q) => q.lines.filter((l) => /^(c|a|h):/.test(l.key)).map((l) => esc(l.desc)).join(', ') || 'no equipment yet';
      $('#pTable').insertAdjacentHTML('beforeend', `<h3 style="margin-top:14px">Estimated price</h3><table><tr><th></th><th>Existing layout</th><th>Proposed layout</th></tr>
        <tr><td>Equipment</td><td style="text-align:right">${main(qa)}</td><td style="text-align:right">${main(qb)}</td></tr>
        <tr><td>Materials and markup</td><td>${$$(qa.materials + qa.markup)}</td><td>${$$(qb.materials + qb.markup)}</td></tr><tr><td>Tax</td><td>${$$(qa.tax)}</td><td>${$$(qb.tax)}</td></tr>
        <tr><td>Labor</td><td>${$$(qa.labor)}</td><td>${$$(qb.labor)}</td></tr><tr><td><b>Total</b></td><td><b>${$$(qa.total)}</b></td><td><b>${$$(qb.total)}</b></td></tr></table>`);
    }
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
    $('#btnDetect').onclick = detectRooms;
    $('#btnPhoto').onclick = () => { startGps(); $('#photoCam').click(); };
    $('#btnPhotoPick').onclick = () => $('#photoPick').click();
    $('#photoCam').onchange = (e) => { addPhotos([...e.target.files], true); e.target.value = ''; };
    $('#photoPick').onchange = (e) => { addPhotos([...e.target.files], false); e.target.value = ''; };
    $('#photoList').addEventListener('click', (e) => {
      const row = e.target.closest('[data-ph]'); if (!row) return; const id = row.dataset.ph;
      if (e.target.matches('[data-phimg]')) openViewer(id); else if (e.target.matches('[data-phpin]')) pinPhoto(id); else if (e.target.matches('[data-phdel]')) deletePhoto(id);
    });
    $('#photoList').addEventListener('input', (e) => { if (!e.target.matches('[data-phnote]')) return; const p = state.photos.find((x) => x.id === e.target.closest('[data-ph]').dataset.ph); if (p) { p.note = e.target.value; save(); } });
    $('#pvNote').oninput = (e) => { const p = state.photos.find((x) => x.id === viewId); if (p) { p.note = e.target.value; save(); } };
    $('#pvClose').onclick = closeViewer; $('#pvDel').onclick = () => { const id = viewId; $('#pv').hidden = true; viewId = null; deletePhoto(id); };
    $('#pv').addEventListener('click', (e) => { if (e.target.id === 'pv') closeViewer(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#pv').hidden) closeViewer(); });
    $('#btnAddMeasure').onclick = () => {
      const val = $('#msVal').value.trim(); if (!val) return;
      state.measures.push({ id: uid('m'), what: $('#msWhat').value, val, room: $('#msRoom').value, note: $('#msNote').value.trim(), ts: localIso(new Date()) });
      $('#msVal').value = ''; $('#msNote').value = ''; renderAll();
    };
    $('#measureList').addEventListener('click', (e) => { if (!e.target.matches('[data-msdel]')) return; const id = e.target.closest('[data-ms]').dataset.ms; state.measures = state.measures.filter((m) => m.id !== id); renderAll(); });
    $('#jobNotes').oninput = (e) => { state.notes = e.target.value.slice(0, 5000); refreshLight(); };
    fillSizingSelects();
    $('#szEra').onchange = (e) => { state.sizing.era = e.target.value; setFactorFromTable(); renderAll(); };
    $('#szEnv').onchange = (e) => { state.sizing.envelope = e.target.value; setFactorFromTable(); renderAll(); };
    $('#szBasis').onchange = (e) => { state.sizing.basis = e.target.value; renderAll(); };
    $('#results').addEventListener('click', (e) => { const v = e.target.dataset && e.target.dataset.fitSys; if (!v) return; scn().equip.forEach((x) => { if (x.type === 'condenser' || x.type === 'ahu') x.tons = +v; }); renderAll(); });
    $('#quote').addEventListener('click', (e) => {
      const q = quoteFor(state.active), name = `${state.address || 'Job'} - ${state.active} system`;
      if (e.target.id === 'btnCsv') downloadText('quote-' + state.active + '.csv', Sizing.csv(q, name), 'text/csv');
      else if (e.target.id === 'btnCopyList') { const t = listText(q, name); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => setStatus('Parts list copied.'), () => setStatus('Could not copy. Use Export CSV instead.')); }
    });
    $('#mapOn').onchange = (e) => { state.mapOn = e.target.checked; renderAll(); };
    $('#mapOp').oninput = (e) => { state.mapOp = e.target.value / 100; refreshLight(); };
    $('#mapRot').onchange = (e) => { if (state.geo) { state.geo.rot = num(e.target.value, 0); renderAll(); } };
    $('#btnMoveMap').onclick = () => { if (!state.geo) return; state.tool = 'movemap'; $('#hint').textContent = 'Drag to slide the map until the plan lines up with the real building.'; renderAll(); };
    $('#btnGeo').onclick = () => { const gj = geoJSON(); if (!gj) return setStatus('Look up an address first so the plan has a location.'); downloadText((state.address || 'plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.geojson', JSON.stringify(gj, null, 1), 'application/geo+json'); setStatus('Exported GeoJSON with the building, rooms and equipment.'); };
    $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
    document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => { document.body.dataset.tab = b.dataset.tab; document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); refreshLight(); }));
    $('#btnCalib').onclick = () => { if (!state.underlay) return setStatus('Upload a floor plan image first.'); state.tool = 'calib'; state.calib = []; $('#hint').textContent = 'Click two points on a wall of known length, then enter the length in feet.'; renderAll(); };
    $('#btnMoveImg').onclick = () => { if (!state.underlay) return setStatus('Upload a floor plan image first.'); state.tool = 'moveimg'; $('#hint').textContent = 'Drag to slide the image into place.'; renderAll(); };
    $('#imgShow').onchange = (e) => { if (state.underlay) { state.underlay.show = e.target.checked; renderAll(); } };
    $('#imgOp').oninput = (e) => { if (state.underlay) { state.underlay.op = e.target.value / 100; refreshLight(); } };
    $('#btnRmImg').onclick = () => { state.underlay = null; renderAll(); };
    $('#btnClearRooms').onclick = async () => {
      if (!(await okToReplace())) return;
      state.rooms = []; state.walls = []; state.footprint = []; state.address = ''; state.parcel = ''; state.model = '';
      ['address', 'parcel', 'model'].forEach((i) => { $('#' + i).value = ''; });
      ['existing', 'proposed'].forEach((k) => (state.scenarios[k] = { equip: [], ducts: [] }));
      resetJob(); state.generated = false; $('#jobState').dataset.msg = '';
      fit(); renderRooms(); renderWalls(); renderAll();
    };
    [['lsSqft', 'sqft'], ['lsBeds', 'beds'], ['lsBaths', 'baths']].forEach(([id, k]) => { $('#' + id).oninput = (e) => { state.listing[k] = e.target.value === '' ? null : parseFloat(e.target.value); renderXcheck(); save(); }; });
    $('#xcheck').addEventListener('click', (e) => { if (e.target.dataset.useq) scaleToSqft(parseFloat(e.target.dataset.useq)); });
    $('#scnSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { state.active = b.dataset.scn; state.sel = state.pending = null; renderAll(); } });
    $('#toolSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { state.tool = b.dataset.tool; state.pending = null; $('#hint').textContent = state.tool === 'select' ? 'Drag equipment to move it.' : state.tool === 'room' ? 'Drag a rectangle over a room on the image. Rename and fine-tune it in the Rooms table.' : state.tool === 'wall' ? 'Drag to draw a wall (snaps horizontal or vertical).' : state.tool === 'rooms' ? 'Click a room, drag it to move it, drag a handle to resize it. Edges snap to neighbouring rooms. Del deletes the room.' : 'Click the first item, then the second item to connect them.'; renderAll(); } });
    document.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => addEquip(b.dataset.add)));
    $('#btnFit').onclick = () => { fit(); renderAll(); };
    $('#btnAuto').onclick = async () => { if (!state.rooms.length) return setStatus('Add or trace rooms first.'); if (await ask('Replace the ' + state.active + ' layout with an automatic one?')) { autoLayout(state.active, { splitters: state.active === 'proposed' }); renderAll(); } };
    $('#btnCopy').onclick = () => { state.scenarios.proposed = JSON.parse(JSON.stringify(state.scenarios.existing)); state.active = 'proposed'; renderAll(); };
    $('#btnPresent').onclick = present;
    $('#pClose').onclick = () => { $('#present').hidden = true; };
    $('#btnShare').onclick = () => sharePicture(false);
    $('#pShare').onclick = () => sharePicture(true);
    $('#btnSample').onclick = async () => { if (!(await okToReplace())) return; resetJob(); $('#jobState').dataset.msg = ''; loadSample(); };
    $('#btnSaveJob').onclick = () => putJob(false);
    $('#btnSaveNew').onclick = () => putJob(true);
    $('#btnExport').onclick = exportJob;
    $('#btnImportBtn').onclick = () => $('#importFile').click();
    $('#importFile').onchange = (e) => { importJob(e.target.files[0]); e.target.value = ''; };
    $('#jobList').addEventListener('click', (e) => { const b = e.target.closest('[data-jact]'); if (!b) return; const id = b.closest('[data-jid]').dataset.jid; if (b.dataset.jact === 'open') openJob(id); else if (b.dataset.jact === 'copy') copyJob(id); else deleteJob(id); });
    $('#pPrint').onclick = () => window.print();
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
    $('#btnAddRoom').onclick = () => { const v = state.view || { x: 0, y: 0, w: 60, h: 40 }, nr = { id: uid('r'), name: 'Room ' + (state.rooms.length + 1), x: snap(v.x + v.w / 2 - 6), y: snap(v.y + v.h / 2 - 6), w: 12, h: 12, ceiling: 8 }; state.rooms.push(nr); state.selRoom = nr.id; state.generated = false; state.tool = 'rooms'; renderRooms(); renderAll(); };
    $('#btnRectSqft').onclick = () => { const sq = num($('#rectSqft').value, 0); if (!(sq >= 300)) return setStatus('Enter the living square footage (300 or more).'); const e = L.estimateFootprint(sq, 1); setFootprintAndRooms(L.rectFootprint(e.w, e.d), Math.max(1, num($('#beds').value, 3)), Math.max(1, num($('#baths').value, 2))); setStatus(`Built a ${e.w} x ${e.d} ft rectangle from ${sq} sq ft. Use Edit rooms to adjust.`); };
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
        if (r.lat != null) state.point = { lat: r.lat, lon: r.lon };
        if (BX.sizing && state.record && state.record.yearBuilt) { const era = Sizing.eraFromYear(BX.sizing, state.record.yearBuilt); if (era) { state.sizing.era = era; setFactorFromTable(); } }
        if (state.record) {
          if (state.record.beds) $('#beds').value = state.record.beds;
          if (state.record.baths) $('#baths').value = Math.max(1, Math.round(state.record.baths));
        }
        let fp = r.footprint, est = false;
        if (!fp && state.record && state.record.sqft) { const e = L.estimateFootprint(state.record.sqft, state.record.stories); fp = L.rectFootprint(e.w, e.d); est = true; }
        const replace = state.generated || !state.rooms.length;
        if (fp && replace) {
          setFootprintAndRooms(fp, num($('#beds').value, 3), num($('#baths').value, 2));
          if (r.footprint && r.geo) state.geo = r.geo; else anchorMap();     // a real outline carries its own position; an estimate sits on the address point
          state.mapOn = !!state.geo && !!BX.map.tileUrl; fit(); renderAll();
          if (est && state.record) { state.record.estimated = true; renderAll(); }
        }
        else { if (fp) r.notes.push('Existing rooms kept (traced or example). Use Blank plan to regenerate.'); renderAll(); }
        if (!fp) { $('#rectW').closest('details').open = true; if (state.record && state.record.sqft) $('#rectSqft').value = state.record.sqft; }
        setStatus((r.footprint ? 'Building outline loaded. ' : est ? 'Outline unavailable, so rooms use a rectangle estimated from the record sq ft. ' : 'No outline. Enter living sq ft (or width and depth) below and build the footprint. ') + r.notes.join(' '));
      } catch (e) { setStatus('Lookup failed (' + e.message + '). Address and county lookups need direct internet access, which some hosted pages block. Open the downloaded index.html, or draw a rectangle footprint.'); }
      $('#btnLookup').disabled = false;
    };

    $('#roomTable').addEventListener('input', (e) => {
      const tr = e.target.closest('[data-room]'); if (!tr) return;
      const r = state.rooms.find((x) => x.id === tr.dataset.room), k = e.target.dataset.rk;
      if (k === 'ac') r.noAC = !e.target.checked; else r[k] = k === 'name' || k === 'exposure' ? e.target.value : num(e.target.value, r[k]);
      refreshLight();
    });
    $('#roomTable').addEventListener('click', (e) => {
      const row = e.target.closest('[data-room]');
      if (row && !e.target.matches('[data-rdel]') && state.selRoom !== row.dataset.room) { state.selRoom = row.dataset.room; document.querySelectorAll('#roomTable .rm').forEach((d) => d.classList.toggle('sel', d === row)); refreshLight(); }
      if (!e.target.matches('[data-rdel]')) return;
      state.rooms = state.rooms.filter((r) => r.id !== e.target.closest('[data-room]').dataset.room); renderRooms(); renderAll();
    });
    $('#propBody').addEventListener('input', (e) => {
      if (e.target.dataset.wprop) { const wl = state.walls.find((x) => x.id === state.sel); if (wl) { wl.removed = e.target.checked; renderWalls(); renderAll(); } return; }
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
    $('#propBody').addEventListener('click', (e) => {
      if (e.target.matches('[data-del]')) removeSel();
      else if (e.target.matches('[data-rot]')) rotateSel();
      else if (e.target.matches('[data-dup]')) duplicateSel();
      else if (e.target.matches('[data-apply-match]')) { const x = scn().equip.find((q) => q.id === state.sel); if (x) { x[x.type === 'head' ? 'btu' : 'tons'] = +e.target.dataset.applyMatch; renderAll(); } }
      else if (e.target.matches('[data-straight]')) { const du = scn().ducts.find((x) => x.id === state.sel); if (du) { du.via = []; renderAll(); } }
    });
  }

  function applyBrand() {
    document.title = BX.name;
    $('#btuSqft').value = state.cfg.btuPerSqft;
    $('#brandName').textContent = BX.name;
    if (BX.logo) { $('#brandLogo').src = BX.logo; $('#brandLogo').hidden = false; }
    if (BX.accent) document.documentElement.style.setProperty('--acc', BX.accent);
    $('#btnSample').hidden = !BX.features.sample;
    $('#btnLookup').hidden = !BX.features.lookup;
    $('#pPrint').hidden = !BX.features.print;
    if (!BX.features.lookup) setStatus('Address lookup is not available in this build. Type the folio # and draw the outline instead.');
  }

  applyBrand(); bindUI(); bindPlan();
  if (load()) {
    $('#address').value = state.address; $('#parcel').value = state.parcel; $('#model').value = state.model;
    $('#curTons').value = state.curTons; $('#btuSqft').value = state.cfg.btuPerSqft; $('#jobName').value = state.jobName || '';
    ['sqft', 'beds', 'baths'].forEach((k) => { const el2 = $('#ls' + k[0].toUpperCase() + k.slice(1)); if (el2 && state.listing[k] != null) el2.value = state.listing[k]; });
    state.walls = state.walls || []; state.theme = state.theme || 'paper'; applyTheme();
    if (!state.view) fit(); renderRooms(); renderWalls(); renderAll();
  } else { fit(); renderRooms(); renderWalls(); renderAll(); }   // first visit: blank plan
  // installable and usable offline (needs https or localhost; the build supplies sw.js and the manifest)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false; });
  $('#btnInstall').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#btnInstall').hidden = true; };
  const netBadge = () => { $('#net').hidden = navigator.onLine; };
  window.addEventListener('online', netBadge); window.addEventListener('offline', netBadge); netBadge();
  document.body.dataset.tab = 'plan';
  lastSnap = sig(); updateUndoButtons();
  setTimeout(cleanUpMedia, 4000);
})();
