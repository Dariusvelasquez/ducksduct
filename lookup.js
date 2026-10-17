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
    const center = { lat: hit.reduce((t, c) => t + c.lat, 0) / hit.length, lon: hit.reduce((t, c) => t + c.lon, 0) / hit.length };
    return { pts: toFeet(hit), center };
  }

  /* ---- Public parcel records (Tampa Bay counties) ---- */
  const HILLS = 'https://maps.hillsboroughcounty.org/arcgis/rest/services/InfoLayers/HC_ParcelsPublic/MapServer/0';
  const SARASOTA = 'https://services1.arcgis.com/9lDFdeC4JIBgML6L/ArcGIS/rest/services/SarasotaCountyParcels2023_TSLU/FeatureServer/0';
  const STATE = 'https://gis.fdacs.gov/mapping/rest/services/GIO_Parcels_for_OAWP_Optimized/FeatureServer/0';
  const COUNTY = { 57: 'Hillsborough', 61: 'Pasco', 62: 'Pinellas', 68: 'Sarasota' };

  async function arcPoint(url, lat, lon, fields) {
    const qs = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: fields, returnGeometry: 'false', f: 'json' });
    const r = await fetch(url + '/query?' + qs);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.features.map((f) => f.attributes);
  }
  const pos = (v) => (v > 0 ? v : null);

  // Returns { county, parcelId, sqft, beds, baths, stories, yearBuilt, source, note } or null.
  async function countyParcel(lat, lon) {
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

  function rectFootprint(w, d) { return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }]; }

  async function lookup(address, token, onStatus) {
    const say = onStatus || (() => {});
    const out = { address, footprint: null, parcelId: '', notes: [] };
    say('Geocoding address...');
    const g = await geocode(address);
    out.lat = g.lat; out.lon = g.lon; out.display = g.display;
    say('Fetching building outline...');
    let pt = { lat: g.lat, lon: g.lon };
    try { const f = await footprint(g.lat, g.lon); out.footprint = f.pts; pt = f.center; } catch (e) { out.notes.push('Footprint: ' + e.message); }
    say('Fetching county parcel record...');
    try {
      out.record = await countyParcel(pt.lat, pt.lon);
      if (out.record) out.parcelId = out.record.parcelId || '';
      else out.notes.push('No county parcel found at this point.');
    } catch (e) { out.notes.push('Parcel: ' + e.message); }
    if (!out.parcelId && token) {
      say('Fetching parcel record...');
      try { const p = await parcel(address, token); if (p) out.parcelId = p.parcelId; else out.notes.push('Parcel: no record found'); } catch (e) { out.notes.push('Parcel: ' + e.message); }
    } else if (!out.parcelId) out.notes.push('Type the parcel/folio # in manually.');
    return out;
  }

  root.Lookup = { lookup, geocode, footprint, parcel, countyParcel, rectFootprint, toFeet };
})(window);
