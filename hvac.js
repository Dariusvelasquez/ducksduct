/* HVAC calculation engine: model-number parsing, room loads, duct airflow. Pure functions, no DOM. */
(function (root) {
  const BTU_PER_TON = 12000;
  const CFM_PER_TON = 400;
  const BTU_PER_CFM = BTU_PER_TON / CFM_PER_TON; // 30 BTU/h of sensible+latent capacity per CFM
  const CAP_KBTU = [9, 12, 18, 24, 30, 36, 42, 48, 60];

  // Nominal capacity is encoded in most residential model numbers as 018/024/036... or 18/24/36...
  // This is a heuristic: it returns every plausible reading so the UI can let the user confirm.
  function parseModel(model) {
    const out = { tons: null, btu: null, candidates: [] };
    const runs = String(model || '').toUpperCase().match(/\d+/g) || [];
    runs.forEach((run, ri) => {
      for (let i = 0; i + 3 <= run.length; i++) {
        const w = run.slice(i, i + 3);
        if (w[0] === '0' && CAP_KBTU.includes(+w)) out.candidates.push({ k: +w, score: 3 + ri * 0.01 });
      }
      for (let i = 0; i + 2 <= run.length; i++) {
        const w = run.slice(i, i + 2);
        if (CAP_KBTU.includes(+w)) out.candidates.push({ k: +w, score: 1 + ri * 0.01 + (i === 0 && ri === 0 ? -0.5 : 0) });
      }
    });
    if (out.candidates.length) {
      out.candidates.sort((a, b) => b.score - a.score);
      out.btu = out.candidates[0].k * 1000;
      out.tons = out.btu / BTU_PER_TON;
    }
    return out;
  }

  function roomSqft(r) { return r.w * r.h; }

  // Rough rule-of-thumb load (NOT Manual J): area x BTU/sqft, scaled by ceiling height and exposure.
  function roomLoadBtu(room, cfg) {
    const exp = { low: 0.9, normal: 1, high: 1.15 }[room.exposure || 'normal'] || 1;
    return roomSqft(room) * cfg.btuPerSqft * ((room.ceiling || 8) / 8) * exp;
  }

  // Round duct diameter (inches) for a given airflow at the design velocity (fpm).
  function ductDia(cfm, fpm) {
    if (!(cfm > 0)) return 0;
    const areaFt2 = cfm / (fpm || 700);
    return Math.max(4, Math.round(Math.sqrt((4 * areaFt2) / Math.PI) * 12));
  }

  function inRoom(e, r) { return e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h; }

  function analyze(scn, rooms, cfg) {
    const byId = {};
    scn.equip.forEach((e) => (byId[e.id] = e));
    const eq = {};
    scn.equip.forEach((e) => (eq[e.id] = { cfm: 0, tons: 0, btu: 0 }));
    const ductFlow = {};
    const warnings = [];

    const condenserOf = (ahu) => {
      const d = scn.ducts.find((d) => d.kind === 'refrig' && (d.a === ahu.id || d.b === ahu.id));
      const o = d && byId[d.a === ahu.id ? d.b : d.a];
      return o && o.type === 'condenser' ? o : null;
    };

    function distribute(rootEq, kind, cfm) {
      const adj = {};
      scn.ducts.filter((d) => d.kind === kind).forEach((d) => {
        (adj[d.a] = adj[d.a] || []).push({ n: d.b, d });
        (adj[d.b] = adj[d.b] || []).push({ n: d.a, d });
      });
      const target = kind;
      const seen = new Set([rootEq.id]);
      function build(id, parent) {
        const node = { id, kids: [], leaves: 0 };
        seen.add(id);
        if (byId[id].type === target) { node.leaves = byId[id].weight > 0 ? byId[id].weight : 1; return node; }
        for (const { n, d } of adj[id] || []) {
          if (n === parent || seen.has(n) || !byId[n]) continue;
          const kid = build(n, id);
          kid.edge = d;
          node.kids.push(kid);
          node.leaves += kid.leaves;
        }
        return node;
      }
      function push(node, q) {
        if (node.edge) ductFlow[node.edge.id] = (ductFlow[node.edge.id] || 0) + q;
        if (byId[node.id].type === target) { eq[node.id].cfm += q; return; }
        node.kids.forEach((k) => node.leaves && push(k, (q * k.leaves) / node.leaves));
      }
      const tree = build(rootEq.id, null);
      push(tree, cfm);
    }

    const ahus = scn.equip.filter((e) => e.type === 'ahu');
    const condensers = scn.equip.filter((e) => e.type === 'condenser');
    ahus.forEach((a) => {
      const c = condenserOf(a);
      const tons = c ? c.tons : a.tons;
      const cfm = a.cfm || tons * CFM_PER_TON;
      eq[a.id].tons = tons;
      eq[a.id].cfm = cfm;
      distribute(a, 'supply', cfm);
      distribute(a, 'return', cfm);
      if (!scn.ducts.some((d) => d.kind === 'return' && (d.a === a.id || d.b === a.id))) warnings.push(`${a.label || 'Air handler'} has no return (intake) duct`);
      if (!scn.ducts.some((d) => d.kind === 'supply' && (d.a === a.id || d.b === a.id))) warnings.push(`${a.label || 'Air handler'} has no supply (outlet) duct`);
      if (!c) warnings.push(`${a.label || 'Air handler'} is not linked to a condenser (using its own ${a.tons} ton rating)`);
    });
    scn.equip.filter((e) => e.type === 'supply').forEach((s) => {
      if (!(eq[s.id].cfm > 0)) warnings.push(`${s.label || 'Supply outlet'} is not connected to an air handler`);
    });
    scn.equip.filter((e) => e.type === 'head').forEach((h) => (eq[h.id].btu = h.btu || 0));

    // Installed capacity: every condenser, plus any air handler / mini-split head not tied to one.
    let installedBtu = condensers.reduce((s, c) => s + c.tons * BTU_PER_TON, 0);
    const linked = (e) => scn.ducts.some((d) => d.kind === 'refrig' && (d.a === e.id || d.b === e.id) && (byId[d.a].type === 'condenser' || byId[d.b].type === 'condenser'));
    ahus.filter((a) => !linked(a)).forEach((a) => (installedBtu += a.tons * BTU_PER_TON));
    scn.equip.filter((e) => e.type === 'head' && !linked(e)).forEach((h) => (installedBtu += h.btu || 0));

    const roomRows = rooms.map((r) => {
      const required = roomLoadBtu(r, cfg);
      const inside = scn.equip.filter((e) => inRoom(e, r));
      const cfm = inside.filter((e) => e.type === 'supply').reduce((s, e) => s + eq[e.id].cfm, 0);
      const headBtu = inside.filter((e) => e.type === 'head').reduce((s, e) => s + eq[e.id].btu, 0);
      const delivered = cfm * BTU_PER_CFM + headBtu;
      const outlets = inside.filter((e) => e.type === 'supply' || e.type === 'head').length;
      if (!outlets && !r.noAC && !/hall|corridor/i.test(r.name)) warnings.push(`${r.name} has no supply outlet`);
      // A corridor with no outlet is conditioned by transfer air from its neighbours, not by its own register.
      const noAC = !!r.noAC;
      const transfer = noAC || (!outlets && /hall|corridor/i.test(r.name));
      return { id: r.id, name: r.name, sqft: roomSqft(r), required: transfer ? 0 : required, cfm, delivered, pct: transfer ? 1 : required ? delivered / required : 0, outlets, transfer, noAC };
    });

    const requiredBtu = roomRows.reduce((s, r) => s + r.required, 0);
    const sqft = roomRows.reduce((s, r) => s + r.sqft, 0);
    return {
      eq, ductFlow, warnings, rooms: roomRows,
      total: {
        sqft, requiredBtu, installedBtu,
        requiredTons: requiredBtu / BTU_PER_TON,
        installedTons: installedBtu / BTU_PER_TON,
        deliveredBtu: roomRows.reduce((s, r) => s + r.delivered, 0),
        systemCfm: ahus.reduce((s, a) => s + eq[a.id].cfm, 0),
        sqftPerTon: installedBtu ? sqft / (installedBtu / BTU_PER_TON) : 0,
        oversize: requiredBtu ? installedBtu / requiredBtu : 0,
      },
    };
  }

  const api = { BTU_PER_TON, CFM_PER_TON, BTU_PER_CFM, parseModel, roomSqft, roomLoadBtu, ductDia, inRoom, analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HVAC = api;
})(typeof window !== 'undefined' ? window : globalThis);
