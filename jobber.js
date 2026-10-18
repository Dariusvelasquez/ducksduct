/* Client for the Jobber sync proxy, and the job-note text builder. Pure except for fetch.
 *
 * The app never talks to Jobber directly: Jobber's login credentials must stay on a server. This client talks to a small
 * proxy (server/jobber-proxy) using the contract below. See docs/JOBBER.md.
 *   GET  {proxy}/health               -> { ok, mode, connected }
 *   GET  {proxy}/jobs?q=text          -> { jobs: [{ id, title, client, address, status }] }
 *   POST {proxy}/jobs/{id}/sync       -> { ok, noteId, attachments }   body: { note, photos[], picture, measurements[], design }
 * Every request carries  Authorization: Bearer <access key>. */
(function (root) {
  async function call(cfg, path, opts) {
    if (!cfg || !cfg.proxyUrl) throw new Error('No Jobber proxy address is set.');
    const base = cfg.proxyUrl.replace(/\/+$/, '');
    let res;
    try { res = await fetch(base + path, { ...opts, headers: { ...(opts && opts.headers), Authorization: 'Bearer ' + (cfg.key || ''), 'Content-Type': 'application/json' } }); }
    catch (e) { throw new Error('Could not reach the Jobber proxy (' + e.message + ').'); }
    let body = null; try { body = await res.json(); } catch (e) { /* not JSON */ }
    if (res.status === 401) throw new Error('The access key was not accepted.');
    if (!res.ok) throw new Error((body && body.error) || 'The Jobber proxy returned an error (' + res.status + ').');
    return body;
  }
  const health = (cfg) => call(cfg, '/health');
  const jobs = (cfg, q) => call(cfg, '/jobs?q=' + encodeURIComponent(q || ''));
  const sync = (cfg, id, payload) => call(cfg, '/jobs/' + encodeURIComponent(id) + '/sync', { method: 'POST', body: JSON.stringify(payload) });

  // Plain-text summary of the design, for a Jobber note (or to paste into one by hand).
  function noteText(d) {
    const L = [], money = (v) => '$' + Math.round(v).toLocaleString();
    L.push(`HVAC layout: ${d.address || 'unnamed job'}`);
    if (d.parcel) L.push(`Parcel / folio: ${d.parcel}`);
    if (d.record) L.push(`County record: ${[d.record.county, d.record.sqft && d.record.sqft + ' sq ft', d.record.beds && d.record.beds + ' bd', d.record.baths && d.record.baths + ' ba', d.record.yearBuilt && 'built ' + d.record.yearBuilt].filter(Boolean).join(', ')}`);
    if (d.sizing) L.push(`Sizing: ${d.sizing.sqft} sq ft (${d.sizing.label}) at ${d.sizing.btuPerSqft} BTU/sqft = ${d.sizing.tons} ton; suggested ${d.sizing.rounded} ton (${d.sizing.low} to ${d.sizing.high}).`);
    (d.systems || []).forEach((s) => {
      L.push('', `${s.name}: ${s.installedTons} ton installed, ${s.requiredTons} ton calculated need (${s.pct}% of need)`);
      (s.equipment || []).forEach((e) => L.push(`  - ${e}`));
      if (s.total != null) L.push(`  Estimated total: ${money(s.total)}`);
    });
    if (d.measures && d.measures.length) { L.push('', 'Measurements:'); d.measures.forEach((m) => L.push(`  - ${m.what}: ${m.val}${m.room ? ' (' + m.room + ')' : ''}${m.note ? ' - ' + m.note : ''}`)); }
    if (d.photos && d.photos.length) { L.push('', `Photos (${d.photos.length}):`); d.photos.forEach((p, i) => L.push(`  ${i + 1}. ${p.ts || ''}${p.lat != null ? ` at ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : ''}${p.note ? ' - ' + p.note : ''}`)); }
    if (d.notes) L.push('', 'Notes:', d.notes);
    return L.join('\n');
  }

  const api = { health, jobs, sync, noteText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Jobber = api;
})(typeof window !== 'undefined' ? window : globalThis);
