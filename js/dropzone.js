/* ============================================================
   Flowlist — Remove
   The open left-hand panels double as a "take this off" target.
   Drop a canvas card there and it leaves the canvas; drop a board
   column there and it closes. Neither deletes anything — the note
   stays in its category and the category stays in your list.
   ============================================================ */
const Remove = (function () {
  const el = document.getElementById('drop-remove');
  const PANELS = ['panel-lists', 'panel-presets', 'panel-canvas'];
  let armed = false;

  function openPanels() {
    return PANELS.map(id => document.getElementById(id))
                 .filter(p => p && p.classList.contains('open') && p.offsetWidth > 0);
  }

  /** The rectangle covering every open panel, or null when they are all shut. */
  function box() {
    const open = openPanels();
    if (!open.length) return null;
    const r = open.map(p => p.getBoundingClientRect());
    const left = Math.min.apply(null, r.map(x => x.left));
    const right = Math.max.apply(null, r.map(x => x.right));
    const top = Math.min.apply(null, r.map(x => x.top));
    const bottom = Math.max.apply(null, r.map(x => x.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  const COPY = {
    canvas: ['Drop to take it off the canvas', 'The note itself is not deleted'],
    board:  ['Drop to close it', 'It stays in your categories']
  };

  /** Show the target. Returns false when there is no panel to drop onto. */
  function arm(mode) {
    const b = box();
    if (!b) return false;
    const copy = COPY[mode] || COPY.board;
    el.style.left = b.left + 'px';
    el.style.top = b.top + 'px';
    el.style.width = b.width + 'px';
    el.style.height = b.height + 'px';
    el.querySelector('.dr-label').textContent = copy[0];
    el.querySelector('.dr-sub').textContent = copy[1];
    el.classList.add('show');
    armed = true;
    return true;
  }

  function isOver(x, y) {
    if (!armed) return false;
    const b = box();
    return !!b && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  }

  /** Light it up while the pointer is inside. Returns whether it is. */
  function hover(x, y) {
    const over = isOver(x, y);
    el.classList.toggle('armed', over);
    return over;
  }

  function disarm() {
    armed = false;
    el.classList.remove('show', 'armed');
  }

  /* Board columns come through the shared drag engine, so the panels can be
     registered as ordinary drop zones. Nested targets (a preset's box) still
     win, because exact zone matches are resolved before containment. */
  function init() {
    DND.on('start', d => { if (d.kind === 'list') arm('board'); });
    DND.on('end', disarm);

    PANELS.forEach(id => {
      const p = document.getElementById(id);
      if (!p) return;
      DND.zone(p, {
        kind: 'remove', accepts: ['list'], noPlaceholder: true,
        onDrop: payload => {
          const list = Store.listById(payload.listId);
          Store.closeList(payload.listId);
          UI.toast((list ? list.name : 'Column') + ' closed — still in your categories.');
        }
      });
    });
  }

  return { init, arm, hover, isOver, disarm, box };
})();
