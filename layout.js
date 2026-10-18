/* Realistic starting floor plan for a single-storey home. Pure functions, no DOM.
 *
 * Based on the common "split bedroom" plan: master suite at one end, secondary bedrooms and a hall bath at the
 * other, and the great room / kitchen / dining hub between them. Kitchen, laundry and bathrooms share plumbing
 * walls. Room sizes follow typical figures (master ~14 x 16, secondary bedrooms ~11 x 12, kitchen ~120-150 sq ft,
 * great room ~300-400 sq ft, hall at least 3 ft wide). It is a starting point to edit, not a survey.
 *
 * Base design is 60 x 35 ft (about 1,730 sq ft). Front of the house is the bottom (y grows toward the front).
 */
(function (root) {
  const BASE_W = 60, BASE_D = 35;
  // [name, x, y, w, h]
  const BASE = [
    ['Master Bed', 44, 0, 16, 14], ['Master Bath', 44, 14, 10, 9], ['Master Closet', 54, 14, 6, 9], ['Laundry', 44, 23, 6, 7],
    ['Great Room', 24, 0, 20, 16], ['Dining', 24, 16, 10, 14], ['Kitchen', 34, 16, 10, 14], ['Foyer', 24, 30, 10, 5],
    ['Bed 2', 0, 0, 13, 12], ['Hall Bath', 13, 0, 7, 9], ['A/H Closet', 20, 0, 4, 12], ['Linen', 13, 9, 7, 3],
    ['Hall', 0, 12, 24, 3.5], ['Bed 3', 0, 15.5, 12, 12.5], ['Office', 12, 15.5, 12, 12.5],
  ];
  const OUTLINE = [[0, 0], [60, 0], [60, 23], [50, 23], [50, 30], [34, 30], [34, 35], [24, 35], [24, 28], [0, 28]];

  const snap = (v) => Math.round(v * 2) / 2;
  const polyArea = (p) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
  const TEMPLATE_FRACTION = polyArea(OUTLINE) / (BASE_W * BASE_D);   // share of the bounding box that is house

  // beds/baths adjust which rooms exist: the template has master + 2 bedrooms + a flex Office, master bath + hall bath.
  function rename(name, beds, baths) {
    if (name === 'Office' && beds >= 4) return 'Bed 4';
    if (name === 'Bed 3' && beds <= 2) return 'Study';
    if (name === 'Bed 2' && beds <= 1) return 'Den';
    if (name === 'Master Bath' && baths <= 1) return 'Walk-in Closet';
    if (name === 'Linen' && baths >= 3) return 'Powder Bath';
    return name;
  }

  // W x D is the bounding box in feet. Returns { rooms: [{name,x,y,w,h}], footprint: [{x,y}] } with the origin at 0,0.
  function buildHome(W, D, beds, baths) {
    const tall = D > W * 1.1;                       // narrow, deep lot: same plan turned 90 degrees
    const w = tall ? D : W, d = tall ? W : D, sx = w / BASE_W, sy = d / BASE_D;
    const fix = (x0, y0, x1, y1) => ({ x: snap(x0 * sx), y: snap(y0 * sy), w: snap(x1 * sx) - snap(x0 * sx), h: snap(y1 * sy) - snap(y0 * sy) });
    const turn = (r) => (tall ? { ...r, x: r.y, y: r.x, w: r.h, h: r.w } : r);
    const rooms = BASE.map(([name, x, y, rw, rh]) => turn({ name: rename(name, beds, baths), ...fix(x, y, x + rw, y + rh) }));
    const footprint = OUTLINE.map(([x, y]) => (tall ? { x: snap(y * sy), y: snap(x * sx) } : { x: snap(x * sx), y: snap(y * sy) }));
    return { rooms, footprint };
  }

  const api = { BASE_W, BASE_D, TEMPLATE_FRACTION, buildHome };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Layout = api;
})(typeof window !== 'undefined' ? window : globalThis);
