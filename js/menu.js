/* ============================================================
   Flowlist — UI helpers: icons, context menus, rename popover,
   colour picker, hour picker, toasts
   ============================================================ */
const UI = (function () {

  /* ---------- inline icon set ---------- */
  const P = {
    plus:     'M12 5v14M5 12h14',
    minus:    'M5 12h14',
    x:        'M6 6l12 12M18 6L6 18',
    chevR:    'M9 6l6 6-6 6',
    chevD:    'M6 9l6 6 6-6',
    chevL:    'M15 6l-6 6 6 6',
    check:    'M4.5 12.5l5 5 10-11',
    pencil:   'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z',
    trash:    'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13',
    clock:    'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 7.6V12l3 2',
    sun:      'M12 7.5A4.5 4.5 0 1 0 12 16.5 4.5 4.5 0 0 0 12 7.5zM12 2v2M12 20v2M22 12h-2M4 12H2M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4M18.4 18.4L17 17M7 7L5.6 5.6',
    copy:     'M9 9h10v10H9zM5 15V5h10',
    palette:  'M12 3a9 9 0 1 0 0 18 2 2 0 0 0 1.7-3 2 2 0 0 1 1.7-3H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9z',
    layers:   'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
    calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    arrowUp:  'M12 19V6M6 11l6-6 6 6',
    arrowDn:  'M12 5v13M6 13l6 6 6-6',
    collapse: 'M9 4v5H4M15 20v-5h5',
    expand:   'M4 9V4h5M20 15v5h-5',
    grid:     'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    cloud:    'M7 18h9.5a3.5 3.5 0 0 0 .3-7A5.5 5.5 0 0 0 6.3 10 4 4 0 0 0 7 18z',
    image:    'M4 5h16v14H4zM4 15l4.5-4.5L13 15l3-3 4 4',
    news:     'M4 5h13v14H4zM17 9h3v8a2 2 0 0 1-2 2M7 8.5h7M7 12h7M7 15.5h4',
    quote:    'M8 11H5.5A2.5 2.5 0 0 1 8 8.5V7m8 4h-2.5A2.5 2.5 0 0 1 16 8.5V7M8 11v3.5A2.5 2.5 0 0 1 5.5 17M16 11v3.5a2.5 2.5 0 0 1-2.5 2.5',
    battery:  'M3 8h14v8H3zM20 11v2M6 11v2M9.5 11v2',
    star:     'M12 4l2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z',
    today:    'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8.5v4l2.5 1.6',
    cursor:   'M5.5 3.2l13.2 7.6-5.7 1.3-2.2 5.5z',
    eraser:   'M8.5 19H20M4.8 15.2l6-6a2 2 0 0 1 2.8 0l3.4 3.4a2 2 0 0 1 0 2.8L14 19H8.5l-3.7-3.8z',
    arrowR:   'M4 12h15M13 6l6 6-6 6',
    arrowUpRight: 'M7 17L17 7M9 7h8v8',
    focus:    'M3 8V4h4M21 8V4h-4M3 16v4h4M21 16v4h-4',
    canvas:   'M3 5h18v14H3zM6.5 15.5c2-4 3.5-1.5 5-3.5s2.5-4.5 6-2.5',
    sort:     'M4 7h13M4 12h9M4 17h5M17 13v6M17 19l-2.5-2.5M17 19l2.5-2.5',
    keys:     'M3 7h18v10H3zM6.5 10.5h1M10 10.5h1M13.5 10.5h1M17 10.5h.5M7.5 13.8h9'
  };
  function icon(name, cls) {
    return '<svg viewBox="0 0 24 24" class="ic ' + (cls || '') + '"><path d="' + (P[name] || '') + '"/></svg>';
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- toast ---------- */
  const toastEl = document.getElementById('toast');
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2100);
  }

  /* ---------- context menu ---------- */
  const ctx = document.getElementById('ctx');
  let ctxOpen = false;

  /**
   * items: [{ label, icon, onClick, danger, sep:true, head:'…', html:'…' }]
   */
  function menu(x, y, items) {
    ctx.innerHTML = '';
    items.forEach(it => {
      if (it.sep) { const d = document.createElement('div'); d.className = 'ctx-sep'; ctx.appendChild(d); return; }
      if (it.head) { const d = document.createElement('div'); d.className = 'ctx-head'; d.textContent = it.head; ctx.appendChild(d); return; }
      if (it.mount || it.html) {
        const d = document.createElement('div');
        if (it.html) d.innerHTML = it.html;
        if (it.mount) it.mount(d);
        ctx.appendChild(d);
        return;
      }
      const b = document.createElement('button');
      b.className = 'ctx-item' + (it.danger ? ' danger' : '');
      b.innerHTML = (it.icon ? icon(it.icon) : '<span class="ic"></span>') + '<span>' + esc(it.label) + '</span>' +
        (it.right ? '<span class="ctx-arrow">' + it.right + '</span>' : '');
      b.onclick = ev => { ev.stopPropagation(); close(); it.onClick && it.onClick(ev); };
      ctx.appendChild(b);
    });

    ctx.classList.add('show');
    ctx.style.left = '0px'; ctx.style.top = '0px';
    const r = ctx.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - r.width - 10);
    const top = Math.min(y, window.innerHeight - r.height - 10);
    ctx.style.left = Math.max(8, left) + 'px';
    ctx.style.top = Math.max(8, top) + 'px';
    ctxOpen = true;
  }

  function close() { ctx.classList.remove('show'); ctxOpen = false; }
  document.addEventListener('pointerdown', e => { if (ctxOpen && !ctx.contains(e.target)) close(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); closeRename(); } });
  window.addEventListener('resize', close);

  /* ---------- colour swatch block (for menus) ---------- */
  function colorBlock(current, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'ctx-colors';
    Store.PALETTE.forEach(c => {
      const b = document.createElement('button');
      b.className = 'ctx-color' + (c === current ? ' on' : '');
      b.style.setProperty('--c', c);
      b.title = c;
      b.onclick = ev => { ev.stopPropagation(); close(); onPick(c); };
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* ---------- hour picker (for time tags) ---------- */
  const HOURS = [];
  for (let h = 7; h <= 24; h++) HOURS.push(h);
  function hourLabel(h) {
    if (h === 24 || h === 0) return '12 AM';
    if (h === 12) return '12 PM';
    return (h > 12 ? h - 12 : h) + (h >= 12 ? ' PM' : ' AM');
  }
  function hourBlock(current, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'ctx-times';
    HOURS.forEach(h => {
      const b = document.createElement('button');
      b.className = 'ctx-time' + (h === current ? ' on' : '');
      b.textContent = hourLabel(h);
      b.onclick = ev => { ev.stopPropagation(); close(); onPick(h === current ? null : h); };
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* ---------- rename popover ---------- */
  let renamePop = null;
  function rename(anchorRect, value, onSave, hint) {
    closeRename();
    const pop = document.createElement('div');
    pop.className = 'rename-pop';
    pop.innerHTML = '<input type="text" spellcheck="false">' +
      '<div class="rp-hint">' + esc(hint || 'Enter to save · Esc to cancel') + '</div>';
    document.body.appendChild(pop);
    renamePop = pop;

    const left = Math.min(anchorRect.left, window.innerWidth - 276);
    const top = Math.min(anchorRect.bottom + 6, window.innerHeight - 90);
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = top + 'px';

    const input = pop.querySelector('input');
    input.value = value || '';
    input.focus();
    input.select();

    input.onkeydown = e => {
      if (e.key === 'Enter') { const v = input.value.trim(); closeRename(); onSave(v); }
      else if (e.key === 'Escape') { e.stopPropagation(); closeRename(); }
    };
    input.onblur = () => { const v = input.value.trim(); closeRename(); if (v) onSave(v); };
  }
  function closeRename() {
    if (renamePop && renamePop.parentNode) {
      const p = renamePop; renamePop = null;
      p.querySelector('input').onblur = null;
      p.parentNode.removeChild(p);
    }
  }

  /* ---------- confirm ---------- */
  function confirmDelete(what) { return window.confirm('Delete "' + what + '"? This cannot be undone.'); }

  /* ---------- textarea auto-grow ---------- */
  /* ============================================================
     A TEXT BOX AS TALL AS ITS WORDS

     Measuring one means setting its height to auto and reading how tall
     its words are - and that read makes the browser lay out the whole
     page there and then. Done on every keystroke, and for every note on
     the board after every redraw, it was most of what made typing and
     ticking feel slow: a board of ten columns was laid out hundreds of
     times a second.

     Chrome sizes a text box to its words by itself now (field-sizing,
     in css/components.css), so where it can, nothing here measures
     anything. Where it cannot, boxes asked for "soon" are measured
     together in one frame: every height set, then every height read,
     then every height written - one layout instead of one per note.
     ============================================================ */
  const NATIVE_FIT = typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('field-sizing', 'content');

  function measure(ta, max) {
    ta.style.height = 'auto';
    const h = max ? Math.min(ta.scrollHeight, max) : ta.scrollHeight;
    ta.style.height = h + 'px';
    ta.style.overflowY = (max && ta.scrollHeight > max) ? 'auto' : 'hidden';
  }

  function autoGrow(ta, max) {
    if (NATIVE_FIT || !ta) return;
    measure(ta, max);
  }

  const growQueue = new Map();
  let growFrame = 0;
  function autoGrowSoon(ta, max) {
    if (NATIVE_FIT || !ta) return;
    growQueue.set(ta, max);
    if (growFrame) return;
    growFrame = requestAnimationFrame(() => {
      growFrame = 0;
      const boxes = [];
      growQueue.forEach((m, box) => { if (box.isConnected) boxes.push([box, m]); });
      growQueue.clear();
      boxes.forEach(([box]) => { box.style.height = 'auto'; });                 // every write
      const heights = boxes.map(([box, m]) => [m ? Math.min(box.scrollHeight, m) : box.scrollHeight, box.scrollHeight]);  // one layout
      boxes.forEach(([box, m], i) => {                                          // every write
        box.style.height = heights[i][0] + 'px';
        box.style.overflowY = (m && heights[i][1] > m) ? 'auto' : 'hidden';
      });
    });
  }

  return { icon, esc, toast, menu, close, colorBlock, hourBlock, hourLabel, HOURS, rename, closeRename, confirmDelete,
           autoGrow, autoGrowSoon, nativeFit: () => NATIVE_FIT };
})();
