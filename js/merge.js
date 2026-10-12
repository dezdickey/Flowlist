/* ============================================================
   Flowlist — three-way merge

   Two devices have both changed the same board. Neither should lose
   its work, and neither should have deletions undone.

   The trick is that two versions are not enough. If the phone has a
   category the computer does not, that could mean the phone added it or
   the computer deleted it, and there is no way to tell them apart. With
   a third version — the board as it was when the two devices last
   agreed — it becomes obvious:

     in mine, not in the base   → I added it        → keep
     in the base, not in mine   → I deleted it      → stays deleted
     …and the same for the other side, independently

   So adds from both sides survive, deletes from either side stick, and
   the only real conflict left is one field genuinely changed on both
   sides to different things. That picks the local copy and says so,
   rather than quietly choosing.

   Everything here is a pure function of three states. No DOM, no
   network, no clock — which is why it can be tested to death.
   ============================================================ */
const Merge = (function () {

  /* Collections keyed by id, and the keyed collections inside them. A field
     not named here is a plain value and is merged as one. */
  const NESTED = {
    lists:    { label: 'category', of: { items: { label: 'note' } } },
    presets:  { label: 'preset' },
    widgets:  { label: 'widget' },
    canvases: { label: 'canvas',
      /* where you happen to be looking on a canvas is about this screen, not
         about the board — panning on two devices is not a disagreement */
      local: ['pan', 'zoom'],
      of: {
        nodes:   { label: 'card' },
        edges:   { label: 'connector' },
        strokes: { label: 'drawing' }
      } }
  };

  /* Settings that belong to the device rather than to the board. They never
     come across: a phone should not inherit the laptop's panel layout, and
     nothing should ever overwrite this device's own sync keys. */
  const LOCAL_SETTINGS = ['sync', 'layout', 'panels', 'panelsBeforeFocus'];

  /* Some settings are a record of what has happened rather than a preference.
     The list of reminders already sent is one: a mark from either device means
     that notification went out, so losing one would send it again from the
     other. These join rather than choose. The base is left out on purpose —
     a mark cleared on both devices should stay cleared. */
  const UNION_MAPS = [['ntfy', 'sent']];

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const byId = arr => {
    const m = {};
    (arr || []).forEach(x => { if (x && x.id) m[x.id] = x; });
    return m;
  };
  const nameOf = x => (x && (x.text || x.name)) || 'untitled';

  /**
   * One entity, three versions. Returns the merged copy and pushes anything
   * genuinely contested onto `report.conflicts`.
   */
  function mergeFields(base, mine, theirs, schema, label, report) {
    const out = {};
    const keys = {};
    [base, mine, theirs].forEach(o => { if (o) Object.keys(o).forEach(k => { keys[k] = 1; }); });

    Object.keys(keys).forEach(k => {
      const b = base ? base[k] : undefined;
      const m = mine ? mine[k] : undefined;
      const t = theirs ? theirs[k] : undefined;

      /* a keyed collection inside this one — recurse rather than compare */
      const inner = schema && schema.of && schema.of[k];
      if (inner && (Array.isArray(m) || Array.isArray(t))) {
        out[k] = mergeList(b, m, t, inner, report);
        return;
      }

      /* a field that belongs to the device it is on: keep ours, say nothing */
      if (schema && schema.local && schema.local.indexOf(k) !== -1) {
        out[k] = m !== undefined ? m : t;
        return;
      }

      if (same(m, t)) { out[k] = m !== undefined ? m : t; return; }
      if (same(m, b)) { out[k] = t; return; }        // only they changed it
      if (same(t, b)) { out[k] = m; return; }        // only I changed it

      /* both moved it, and to different places */
      out[k] = m;
      report.conflicts.push({
        /* the id is what makes this undoable later: the log can find the very
           thing again and put the other version back */
        id: (mine && mine.id) || (theirs && theirs.id) || null,
        kind: label || 'item',
        name: nameOf(mine) || nameOf(theirs),
        field: k,
        kept: m,
        dropped: t
      });
    });
    return out;
  }

  /**
   * A list of things with ids, three versions.
   * Order follows mine, with anything only they have appended in their order.
   */
  function mergeList(base, mine, theirs, schema, report) {
    const B = byId(base), M = byId(mine), T = byId(theirs);
    const label = (schema && schema.label) || 'item';
    const out = [];
    const done = {};

    const decide = id => {
      if (done[id]) return;
      done[id] = 1;
      const b = B[id], m = M[id], t = T[id];

      if (m && t) { out.push(mergeFields(b, m, t, schema, label, report)); return; }
      if (m && !t) {
        if (b) report.removed.push({ kind: label, name: nameOf(m), by: 'them' });
        else { out.push(m); report.kept.push({ kind: label, name: nameOf(m) }); }
        return;
      }
      if (!m && t) {
        if (b) report.removed.push({ kind: label, name: nameOf(t), by: 'you' });
        else { out.push(t); report.came.push({ kind: label, name: nameOf(t) }); }
        return;
      }
      /* in neither: both deleted it, and it stays gone */
    };

    (mine || []).forEach(x => { if (x && x.id) decide(x.id); });
    (theirs || []).forEach(x => { if (x && x.id) decide(x.id); });
    return out;
  }

  /**
   * A list of ids — the open columns, the recently closed. Same rules, but
   * the id is the whole of the thing.
   */
  function mergeIds(base, mine, theirs) {
    const B = base || [], M = mine || [], T = theirs || [];
    const inB = id => B.indexOf(id) !== -1;
    const out = [];
    M.forEach(id => {
      // in mine: keep unless they deleted it from a version we both had
      if (T.indexOf(id) !== -1 || !inB(id)) out.push(id);
    });
    T.forEach(id => {
      if (out.indexOf(id) === -1 && M.indexOf(id) === -1 && !inB(id)) out.push(id);
    });
    return out;
  }

  /** Do Today holds pairs rather than ids, so the pair is the key. */
  function mergeToday(base, mine, theirs) {
    const key = t => t.listId + '|' + t.itemId;
    const B = {}, M = {}, T = {};
    (base || []).forEach(t => { B[key(t)] = t; });
    (mine || []).forEach(t => { M[key(t)] = t; });
    (theirs || []).forEach(t => { T[key(t)] = t; });
    const out = [], seen = {};
    const take = t => {
      const k = key(t);
      if (seen[k]) return;
      seen[k] = 1;
      const inMine = !!M[k], inTheirs = !!T[k], inBase = !!B[k];
      if (inMine && inTheirs) out.push(t);
      else if (inMine && !inBase) out.push(t);        // I added it
      else if (inTheirs && !inMine && !inBase) out.push(t);   // they added it
      // otherwise one of us took it off the list, and off it stays
    };
    (mine || []).forEach(take);
    (theirs || []).forEach(take);
    return out;
  }

  /**
   * Moving a card changes x and y together. Reported separately that reads as
   * two disagreements about one drag, so they are folded into one — with the
   * pieces kept, because putting it back has to set both.
   */
  const PAIRS = [{ field: 'position', of: ['x', 'y'], show: v => v.x + ', ' + v.y }];

  function coalesce(report) {
    PAIRS.forEach(pair => {
      const groups = {};
      report.conflicts.forEach(c => {
        if (pair.of.indexOf(c.field) === -1 || !c.id) return;
        (groups[c.id] = groups[c.id] || []).push(c);
      });
      Object.keys(groups).forEach(id => {
        const parts = groups[id];
        if (parts.length < 2) return;
        const mine = {}, theirs = {};
        parts.forEach(p => { mine[p.field] = p.kept; theirs[p.field] = p.dropped; });
        const one = {
          id: id, kind: parts[0].kind, name: parts[0].name, field: pair.field,
          kept: pair.show(mine), dropped: pair.show(theirs),
          parts: parts.map(p => ({ field: p.field, kept: p.kept, dropped: p.dropped }))
        };
        report.conflicts = report.conflicts.filter(c => parts.indexOf(c) === -1);
        report.conflicts.push(one);
      });
    });
    return report;
  }

  /** Walk a path like ['ntfy','sent'] and join the maps at the end of it. */
  function joinMaps(mine, theirs, out) {
    UNION_MAPS.forEach(path => {
      const at = o => path.reduce((v, k) => (v ? v[k] : undefined), o);
      const m = at(mine) || {}, t = at(theirs) || {};
      if (!Object.keys(m).length && !Object.keys(t).length) return;
      let holder = out;
      for (let i = 0; i < path.length - 1; i++) {
        holder[path[i]] = holder[path[i]] || {};
        holder = holder[path[i]];
      }
      holder[path[path.length - 1]] = Object.assign({}, t, m);
    });
  }

  function mergeSettings(base, mine, theirs, report) {
    const out = mergeFields(base || {}, mine || {}, theirs || {}, null, 'setting', report);
    joinMaps(mine, theirs, out);
    LOCAL_SETTINGS.forEach(k => {
      if (mine && mine[k] !== undefined) out[k] = mine[k];
      else delete out[k];
    });
    /* a setting is not worth calling a conflict — it is a preference, and this
       device's own preference is the one in front of you */
    report.conflicts = report.conflicts.filter(c => c.kind !== 'setting');
    return out;
  }

  /**
   * The whole board, three versions.
   * @returns {{ state: Object, report: Object }}
   */
  function three(base, mine, theirs) {
    const report = { came: [], kept: [], removed: [], conflicts: [] };
    if (!theirs) return { state: mine, report: report };
    if (!mine) return { state: theirs, report: report };
    base = base || {};

    const out = Object.assign({}, mine);

    Object.keys(NESTED).forEach(k => {
      out[k] = mergeList(base[k], mine[k], theirs[k], NESTED[k], report);
    });

    out.board = mergeIds(base.board, mine.board, theirs.board);
    out.closedOrder = mergeIds(base.closedOrder, mine.closedOrder, theirs.closedOrder);
    out.today = mergeToday(base.today, mine.today, theirs.today);
    out.settings = mergeSettings(base.settings, mine.settings, theirs.settings, report);

    /* which surface you are looking at, and which canvas, are about this
       screen and not about the board */
    out.view = mine.view;
    out.activeCanvas = mine.activeCanvas;
    out.layouts = layouts(mine.layouts, theirs.layouts);
    out.v = Math.max(mine.v || 1, theirs.v || 1);

    /* nothing may point at something that is no longer there */
    const listIds = out.lists.map(l => l.id);
    out.board = out.board.filter(id => listIds.indexOf(id) !== -1);
    out.closedOrder = out.closedOrder.filter(id => listIds.indexOf(id) !== -1);
    out.today = out.today.filter(t => {
      const l = out.lists.filter(x => x.id === t.listId)[0];
      return l && (l.items || []).some(i => i.id === t.itemId);
    });
    if (!out.canvases.length) out.canvases = mine.canvases;
    if (!out.canvases.some(c => c.id === out.activeCanvas)) out.activeCanvas = out.canvases[0].id;

    /* a connector whose card was deleted on the other device has nothing left
       to hold on to — it draws as nothing, so it should not linger in the data */
    out.canvases.forEach(c => {
      const here = (c.nodes || []).map(n => n.id);
      const anchored = ref => !ref || !ref.node || here.indexOf(ref.node) !== -1;
      c.edges = (c.edges || []).filter(e => anchored(e.from) && anchored(e.to));
    });

    coalesce(report);

    report.changed = report.came.length + report.kept.length +
                     report.removed.length + report.conflicts.length;
    return { state: out, report: report };
  }

  /**
   * Each shape's layout, part by part: whichever was changed last. A tie
   * keeps this device's — see js/layouts.js for why a tie is ordinary.
   */
  function layouts(mine, theirs) {
    const out = {};
    ['desktop', 'phone'].forEach(shape => {
      const m = (mine && mine[shape]) || {}, t = (theirs && theirs[shape]) || {};
      const parts = Object.keys(Object.assign({}, m, t));
      if (!parts.length) return;
      out[shape] = {};
      parts.forEach(p => {
        const a = m[p], b = t[p];
        out[shape][p] = !a ? b : !b ? a : ((b.at || 0) > (a.at || 0) ? b : a);
      });
    });
    return out;
  }

  /** One line for the banner. */
  function sentence(report, who) {
    const bits = [];
    if (report.came.length) bits.push(report.came.length + ' in from ' + (who || 'the other device'));
    if (report.kept.length) bits.push(report.kept.length + ' of yours kept');
    if (report.removed.length) bits.push(report.removed.length + ' removed');
    if (report.conflicts.length) bits.push(report.conflicts.length + ' had to be chosen');
    return bits.length ? bits.join(', ') : 'nothing to bring together';
  }

  return { three, sentence, mergeList, mergeIds, mergeToday, layouts, LOCAL_SETTINGS };
})();
