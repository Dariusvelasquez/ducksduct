/* Import a room scan (Apple RoomPlan, from a LiDAR iPhone/iPad) as drawn walls. UNVERIFIED against a real scan file.
 *
 * A web page cannot run LiDAR. A small iOS companion app (see docs/ROOMPLAN.md) scans the room and saves the result as JSON.
 * This reads two shapes of file:
 *  1. Simple:   { "units": "m" | "ft", "walls": [ { "x1": 0, "y1": 0, "x2": 4, "y2": 0 } ] }
 *  2. RoomPlan: Swift's JSONEncoder output for CapturedRoom, where each wall has "dimensions" [width, height, depth] and a
 *     4x4 "transform" (nested, or 16 numbers, column-major). Wall centre = last column, wall direction = first column, in metres,
 *     plan = the floor plane (x and z). The exact encoding was not checked against a real file, so a failed import says why. */
(function (root) {
  const FT = 3.28084;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  function flat(m) {
    const a = Array.isArray(m) && Array.isArray(m[0]) ? m.flat() : m;
    return Array.isArray(a) && a.length === 16 && a.every(fin) ? a : null;
  }
  function parse(text) {
    let d; try { d = JSON.parse(text); } catch (e) { return { error: 'That file is not valid JSON.' }; }
    if (!d || !Array.isArray(d.walls) || !d.walls.length) return { error: 'No walls found in the file.' };
    const walls = [];
    let bad = 0;
    if (d.walls.every((w) => w && fin(w.x1) && fin(w.y1) && fin(w.x2) && fin(w.y2))) {
      const k = d.units === 'ft' ? 1 : FT;
      d.walls.forEach((w) => walls.push({ x1: w.x1 * k, y1: w.y1 * k, x2: w.x2 * k, y2: w.y2 * k }));
    } else {
      d.walls.forEach((w) => {
        const m = w && flat(w.transform), dim = w && w.dimensions;
        if (!m || !Array.isArray(dim) || !fin(dim[0])) { bad++; return; }
        const cx = m[12], cz = m[14], ax = m[0], az = m[2], n = Math.hypot(ax, az);
        if (!fin(cx) || !fin(cz) || !(n > 1e-6)) { bad++; return; }
        const hx = (ax / n) * dim[0] / 2, hz = (az / n) * dim[0] / 2;
        walls.push({ x1: (cx - hx) * FT, y1: (cz - hz) * FT, x2: (cx + hx) * FT, y2: (cz + hz) * FT });
      });
    }
    if (!walls.length) return { error: 'The walls in this file are not in a shape this app understands.' };
    const xs = walls.flatMap((w) => [w.x1, w.x2]), ys = walls.flatMap((w) => [w.y1, w.y2]), x0 = Math.min(...xs), y0 = Math.min(...ys);
    const round = (v) => Math.round(v * 10) / 10;
    return { walls: walls.map((w) => ({ x1: round(w.x1 - x0), y1: round(w.y1 - y0), x2: round(w.x2 - x0), y2: round(w.y2 - y0) })), skipped: bad, openings: ['doors', 'windows'].reduce((s, k) => s + (Array.isArray(d[k]) ? d[k].length : 0), 0), width: round(Math.max(...xs) - x0), depth: round(Math.max(...ys) - y0) };
  }
  const api = { parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RoomPlan = api;
})(typeof window !== 'undefined' ? window : globalThis);
