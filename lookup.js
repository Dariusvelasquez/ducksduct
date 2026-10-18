/* Address -> coordinates, building footprint (OpenStreetMap) and parcel/folio number (Regrid, needs a token). */
(function (root) {
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

  async function geocode(address) {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address));
    if (!r.ok) throw new Error('Geocoder error ' + r.status);
    const j = await r.json();
    if (!j.length) throw new Error('Address not found. Check the spelling and include city, state and ZIP');
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
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);   // a hung server must not stall the lookup
      try {
        const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
        if (r.ok) return await r.json();
        lastErr = new Error('map server error ' + r.status);
      } catch (e) { lastErr = e.name === 'AbortError' ? new Error('map server timed out') : e; }
      finally { clearTimeout(timer); }
    }
    throw lastErr;
  }

  async function footprint(lat, lon) {
    const j = await overpass(`[out:json][timeout:20];way(around:35,${lat},${lon})["building"];out geom;`);
    const rings = j.elements.filter((w) => w.geometry && w.geometry.length > 3).map((w) => w.geometry.slice(0, -1).map((g) => ({ lat: g.lat, lon: g.lon })));
    if (!rings.length) throw new Error('No building outline found at that point');
    const here = { lat, lon };
    const hit = rings.find((r) => pointInPoly(here, r)) || rings[0];
    const center = { lat: hit.reduce((t, c) => t + c.lat, 0) / hit.length, lon: hit.reduce((t, c) => t + c.lon, 0) / hit.length };
    return { pts: toFeet(hit), center };
  }

  /* ---- Public parcel records (Tampa Bay counties) ---- */
  const HILLS = 'https://maps.hillsboroughcounty.org/arcgis/rest/services/InfoLayers/HC_ParcelsPublic/MapServer/0';
  const SARASOTA = 'https://services1.arcgis.com/9lDFdeC4JIBgML6L/ArcGIS/rest/services/SarasotaCountyParcels2023_TSLU/FeatureServer/0';
  const STATE = 'https://gis.fdacs.gov/mapping/rest/services/GIO_Parcels_for_OAWP_Optimized/FeatureServer/0';
  const COUNTY = { 57: 'Hillsborough', 61: 'Pasco', 62: 'Pinellas', 68: 'Sarasota' };

  const PASCO = 'https://maps.pascopa.com/arcgis/rest/services/Parcels/MapServer/3';

  // opts.buffer: search radius in metres around the point. opts.geom: also return outlines (as feature.geometry).
  async function arcQuery(url, lat, lon, fields, opts) {
    opts = opts || {};
    const q = { geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: fields, returnGeometry: opts.geom ? 'true' : 'false', f: 'json' };
    if (opts.buffer) { q.distance = opts.buffer; q.units = 'esriSRUnit_Meter'; }
    const r = await fetch(url + '/query?' + new URLSearchParams(q));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.features;
  }
  const arcPoint = async (url, lat, lon, fields) => (await arcQuery(url, lat, lon, fields)).map((f) => f.attributes);

  // Distance in metres from (lat,lon) to the nearest vertex of a polygon's rings.
  function nearestVertexM(geom, lat, lon) {
    const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110574;
    let best = Infinity;
    ((geom && geom.rings) || []).forEach((ring) => ring.forEach(([x, y]) => { best = Math.min(best, Math.hypot((x - lon) * kx, (y - lat) * ky)); }));
    return best;
  }
  const houseNo = (a) => { const m = String(a || '').match(/^\s*(\d+)/); return m ? m[1] : null; };
  const hasNo = (field, no) => no && new RegExp('^\\s*0*' + no + '\\b').test(String(field || ''));
  const pos = (v) => (v > 0 ? v : null);

  // Returns { county, parcelId, sqft, beds, baths, stories, yearBuilt, source, note } or null.
  async function countyParcel(lat, lon, address) {
    const hit = await countyParcelAt(lat, lon);
    if (hit) return hit;
    return countyParcelNear(lat, lon, houseNo(address));
  }

  // Geocoded house points often land a few feet outside the parcel polygon, so search a small radius and
  // choose by house number where the county layer carries addresses, else by nearest outline (flagged approximate).
  async function countyParcelNear(lat, lon, no) {
    const B = 35;
    const [h, sa, pa, st] = await Promise.allSettled([
      arcPoint2(HILLS, lat, lon, 'FOLIO_NUMB,FOLIO,SITE_ADDR,tBEDS,tBATHS,tSTORIES,HEAT_AR,ACT', B),
      arcPoint2(SARASOTA, lat, lon, 'PARCELID,PHYADDR1,TOTLVGAREA,ACTYRBLT', B),
      arcPoint2(PASCO, lat, lon, 'ParcelID,PHYS_STREET', B),
      arcQuery(STATE, lat, lon, 'CO_NO,PARCEL_ID', { buffer: B, geom: true }),
    ]);
    const rows = (r) => (r.status === 'fulfilled' ? r.value : []);
    const hv = rows(h).find((a) => hasNo(a.SITE_ADDR, no));
    if (hv) return { county: 'Hillsborough', parcelId: hv.FOLIO_NUMB || hv.FOLIO, sqft: pos(hv.HEAT_AR), beds: pos(hv.tBEDS), baths: pos(hv.tBATHS), stories: pos(hv.tSTORIES), yearBuilt: pos(hv.ACT), address: hv.SITE_ADDR, source: 'Hillsborough County Property Appraiser' };
    const sv = rows(sa).find((a) => hasNo(a.PHYADDR1, no));
    if (sv) return { county: 'Sarasota', parcelId: sv.PARCELID, sqft: pos(sv.TOTLVGAREA), yearBuilt: pos(sv.ACTYRBLT), address: sv.PHYADDR1, source: 'Sarasota County parcel data (2023 vintage)' };
    const pv = rows(pa).find((a) => hasNo(a.PHYS_STREET, no));
    if (pv) return { county: 'Pasco', parcelId: pv.ParcelID, address: pv.PHYS_STREET, source: 'Pasco County Property Appraiser', note: 'Pasco publishes no living area here, so enter beds/baths/sq ft yourself.' };
    const sf = (st.status === 'fulfilled' ? st.value : []).map((f) => ({ a: f.attributes, d: nearestVertexM(f.geometry, lat, lon) })).sort((x, y) => x.d - y.d)[0];
    if (sf) {
      const county = COUNTY[sf.a.CO_NO] || 'County ' + sf.a.CO_NO, id = sf.a.PARCEL_ID || '';
      return { county, parcelId: county === 'Pinellas' ? id.replace(/ /g, '-') : id, source: 'Florida DOR statewide parcels', approx: true, note: 'Parcel chosen by proximity to the address point. Verify the number on the property appraiser site. Enter beds/baths/sq ft yourself.' };
    }
    return null;
  }
  const arcPoint2 = async (url, lat, lon, fields, buffer) => (await arcQuery(url, lat, lon, fields, { buffer })).map((f) => f.attributes);

  async function countyParcelAt(lat, lon) {
    const [h, sa, st] = await Promise.allSettled([
      arcPoint(HILLS, lat, lon, 'FOLIO_NUMB,FOLIO,SITE_ADDR,tBEDS,tBATHS,tSTORIES,HEAT_AR,ACT,DOR_CODE'),
      arcPoint(SARASOTA, lat, lon, 'PARCELID,PHYADDR1,TOTLVGAREA,ACTYRBLT,NOBULDNG,NORESUNTS'),
      arcPoint(STATE, lat, lon, 'CO_NO,PARCEL_ID,DOR_UC'),
    ]);
    const hv = h.status === 'fulfilled' && h.value.sort((a, b) => (b.HEAT_AR || 0) - (a.HEAT_AR || 0))[0];
    if (hv) return { county: 'Hillsborough', parcelId: hv.FOLIO_NUMB || hv.FOLIO, sqft: pos(hv.HEAT_AR), beds: pos(hv.tBEDS), baths: pos(hv.tBATHS), stories: pos(hv.tSTORIES), yearBuilt: pos(hv.ACT), address: hv.SITE_ADDR, source: 'Hillsborough County Property Appraiser' };
    const sv = sa.status === 'fulfilled' && sa.value.sort((a, b) => (b.TOTLVGAREA || 0) - (a.TOTLVGAREA || 0))[0];
    const stv = st.status === 'fulfilled' && st.value[0];
    if (sv) return { county: 'Sarasota', parcelId: sv.PARCELID, sqft: pos(sv.TOTLVGAREA), yearBuilt: pos(sv.ACTYRBLT), address: sv.PHYADDR1, source: 'Sarasota County parcel data (2023 vintage)' };
    if (stv) {
      const county = COUNTY[stv.CO_NO] || 'County ' + stv.CO_NO;
      const id = stv.PARCEL_ID || '';
      return { county, parcelId: county === 'Pinellas' ? id.replace(/ /g, '-') : id, source: 'Florida DOR statewide parcels', note: 'No building details in this layer, so enter beds/baths/sq ft yourself.' };
    }
    return null;
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

  // Rough rectangle from living area when no real outline is available (about 1.4 : 1, rounded to 0.5 ft).
  function estimateFootprint(sqft, stories) {
    const area = sqft / Math.max(1, stories || 1), w = Math.sqrt(area * 1.4), r = (v) => Math.round(v * 2) / 2;
    return { w: r(w), d: r(area / w) };
  }

  function rectFootprint(w, d) { return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }]; }

  async function lookup(address, token, onStatus) {
    const say = onStatus || (() => {});
    const out = { address, footprint: null, parcelId: '', notes: [] };
    say('Geocoding address...');
    const g = await geocode(address);
    out.lat = g.lat; out.lon = g.lon; out.display = g.display;
    say('Fetching building outline...');
    let pt = { lat: g.lat, lon: g.lon };
    try { const f = await footprint(g.lat, g.lon); out.footprint = f.pts; pt = f.center; } catch (e) { out.notes.push('Building outline not available right now (' + e.message + ').'); }
    say('Fetching county parcel record...');
    try {
      out.record = await countyParcel(pt.lat, pt.lon, address);
      if (out.record) out.parcelId = out.record.parcelId || '';
      else out.notes.push('No county parcel found at this point.');
    } catch (e) { out.notes.push('Parcel: ' + e.message); }
    if (!out.parcelId && token) {
      say('Fetching parcel record...');
      try { const p = await parcel(address, token); if (p) out.parcelId = p.parcelId; else out.notes.push('Parcel: no record found'); } catch (e) { out.notes.push('Parcel: ' + e.message); }
    } else if (!out.parcelId) out.notes.push('Type the parcel/folio # in manually.');
    return out;
  }

  root.Lookup = { lookup, geocode, footprint, parcel, countyParcel, rectFootprint, estimateFootprint, toFeet };
})(window);
