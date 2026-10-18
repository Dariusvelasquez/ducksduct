/* Jobber sync proxy. No dependencies. Run:  node server/jobber-proxy/server.js
 *
 * MOCK mode (MOCK=1, the default when no Jobber credentials are set) fakes a Jobber account so the app's whole sync
 * flow can be tested. LIVE mode needs a Jobber app (client id and secret from Jobber's Developer Center), and the two
 * functions in live.js filled in from Jobber's GraphQL schema: they are NOT written yet because Jobber's schema could not
 * be read when this was built. See docs/JOBBER.md.
 *
 * Environment: PORT (8790), ACCESS_KEY (required), ALLOW_ORIGIN (the app's address, or * for testing), MOCK. */
const http = require('http');

const MOCK_JOBS = [
  { id: 'job_1001', title: 'Replace 3 ton system', client: 'Pat Example', address: '123 Main St, Tampa, FL', status: 'Active' },
  { id: 'job_1002', title: 'Ductwork repair', client: 'Sam Sample', address: '88 Bay Dr, Clearwater, FL', status: 'Active' },
  { id: 'job_1003', title: 'Mini-split install', client: 'Alex Demo', address: '5332 Main St, New Port Richey, FL', status: 'Requires invoicing' },
];

function createServer(opts) {
  const o = Object.assign({ key: process.env.ACCESS_KEY || '', origin: process.env.ALLOW_ORIGIN || '*', mock: process.env.MOCK === '1' || !process.env.JOBBER_CLIENT_ID, maxBytes: 40e6 }, opts);
  if (!o.key) throw new Error('ACCESS_KEY is required');
  const live = o.mock ? null : require('./live.js');
  const synced = [];   // mock only: what the app has sent

  const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': o.origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > o.maxBytes) { reject(Object.assign(new Error('Request too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204, {});
      const url = new URL(req.url, 'http://x');
      if (req.headers.authorization !== 'Bearer ' + o.key) return send(res, 401, { error: 'Unauthorized' });
      if (url.pathname === '/health') return send(res, 200, { ok: true, mode: o.mock ? 'mock' : 'live', connected: o.mock ? true : live.connected() });
      if (url.pathname === '/jobs' && req.method === 'GET') {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const list = o.mock ? MOCK_JOBS.filter((j) => !q || [j.title, j.client, j.address].join(' ').toLowerCase().includes(q)) : await live.findJobs(q);
        return send(res, 200, { jobs: list });
      }
      const m = /^\/jobs\/([^/]+)\/sync$/.exec(url.pathname);
      if (m && req.method === 'POST') {
        let p; try { p = JSON.parse(await readBody(req)); } catch (e) { return e.code === 413 ? send(res, 413, { error: e.message }) : send(res, 400, { error: 'Body must be JSON' }); }
        if (!p || typeof p.note !== 'string') return send(res, 400, { error: 'Missing note' });
        const photos = Array.isArray(p.photos) ? p.photos.filter((x) => x && /^image\//.test(x.mime || '') && typeof x.dataBase64 === 'string') : [];
        const attachments = photos.length + (p.picture && p.picture.dataBase64 ? 1 : 0);
        if (o.mock) { const rec = { jobId: decodeURIComponent(m[1]), note: p.note, photos: photos.map((x) => ({ name: x.name, bytes: Buffer.from(x.dataBase64, 'base64').length, ts: x.ts, lat: x.lat, lon: x.lon, note: x.note })), picture: !!(p.picture && p.picture.dataBase64), measurements: p.measurements || [], design: p.design ? Object.keys(p.design) : [] }; synced.push(rec); return send(res, 200, { ok: true, noteId: 'note_' + synced.length, attachments }); }
        return send(res, 200, await live.addNote(decodeURIComponent(m[1]), { ...p, photos }));
      }
      if (o.mock && url.pathname === '/_mock/synced') return send(res, 200, { synced });
      send(res, 404, { error: 'Not found' });
    } catch (e) { send(res, e.code === 413 ? 413 : 500, { error: e.message }); }
  });
  server.mockSynced = synced;
  return server;
}

module.exports = { createServer };
if (require.main === module) {
  const port = +process.env.PORT || 8790;
  createServer().listen(port, () => console.log(`Jobber proxy (${process.env.MOCK === '1' || !process.env.JOBBER_CLIENT_ID ? 'MOCK' : 'LIVE'}) on http://localhost:${port}`));
}
