/* Reads the capture time and GPS position from a JPEG's EXIF data. Pure function over an ArrayBuffer.
 * Returns { ts, lat, lon } (any field may be missing) or {} when there is no usable EXIF. */
(function (root) {
  function parse(buf) {
    const v = new DataView(buf), out = {};
    try {
      if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return out;
      let p = 2;
      while (p + 4 < v.byteLength) {
        if (v.getUint8(p) !== 0xff) break;
        const marker = v.getUint8(p + 1), len = v.getUint16(p + 2);
        if (marker === 0xe1 && v.getUint32(p + 4) === 0x45786966) {            // "Exif"
          const t = p + 10, le = v.getUint16(t) === 0x4949;                       // II = little endian
          const u16 = (o) => v.getUint16(t + o, le), u32 = (o) => v.getUint32(t + o, le);
          const ascii = (o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = v.getUint8(t + o + i); if (!c) break; s += String.fromCharCode(c); } return s; };
          const ifd = (off) => {                                                  // tag -> { type, count, valueOffset }
            const m = {}, n = u16(off);
            for (let i = 0; i < n; i++) { const e = off + 2 + i * 12; m[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 }; }
            return m;
          };
          const rat = (e, i) => { const o = u32(e.at) + i * 8; const d = u32(o + 4); return d ? u32(o) / d : 0; };
          const ifd0 = ifd(u32(4));
          if (ifd0[0x8769]) {
            const ex = ifd(u32(ifd0[0x8769].at)), d = ex[0x9003] || ex[0x9004];
            if (d) { const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(ascii(u32(d.at), 19)); if (m) out.ts = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`; }
          }
          if (ifd0[0x8825]) {
            const g = ifd(u32(ifd0[0x8825].at));
            const dms = (e) => (e && e.count >= 3 ? rat(e, 0) + rat(e, 1) / 60 + rat(e, 2) / 3600 : null);
            const la = dms(g[2]), lo = dms(g[4]), laRef = g[1] ? String.fromCharCode(v.getUint8(t + g[1].at)) : 'N', loRef = g[3] ? String.fromCharCode(v.getUint8(t + g[3].at)) : 'E';
            if (la != null && lo != null && (la || lo)) { out.lat = +(laRef === 'S' ? -la : la).toFixed(6); out.lon = +(loRef === 'W' ? -lo : lo).toFixed(6); }
          }
          return out;
        }
        p += 2 + len;
      }
    } catch (e) { /* damaged EXIF: return what we have */ }
    return out;
  }
  const api = { parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Exif = api;
})(typeof window !== 'undefined' ? window : globalThis);
