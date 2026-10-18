const test = require('node:test'), assert = require('node:assert');
const Jobber = require('../jobber.js'), RoomPlan = require('../roomplan.js'), { createServer } = require('../server/jobber-proxy/server.js');

test('noteText lists sizing, equipment, measurements and photos', () => {
  const t = Jobber.noteText({ address: '1 A St', parcel: 'P1', sizing: { sqft: 1500, label: 'county record', btuPerSqft: 30, tons: 3.8, rounded: 4, low: 3.5, high: 4.5 }, systems: [{ name: 'Proposed system', installedTons: 4, requiredTons: 3.8, pct: 105, equipment: ['Condenser: 4 ton'], total: 9000 }], measures: [{ what: 'Ceiling height', val: "9'", room: 'Living' }], photos: [{ ts: '2026-01-01T10:00', lat: 27.9, lon: -82.4, note: 'attic' }], notes: 'dog in yard' });
  for (const s of ['1 A St', 'Parcel / folio: P1', 'suggested 4 ton', 'Condenser: 4 ton', '$9,000', "Ceiling height: 9'", '27.90000, -82.40000', 'dog in yard']) assert.ok(t.includes(s), s);
});

test('roomplan: simple format converts metres to feet and moves to origin', () => {
  const r = RoomPlan.parse(JSON.stringify({ walls: [{ x1: 1, y1: 1, x2: 5, y2: 1 }, { x1: 5, y1: 1, x2: 5, y2: 4 }] }));
  assert.equal(r.walls[0].x1, 0); assert.equal(r.walls[0].y1, 0);
  assert.ok(Math.abs(r.width - 13.1) < 0.1); assert.ok(Math.abs(r.depth - 9.8) < 0.1);
});

test('roomplan: transform + dimensions format, nested and flat', () => {
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 1.2, 3, 1]; // column-major, centre (2, 3), along x
  const flatR = RoomPlan.parse(JSON.stringify({ walls: [{ dimensions: [4, 2.4, 0.1], transform: m }], doors: [{}] }));
  assert.ok(Math.abs(flatR.walls[0].x2 - 13.1) < 0.1); assert.equal(flatR.walls[0].y1, flatR.walls[0].y2); assert.equal(flatR.openings, 1);
  const nested = RoomPlan.parse(JSON.stringify({ walls: [{ dimensions: [4, 2.4, 0.1], transform: [m.slice(0, 4), m.slice(4, 8), m.slice(8, 12), m.slice(12)] }] }));
  assert.deepEqual(nested.walls, flatR.walls);
});

test('roomplan: bad input gives a message', () => {
  assert.ok(RoomPlan.parse('nope').error); assert.ok(RoomPlan.parse('{"walls":[]}').error); assert.ok(RoomPlan.parse('{"walls":[{"a":1}]}').error);
});

test('proxy (mock): auth, search, sync, validation, live refuses', async () => {
  const srv = createServer({ key: 'k', mock: true, origin: '*' }); await new Promise((r) => srv.listen(0, r));
  const cfg = { proxyUrl: 'http://127.0.0.1:' + srv.address().port, key: 'k' };
  try {
    assert.equal((await Jobber.health(cfg)).mode, 'mock');
    await assert.rejects(Jobber.health({ ...cfg, key: 'bad' }), /not accepted/);
    const j = await Jobber.jobs(cfg, 'clearwater'); assert.equal(j.jobs.length, 1);
    const ok = await Jobber.sync(cfg, 'job_1001', { note: 'hi', photos: [{ name: 'a.jpg', mime: 'image/jpeg', dataBase64: Buffer.from('xx').toString('base64') }, { mime: 'text/html', dataBase64: 'eA==' }], picture: { dataBase64: 'eA==' }, measurements: [{}] });
    assert.deepEqual([ok.ok, ok.attachments], [true, 2]);
    assert.equal(srv.mockSynced[0].photos.length, 1);
    await assert.rejects(Jobber.sync(cfg, 'job_1001', { photos: [] }), /Missing note/);
    await assert.rejects(Jobber.jobs({ proxyUrl: '' }), /No Jobber proxy/);
  } finally { srv.close(); }
  const live = createServer({ key: 'k', mock: false }); await new Promise((r) => live.listen(0, r));
  const lc = { proxyUrl: 'http://127.0.0.1:' + live.address().port, key: 'k' };
  try { assert.equal((await Jobber.health(lc)).connected, false); await assert.rejects(Jobber.jobs(lc, ''), /not set up yet/); } finally { live.close(); }
});
