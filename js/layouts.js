/* ============================================================
   Flowlist — a layout for each shape

   The computer and the phone are laid out differently on purpose: panels
   beside the board on one, sheets over it on the other, several columns
   against one at a time. So what is open is kept for each shape on its
   own, and closing Do Today on the phone leaves it open on the computer.

   Everything else — the notes, the categories, the settings — syncs
   exactly as it always has. Only these parts are held apart:

     categories   the Categories panel, open or shut
     presets      the Presets panel
     canvases     the Canvases panel
     today        the Do Today panel
     lists        which lists are open on the board, their order, which
                  are folded, and the preset bands around them

   HOW

   The board carries both layouts with it, in `layouts`:

     layouts.desktop.today = { v: { board: true, canvas: false }, at: 1726… }
     layouts.phone.lists   = { v: { open: [...], ... }, at: 1726… }

   A change made here is written to this shape's copy, with the time. A
   board that arrives by sync brings the other devices' copies; each part
   keeps whichever was changed last, and then what is on screen is set
   from this shape's copy — never from how the sending device happened to
   be laid out.

   Settings → Layout can let some parts cross over: "when I change these
   on the computer, change the phone too", and the same the other way.
   A part that crosses is written to both copies at once, so the other
   shape takes it when the board gets there. All of it is off to start.

   WHAT IS NOT A CHANGE

   Only something you did counts. The phone shuts its sheets when the app
   opens, when it is turned into the phone shape, when another sheet
   comes up, and when a note is revealed on the board — and none of those
   is you deciding the computer's Do Today should close. Those go through
   quietly(): the phone's own copy is brought up to date, but not its
   time, so they never win over a real change and never cross over.
   ============================================================ */
const Layouts = (function () {

  /* the panel each part is, in settings.panels */
  const PANELS = { categories: 'lists', presets: 'presets', canvases: 'canvas', today: 'today' };
  const PARTS = ['categories', 'presets', 'canvases', 'today', 'lists'];
  const SHAPES = ['desktop', 'phone'];
  const SURFACES = ['board', 'canvas'];

  let quiet = 0;              // inside quietly(), or putting a layout on screen

  const platform = () => (typeof Mobile !== 'undefined' && Mobile.isPhone()) ? 'phone' : 'desktop';
  const other = p => (p === 'phone' ? 'desktop' : 'phone');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const copy = v => JSON.parse(JSON.stringify(v));

  /* ---------- reading and writing one part of what is on screen ---------- */

  function read(s, part) {
    if (PANELS[part]) {
      const k = PANELS[part], p = s.settings.panels || {};
      return { board: !!(p.board && p.board[k]), canvas: !!(p.canvas && p.canvas[k]) };
    }
    const open = (s.board || []).slice();
    const bands = {};
    (s.lists || []).forEach(l => { if (open.indexOf(l.id) !== -1 && l.presetId) bands[l.id] = l.presetId; });
    return {
      open: open,
      closed: (s.closedOrder || []).slice(),
      folded: (s.lists || []).filter(l => open.indexOf(l.id) !== -1 && l.collapsed).map(l => l.id),
      bands: bands
    };
  }

  /**
   * A stored part as it would be on this board — lists deleted since it was
   * written are left out. Without this, a list deleted on the other device
   * would read as a layout change here.
   */
  function fit(s, part, v) {
    if (PANELS[part]) return { board: !!(v && v.board), canvas: !!(v && v.canvas) };
    const ids = (s.lists || []).map(l => l.id);
    const seen = {};
    const open = ((v && v.open) || []).filter(id => ids.indexOf(id) !== -1 && !seen[id] && (seen[id] = 1));
    const closed = ((v && v.closed) || []).filter(id => ids.indexOf(id) !== -1 && open.indexOf(id) === -1);
    const folded = ids.filter(id => open.indexOf(id) !== -1 && ((v && v.folded) || []).indexOf(id) !== -1);
    const bands = {};
    open.forEach(id => { const b = v && v.bands && v.bands[id]; if (b) bands[id] = b; });
    return { open: open, closed: closed, folded: folded, bands: bands };
  }

  function write(s, part, v) {
    const f = fit(s, part, v);
    if (PANELS[part]) {
      s.settings.panels = s.settings.panels || {};
      SURFACES.forEach(sf => {
        s.settings.panels[sf] = s.settings.panels[sf] || {};
        s.settings.panels[sf][PANELS[part]] = f[sf];
      });
      s.settings.panels.board.canvas = false;       // never wanted on the board
      return;
    }
    s.board = f.open;
    s.closedOrder = f.closed;
    s.lists.forEach(l => {
      const on = f.open.indexOf(l.id) !== -1;
      l.collapsed = on && f.folded.indexOf(l.id) !== -1;
      l.presetId = on ? (f.bands[l.id] || null) : null;
    });
  }

  function shelf(s, shape) {
    s.layouts = (s.layouts && typeof s.layouts === 'object') ? s.layouts : {};
    s.layouts[shape] = (s.layouts[shape] && typeof s.layouts[shape] === 'object') ? s.layouts[shape] : {};
    return s.layouts[shape];
  }

  /* ---------- noticing a change ---------- */

  /** Runs on every save. Cheap: five small comparisons. */
  function record() {
    if (quiet) return;
    const s = Store.get();
    if (!s || !s.settings) return;
    const here = platform(), there = other(here);
    const mine = shelf(s, here);
    const crossing = sharing(here);
    const now = Date.now();
    PARTS.forEach(part => {
      const v = read(s, part);
      const kept = mine[part];
      /* the first look at a part is where it already was, not a change */
      if (!kept) { mine[part] = { v: v, at: 0 }; return; }
      if (same(fit(s, part, kept.v), v)) return;
      mine[part] = { v: v, at: now };
      if (crossing[part]) shelf(s, there)[part] = { v: copy(v), at: now };
    });
  }

  /**
   * Do something to the layout that is not a decision — the phone shutting
   * its sheets for its own reasons. This shape's copy follows what is on
   * screen, but keeps its time, so it never crosses over and never beats a
   * change somebody actually made.
   */
  function quietly(fn) {
    quiet++;
    try { fn(); } finally { quiet--; }
    const s = Store.get();
    const mine = shelf(s, platform());
    PARTS.forEach(part => {
      const v = read(s, part);
      if (!mine[part]) mine[part] = { v: v, at: 0 };
      else if (!same(fit(s, part, mine[part].v), v)) mine[part].v = v;
    });
  }

  /** Put a shape's own layout on screen — after the window changes shape. */
  function useFor(shape) {
    const s = Store.get();
    const kept = s.layouts && s.layouts[shape];
    if (!kept || !PARTS.some(p => kept[p])) return false;
    quiet++;
    try {
      Store.mutate(st => { PARTS.forEach(part => { if (kept[part]) write(st, part, kept[part].v); }); },
        ['board', 'lists', 'panels', 'presets', 'today']);
    } finally { quiet--; }
    return true;
  }

  /**
   * Take in a board from elsewhere without taking its layout.
   *
   * @param {Object} incoming  the whole board, as sync has it
   *
   * It is laid out for this device BEFORE it goes in, not put right after:
   * importing a board announces every change there is, and the shape
   * setting it carried would turn this window into the other shape for a
   * moment — long enough for this shape's layout to be written down as the
   * other's. So: the two layout copies are joined part by part, latest
   * first; the board is set out from this shape's copy, or exactly as the
   * screen is now for any part nobody has written down; the settings that
   * belong to this device alone are put back in; and then it is imported,
   * once.
   */
  function take(incoming) {
    const s0 = Store.get();
    const here = platform();
    const st = copy(incoming);
    st.settings = st.settings || {};
    st.lists = Array.isArray(st.lists) ? st.lists : [];

    /* merge already treats these as this device's own; adopting a whole
       board used to take the sender's, so a laptop held in the desktop
       shape could hold the phone there too */
    if (s0.settings.layout !== undefined) st.settings.layout = s0.settings.layout;
    if (s0.settings.panelsBeforeFocus) st.settings.panelsBeforeFocus = copy(s0.settings.panelsBeforeFocus);
    st.settings.panels = copy(s0.settings.panels || {});

    st.layouts = Merge.layouts(copy(s0.layouts || {}), st.layouts);
    const mine = shelf(st, here);
    PARTS.forEach(part => {
      if (!mine[part]) mine[part] = { v: read(s0, part), at: 0 };
      write(st, part, mine[part].v);
    });

    quiet++;
    try { Store.importJSON(JSON.stringify(st)); } finally { quiet--; }
  }

  /* ---------- what crosses over ---------- */

  /** @returns {Object} { part: true } for the parts a change on `shape` also makes on the other */
  function sharing(shape) {
    const all = Store.settings().layoutShare;
    const mine = all && all[shape];
    const out = {};
    PARTS.forEach(p => { out[p] = !!(mine && mine[p]); });
    return out;
  }

  function setSharing(shape, part, on) {
    if (SHAPES.indexOf(shape) === -1 || PARTS.indexOf(part) === -1) return;
    Store.mutate(s => {
      const all = (s.settings.layoutShare && typeof s.settings.layoutShare === 'object') ? s.settings.layoutShare : {};
      all[shape] = Object.assign({}, all[shape], { [part]: !!on });
      s.settings.layoutShare = all;
    }, null, { silent: true });
  }

  function init() {
    Store.onPersist(record);
    record();                  // write down where everything is now
  }

  return { init, record, quietly, useFor, take, sharing, setSharing, platform, PARTS, read };
})();
