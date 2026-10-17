/* Address -> coordinates, building footprint (OpenStreetMap) and parcel/folio number (Regrid, needs a token). */
(function (root) {
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

  async function geocode(address) {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address));
    if (!r.ok) throw new Error('Geocoder error ' + r.status);
    const j = await r.json();
    if (!j.length) throw new Error('Address not found');
    return { lat: +j[0].lat, lon: +j[0].lon, display: j[0].display_name };
  }

  function pointInPoly(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a.lat > p.lat !== b.lat > p.lat && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) c = !c;
    }
    return c;
  }

  // lat/lon ring -> feet, rotated so the longest wall is horizontal, shifted to (0,0).
  function toFeet(ring) {
    const lat0 = ring.reduce((s, c) => s + c.lat, 0) / ring.length;
    const lon0 = ring.reduce((s, c) => s + c.lon, 0) / ring.length;
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180) * 3.28084;
    const ky = 110574 * 3.28084;
    let pts = ring.map((c) => ({ x: (c.lon - lon0) * kx, y: -(c.lat - lat0) * ky }));
    let best = 0, ang = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > best) { best = len; ang = Math.atan2(b.y - a.y, b.x - a.x); }
    }
    const cs = Math.cos(-ang), sn = Math.sin(-ang);
    pts = pts.map((p) => ({ x: p.x * cs - p.y * sn, y: p.x * sn + p.y * cs }));
    const mx = Math.min(...pts.map((p) => p.x)), my = Math.min(...pts.map((p) => p.y));
    return pts.map((p) => ({ x: +(p.x - mx).toFixed(1), y: +(p.y - my).toFixed(1) }));
  }

  async function overpass(query) {
    let lastErr;
    for (const url of OVERPASS) {
      try {
        const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (r.ok) return await r.json();
        lastErr = new Error('Overpass error ' + r.status);
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  async function footprint(lat, lon) {
    const j = await overpass(`[out:json][timeout:20];way(around:35,${lat},${lon})["building"];out geom;`);
    const rings = j.elements.filter((w) => w.geometry && w.geometry.length > 3).map((w) => w.geometry.slice(0, -1).map((g) => ({ lat: g.lat, lon: g.lon })));
    if (!rings.length) throw new Error('No building outline found at that point');
    const here = { lat, lon };
    const hit = rings.find((r) => pointInPoly(here, r)) || rings[0];
    return toFeet(hit);
  }

  // Parcel ID / folio from Regrid. Field names are read defensively; returns null without a token.
  async function parcel(address, token) {
    if (!token) return null;
    const r = await fetch(`https://app.regrid.com/api/v2/parcels/address?query=${encodeURIComponent(address)}&limit=1&return_geometry=false&token=${encodeURIComponent(token)}`);
    if (!r.ok) throw new Error('Regrid error ' + r.status);
    const j = await r.json();
    const f = j.parcels && j.parcels.features && j.parcels.features[0];
    if (!f) return null;
    const p = (f.properties && f.properties.fields) || {};
    return { parcelId: p.parcelnumb || p.parcelnumb_no_formatting || '', sqft: p.ll_bldg_footprint_sqft || p.ll_gisacre || '', raw: p };
  }

  function rectFootprint(w, d) { return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }]; }

  async function lookup(address, token, onStatus) {
    const say = onStatus || (() => {});
    const out = { address, footprint: null, parcelId: '', notes: [] };
    say('Geocoding address...');
    const g = await geocode(address);
    out.lat = g.lat; out.lon = g.lon; out.display = g.display;
    say('Fetching building outline...');
    try { out.footprint = await footprint(g.lat, g.lon); } catch (e) { out.notes.push('Footprint: ' + e.message); }
    if (token) {
      say('Fetching parcel record...');
      try { const p = await parcel(address, token); if (p) out.parcelId = p.parcelId; else out.notes.push('Parcel: no record found'); } catch (e) { out.notes.push('Parcel: ' + e.message); }
    } else out.notes.push('Parcel ID needs a Regrid API token (or type the folio # in manually).');
    return out;
  }

  root.Lookup = { lookup, geocode, footprint, parcel, rectFootprint, toFeet };
})(window);
