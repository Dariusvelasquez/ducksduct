/* Map geometry: plan feet <-> latitude/longitude, and which map tiles cover a view. Pure functions, no DOM.
 *
 * The plan is flat feet. g = { lat0, lon0, ang, mx, my, s, dx, dy, rot } says how it sits on the earth:
 *   raw  = ((lon - lon0) * kx, -(lat - lat0) * ky)          local feet east / south of (lat0, lon0)
 *   plan = s * (rotate(raw, -(ang + rot)) - (mx, my)) + (dx, dy)
 * ang is the building rotation found when the outline was loaded, rot is a hand adjustment in degrees, s is the
 * scale applied when the drawing was resized, dx/dy a hand nudge. */
(function (root) {
  const FT_PER_M = 3.28084, KY = 110574 * FT_PER_M;
  const kx = (lat0) => 111320 * Math.cos((lat0 * Math.PI) / 180) * FT_PER_M;
  const turn = (g) => g.ang + ((g.rot || 0) * Math.PI) / 180;

  function toPlan(g, lat, lon) {
    const x = (lon - g.lon0) * kx(g.lat0), y = -(lat - g.lat0) * KY, a = -turn(g), c = Math.cos(a), s = Math.sin(a), k = g.s || 1;
    return { x: k * (x * c - y * s - g.mx) + (g.dx || 0), y: k * (x * s + y * c - g.my) + (g.dy || 0) };
  }
  function toGeo(g, px, py) {
    const k = g.s || 1, qx = (px - (g.dx || 0)) / k + g.mx, qy = (py - (g.dy || 0)) / k + g.my, a = turn(g), c = Math.cos(a), s = Math.sin(a);
    const x = qx * c - qy * s, y = qx * s + qy * c;
    return { lat: g.lat0 - y / KY, lon: g.lon0 + x / kx(g.lat0) };
  }

  const tileX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
  const tileY = (lat, z) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
  const tileLon = (x, z) => (x / 2 ** z) * 360 - 180;
  const tileLat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

  // Tiles to draw for a view { x, y, w, h } (plan feet) shown pxWidth pixels wide. opts: url template, maxZoom, maxTiles.
  function tilesFor(g, view, pxWidth, opts) {
    const o = opts || {}, maxZoom = o.maxZoom || 19, maxTiles = o.maxTiles || 40, k = g.s || 1;
    const corners = [[view.x, view.y], [view.x + view.w, view.y], [view.x, view.y + view.h], [view.x + view.w, view.y + view.h]].map(([x, y]) => toGeo(g, x, y));
    const minLat = Math.min(...corners.map((c) => c.lat)), maxLat = Math.max(...corners.map((c) => c.lat));
    const minLon = Math.min(...corners.map((c) => c.lon)), maxLon = Math.max(...corners.map((c) => c.lon));
    const realFtPerPx = view.w / Math.max(1, pxWidth) / k;
    let z = Math.round(Math.log2((156543.03392 * Math.cos((g.lat0 * Math.PI) / 180) * FT_PER_M) / realFtPerPx));
    z = Math.max(8, Math.min(maxZoom, z));
    let x0, x1, y0, y1;
    for (;;) {
      x0 = Math.floor(tileX(minLon, z)); x1 = Math.floor(tileX(maxLon, z)); y0 = Math.floor(tileY(maxLat, z)); y1 = Math.floor(tileY(minLat, z));
      if ((x1 - x0 + 1) * (y1 - y0 + 1) <= maxTiles || z <= 8) break;
      z--;
    }
    const tiles = [];
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const tl = toPlan(g, tileLat(ty, z), tileLon(tx, z)), tr = toPlan(g, tileLat(ty, z), tileLon(tx + 1, z)), bl = toPlan(g, tileLat(ty + 1, z), tileLon(tx, z));
      tiles.push({ z, x: tx, y: ty, url: o.url ? o.url.replace('{z}', z).replace('{x}', tx).replace('{y}', ty) : null, m: [tr.x - tl.x, tr.y - tl.y, bl.x - tl.x, bl.y - tl.y, tl.x, tl.y] });
    }
    return tiles;
  }

  const api = { toPlan, toGeo, tilesFor, tileX, tileY, tileLon, tileLat };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Geo = api;
})(typeof window !== 'undefined' ? window : globalThis);
