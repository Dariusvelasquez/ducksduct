/* Finds rooms in a floor-plan image. Pure functions over { data (RGBA), width, height }, no DOM.
 *
 * Works on clean plans. Two ways to tell rooms from everything else:
 *   - floor colour (preferred): room floors have their own tint (e.g. pale blue). Pixels near that colour are "free";
 *     walls, windows, the background photo and the outside are not, so nothing can leak out of the building.
 *   - wall colour (fallback, e.g. white floors on white paper): walls are one solid colour and free space is the rest.
 * Steps for the wall-colour route:
 *   1. mark wall pixels (colour distance), drop small wall specks such as symbols and dots;
 *   2. seal window and door gaps in the outer wall (morphological closing) so the outside can be told from the inside;
 *   3. measure how far each free pixel is from a wall, keep the cores of rooms (farther than a doorway's half width),
 *      which cuts rooms apart at doorways;
 *   4. grow each core back out to the walls, inside the building only;
 *   5. cut each region into rectangles (L-shaped rooms become two), keeping the sizeable ones.
 * Rooms come back in image pixels. It cannot read printed room names or dimensions.
 */
(function (root) {
  // exact squared euclidean distance transform (Felzenszwalb & Huttenlocher); input: 1 = free, 0 = wall
  function edt(free, w, h) {
    const INF = 1e20, f = new Float64Array(w * h);
    for (let i = 0; i < f.length; i++) f[i] = free[i] ? INF : 0;
    const n = Math.max(w, h), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), col = new Float64Array(n);
    const pass = (len, get, put) => {
      for (let i = 0; i < len; i++) col[i] = get(i);
      let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < len; q++) {
        let s;
        for (;;) { s = ((col[q] + q * q) - (col[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s <= z[k] && k > 0) k--; else break; }
        if (s <= z[k]) { v[0] = q; z[0] = -INF; z[1] = INF; k = 0; } else { k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
      }
      k = 0;
      for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const dx = q - v[k]; d[q] = dx * dx + col[v[k]]; }
      for (let i = 0; i < len; i++) put(i, d[i]);
    };
    for (let x = 0; x < w; x++) pass(h, (y) => f[y * w + x], (y, val) => (f[y * w + x] = val));
    for (let y = 0; y < h; y++) pass(w, (x) => f[y * w + x], (x, val) => (f[y * w + x] = val));
    return f;   // squared distance in px to the nearest wall
  }

  // connected components of mask; conn 4 or 8. Returns { label: Int32Array (0 = none), count, size: [] }
  function components(mask, w, h, conn) {
    const label = new Int32Array(w * h), size = [0], q = new Int32Array(w * h);
    let count = 0;
    for (let s = 0; s < w * h; s++) {
      if (!mask[s] || label[s]) continue;
      count++; let head = 0, tail = 0, n = 0; q[tail++] = s; label[s] = count;
      while (head < tail) {
        const p = q[head++], x = p % w, y = (p / w) | 0; n++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || (conn === 4 && dx && dy)) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (mask[np] && !label[np]) { label[np] = count; q[tail++] = np; }
        }
      }
      size.push(n);
    }
    return { label, count, size };
  }

  // Most common strongly saturated, darkish colour: a good guess for the wall colour on blue / coloured plans.
  function guessWallColor(img) {
    const { data, width: w, height: h } = img, bins = new Map();
    for (let i = 0; i < w * h; i += 3) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx < 190 && mx - mn > 50) { const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); bins.set(k, (bins.get(k) || 0) + 1); }
    }
    let best = -1, bk = 0;
    for (const [k, n] of bins) if (n > best) { best = n; bk = k; }
    if (best < 0) return null;
    return [((bk >> 8) & 15) * 16 + 8, ((bk >> 4) & 15) * 16 + 8, (bk & 15) * 16 + 8];
  }

  // Most common light, slightly tinted colour (pale blue / cream floors). Returns [r,g,b] or null for white / grey floors.
  function guessFloorColor(img) {
    const { data, width: w, height: h } = img, bins = new Map();
    for (let i = 0; i < w * h; i += 2) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], mn = Math.min(r, g, b), mx = Math.max(r, g, b);
      if (mn >= 200 && mx - mn >= 8) { const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3); const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += b; bins.set(k, e); }
    }
    let best = null;
    for (const e of bins.values()) if (!best || e.n > best.n) best = e;
    if (!best || best.n < (w * h) / 2 * 0.004) return null;
    return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
  }

  // Biggest all-true rectangle in a boolean grid (histogram method). Returns { x, y, w, h, area } or null.
  function biggestRect(m, w, h) {
    const hist = new Int32Array(w), stack = new Int32Array(w + 1);
    let best = null;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) hist[x] = m[y * w + x] ? hist[x] + 1 : 0;
      let sp = 0;
      for (let x = 0; x <= w; x++) {
        const cur = x === w ? 0 : hist[x];
        while (sp > 0 && hist[stack[sp - 1]] >= cur) {
          const ht = hist[stack[--sp]], left = sp ? stack[sp - 1] + 1 : 0, wd = x - left, area = ht * wd;
          if (!best || area > best.area) best = { x: left, y: y - ht + 1, w: wd, h: ht, area };
        }
        stack[sp++] = x;
      }
    }
    return best;
  }

  /* opts: floor [r,g,b] (default: guessed) or wall [r,g,b] to force the wall-colour route, pxPerFt (required),
   *       floorTol allowed tint difference for floor pixels (default 9), tol colour distance for wall pixels (default 80),
   *       doorFt doorway width in feet to cut rooms at (default 1 for the floor route, 3.2 for the wall route), windowFt widest outer-wall gap sealed in the
   *       wall-colour route (default 6), minRoomFt2 smallest room kept (default 20).
   * Returns { rooms, outline, route, floor, wall } in image pixels. */
  function detect(img, opts) {
    const { data, width: w, height: h } = img, o = opts || {}, ppf = o.pxPerFt, N = w * h;
    if (!(ppf > 0)) throw new Error('pxPerFt is required');
    const dist = (i, c) => { const dr = data[i * 4] - c[0], dg = data[i * 4 + 1] - c[1], db = data[i * 4 + 2] - c[2]; return dr * dr + dg * dg + db * db; };
    const floor = o.wall ? null : o.floor || guessFloorColor(img);
    let free = new Uint8Array(N), building = null, wall = null, route;
    if (floor) {
      // floor-colour route: free = floor-coloured pixels; small non-floor blobs (text, symbols) count as free too
      route = 'floor';
      // Match the floor's tint (blue minus red, blue minus green), not its exact colour: a translucent plan over a photo
      // varies in brightness from room to room, but the tint stays put. White, grey and dark pixels have a different tint.
      const tBR = floor[2] - floor[0], tBG = floor[2] - floor[1], tol = o.floorTol || 9, minLight = Math.min(floor[0], floor[1], floor[2]) - 30, nf = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
        free[i] = Math.min(r, g, b) >= minLight && Math.abs(b - r - tBR) <= tol && Math.abs(b - g - tBG) <= tol ? 1 : 0;
        nf[i] = free[i] ? 0 : 1;
      }
      // Text, dots and symbols are small, airy blobs: tiny, or a small bounding box that is mostly empty. Walls are long
      // and solid, so they stay.
      const nc = components(nf, w, h, 8), limit = Math.max(300, 3 * ppf * ppf), bb = [null];
      for (let c = 1; c <= nc.count; c++) bb.push({ x0: w, y0: h, x1: -1, y1: -1 });
      for (let i = 0; i < N; i++) if (nf[i]) { const b = bb[nc.label[i]], x = i % w, y = (i / w) | 0; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
      const speck = [false];
      for (let c = 1; c <= nc.count; c++) {
        const b = bb[c], bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1, area = nc.size[c];
        const small = (bw <= 12 * ppf && bh <= 4 * ppf) || (bh <= 12 * ppf && bw <= 4 * ppf);
        speck.push(area < limit || (small && area / (bw * bh) < 0.55));
      }
      for (let i = 0; i < N; i++) if (nf[i] && speck[nc.label[i]]) free[i] = 1;
    } else {
      route = 'wall';
      wall = o.wall || guessWallColor(img);
      if (!wall) throw new Error('Could not find a floor or wall colour. Pick one by clicking the plan.');
      const tol2 = (o.tol || 80) * (o.tol || 80), isWall = new Uint8Array(N);
      for (let i = 0; i < N; i++) isWall[i] = dist(i, wall) < tol2 ? 1 : 0;
      // drop small wall specks (dots, symbols); the wall network is one big component
      const wc = components(isWall, w, h, 8), bigWall = Math.max(...wc.size.slice(1), 0) * 0.02;
      for (let i = 0; i < N; i++) if (isWall[i] && wc.size[wc.label[i]] < Math.max(bigWall, 200)) isWall[i] = 0;
      // seal gaps in the outer wall by closing, then flood from the image edge: reached = outside
      const R = (o.windowFt || 6) / 2 * ppf, R2 = R * R;
      const dw = edt(isWall.map((v) => (v ? 0 : 1)), w, h), dil = new Uint8Array(N);
      for (let i = 0; i < N; i++) dil[i] = dw[i] <= R2 ? 1 : 0;
      const de = edt(dil, w, h), closed = new Uint8Array(N), out = new Uint8Array(N), fq = new Int32Array(N);
      for (let i = 0; i < N; i++) closed[i] = dil[i] && de[i] >= R2 ? 1 : isWall[i];
      let ft = 0, fh = 0;
      const seed = (p) => { if (!closed[p] && !out[p]) { out[p] = 1; fq[ft++] = p; } };
      for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
      while (fh < ft) { const p = fq[fh++], x = p % w, y = (p / w) | 0; if (x > 0) seed(p - 1); if (x < w - 1) seed(p + 1); if (y > 0) seed(p - w); if (y < h - 1) seed(p + w); }
      for (let i = 0; i < N; i++) free[i] = isWall[i] || out[i] ? 0 : 1;
      building = new Uint8Array(N); for (let i = 0; i < N; i++) building[i] = out[i] ? 0 : 1;
    }
    // room cores: farther from any wall than half a doorway
    const dist2 = edt(free, w, h), rho = (o.doorFt || (floor ? 1.0 : 3.2)) / 2 * ppf, rho2 = rho * rho;   // floor route: doors are already gaps in the floor colour
    const core = new Uint8Array(N); for (let i = 0; i < N; i++) core[i] = free[i] && dist2[i] >= rho2 ? 1 : 0;
    const cc = components(core, w, h, 4);
    // grow cores back over the free space (nearest core wins)
    const region = new Int32Array(N), q = new Int32Array(N);
    let tail = 0, head = 0;
    for (let i = 0; i < N; i++) if (core[i]) { region[i] = cc.label[i]; q[tail++] = i; }
    while (head < tail) {
      const p = q[head++], x = p % w, y = (p / w) | 0;
      if (x > 0 && free[p - 1] && !region[p - 1]) { region[p - 1] = region[p]; q[tail++] = p - 1; }
      if (x < w - 1 && free[p + 1] && !region[p + 1]) { region[p + 1] = region[p]; q[tail++] = p + 1; }
      if (y > 0 && free[p - w] && !region[p - w]) { region[p - w] = region[p]; q[tail++] = p - w; }
      if (y < h - 1 && free[p + w] && !region[p + w]) { region[p + w] = region[p]; q[tail++] = p + w; }
    }
    const touching = new Set();
    for (let x = 0; x < w; x++) { touching.add(region[x]); touching.add(region[(h - 1) * w + x]); }
    for (let y = 0; y < h; y++) { touching.add(region[y * w]); touching.add(region[y * w + w - 1]); }
    // cut each region into rectangles
    const minPx = (o.minRoomFt2 || 20) * ppf * ppf, minSide = 2.5 * ppf, rooms = [], boxes = new Map();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const id = region[y * w + x]; if (!id || touching.has(id)) continue;
      const b = boxes.get(id) || { x0: x, y0: y, x1: x, y1: y, n: 0 };
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; b.n++;
      boxes.set(id, b);
    }
    for (const [id, b] of boxes) {
      if (b.n < minPx) continue;
      const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1, m = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) m[y * bw + x] = region[(b.y0 + y) * w + b.x0 + x] === id ? 1 : 0;
      let remaining = b.n;
      for (let k = 0; k < 8; k++) {
        const r = biggestRect(m, bw, bh);
        if (!r || r.area < Math.max(minPx, 0.1 * b.n) || r.w < minSide || r.h < minSide) break;
        rooms.push({ x: b.x0 + r.x, y: b.y0 + r.y, w: r.w, h: r.h });
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) m[y * bw + x] = 0;
        remaining -= r.area; if (remaining < minPx) break;
      }
    }
    rooms.sort((a, b) => a.y - b.y || a.x - b.x);
    // building outline: the floor route grows the enclosed regions by a wall thickness; the wall route uses what the flood missed
    if (!building) {
      const keep = new Uint8Array(N), small = 6 * ppf * ppf;
      for (let i = 0; i < N; i++) { const id = region[i]; keep[i] = id && !touching.has(id) && (boxes.get(id) || { n: 0 }).n >= small ? 1 : 0; }
      const dk = edt(keep.map((v) => (v ? 0 : 1)), w, h), t2 = (0.6 * ppf) * (0.6 * ppf);
      building = new Uint8Array(N); for (let i = 0; i < N; i++) building[i] = keep[i] || dk[i] <= t2 ? 1 : 0;
    }
    const cell = Math.max(3, Math.round(ppf * 0.2)), gw = Math.ceil(w / cell), gh = Math.ceil(h / cell), g = new Uint8Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      let n = 0, t = 0;
      for (let y = gy * cell; y < Math.min(h, gy * cell + cell); y++) for (let x = gx * cell; x < Math.min(w, gx * cell + cell); x++) { t++; n += building[y * w + x]; }
      g[gy * gw + gx] = n * 2 >= t ? 1 : 0;
    }
    const sm = new Uint8Array(gw * gh);   // 3x3 majority removes one-cell jogs
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let n = 0, t = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < gw && ny < gh) { t++; n += g[ny * gw + nx]; } }
      sm[y * gw + x] = n * 2 > t ? 1 : 0;
    }
    const outline = contourOfGrid(sm, gw, gh).map(([x, y]) => ({ x: x * cell, y: y * cell }));
    const res = { rooms, outline, route, floor, wall };
    if (o.debug) res.debug = { free, region, building };
    return res;
  }

  // Longest outer loop around the filled cells of a grid, as [x, y] cell corners with straight runs merged.
  function contourOfGrid(g, gw, gh) {
    const at = (x, y) => (x >= 0 && y >= 0 && x < gw && y < gh ? g[y * gw + x] : 0);
    const out = new Map();
    const add = (a, b, c, d) => { const k = a + ',' + b; (out.get(k) || out.set(k, []).get(k)).push([c, d]); };
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (!g[y * gw + x]) continue;
      if (!at(x, y - 1)) add(x, y, x + 1, y);
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) add(x, y + 1, x, y);
    }
    let best = null;
    for (const [k, list] of out) {
      while (list.length) {
        const [sx, sy] = k.split(',').map(Number), loop = [[sx, sy]];
        let [cx, cy] = list.pop();
        while (!(cx === sx && cy === sy)) {
          loop.push([cx, cy]);
          const nl = out.get(cx + ',' + cy); if (!nl || !nl.length) break;
          [cx, cy] = nl.pop();
        }
        const area = Math.abs(loop.reduce((s, a, i) => { const b = loop[(i + 1) % loop.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
        if (!best || area > best.area) best = { loop, area };
      }
    }
    if (!best) return [];
    const L = best.loop;
    return L.filter((p, i) => { const a = L[(i + L.length - 1) % L.length], b = L[(i + 1) % L.length]; return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]); });
  }

  // Outer outline of a set of rectangles (feet), as a simplified list of {x,y}. cell = grid size in feet.
  function outlineOfRects(rects, cell, grow) {
    cell = cell || 0.5; grow = grow || 0;
    if (!rects.length) return [];
    const minX = Math.min(...rects.map((r) => r.x)) - grow - cell, minY = Math.min(...rects.map((r) => r.y)) - grow - cell;
    const maxX = Math.max(...rects.map((r) => r.x + r.w)) + grow + cell, maxY = Math.max(...rects.map((r) => r.y + r.h)) + grow + cell;
    const gw = Math.ceil((maxX - minX) / cell), gh = Math.ceil((maxY - minY) / cell), g = new Uint8Array(gw * gh);
    rects.forEach((r) => {
      const x0 = Math.floor((r.x - grow - minX) / cell + 1e-6), x1 = Math.ceil((r.x + r.w + grow - minX) / cell - 1e-6);
      const y0 = Math.floor((r.y - grow - minY) / cell + 1e-6), y1 = Math.ceil((r.y + r.h + grow - minY) / cell - 1e-6);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * gw + x] = 1;
    });
    const keep = contourOfGrid(g, gw, gh);
    return keep.map(([x, y]) => ({ x: +(minX + x * cell).toFixed(1), y: +(minY + y * cell).toFixed(1) }));
  }

  const api = { detect, guessWallColor, guessFloorColor, outlineOfRects, contourOfGrid, edt, components, biggestRect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Detect = api;
})(typeof window !== 'undefined' ? window : globalThis);
