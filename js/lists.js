/* ============================================================
   Flowlist — Lists
   The categories sidebar, the board of open columns, notes,
   their context menus, drag wiring and the sideways grab line.
   ============================================================ */
const Lists = (function () {
  const indexEl = document.getElementById('list-index');
  const boardEl = document.getElementById('board');
  const boardWrap = document.getElementById('board-wrap');
  const emptyEl = document.getElementById('board-empty');
  const openCountEl = document.getElementById('open-count');
  const grabline = document.getElementById('grabline');
  const grabthumb = document.getElementById('grabthumb');

  let pendingFocus = null;   // { listId, itemId, caret:'end' }
  const TAP_MS = 350;        // longer than this is a hold — DND picks a note up at 380
  let seenLists = new Set(); // columns already on the board, so repaints don't re-animate
  const expanded = new Set(); // categories showing their notes in the panel

  /* ============================================================
     SIDEBAR INDEX
     ============================================================ */
  function renderIndex() {
    const s = Store.get();
    const open = s.board.slice();
    const closed = s.closedOrder.filter(id => open.indexOf(id) === -1);
    const rest = s.lists.map(l => l.id).filter(id => open.indexOf(id) === -1 && closed.indexOf(id) === -1);

    indexEl.innerHTML = '';
    if (open.length) {
      indexEl.appendChild(groupLabel('On the board'));
      open.forEach(id => indexEl.appendChild(catRow(Store.listById(id), true)));
    }
    const others = closed.concat(rest);
    if (others.length) {
      indexEl.appendChild(groupLabel(open.length ? 'Closed' : 'All categories'));
      others.forEach(id => indexEl.appendChild(catRow(Store.listById(id), false)));
    }
    if (!s.lists.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.style.padding = '18px 10px';
      p.textContent = 'No categories yet. Use + above to make one.';
      indexEl.appendChild(p);
    }

    const n = Store.expandedCount();
    openCountEl.textContent = n + ' of ' + s.settings.maxOpen + ' open' +
      (s.board.length - n ? ' · ' + (s.board.length - n) + ' collapsed' : '');
  }

  function groupLabel(text) {
    const d = document.createElement('div');
    d.className = 'index-group-label';
    d.textContent = text;
    return d;
  }

  function catRow(list, isOpen) {
    if (!list) return document.createComment('');
    const wrap = document.createElement('div');
    wrap.className = 'cat-wrap';

    const row = document.createElement('div');
    row.className = 'cat' + (isOpen ? ' is-open' : '') + (expanded.has(list.id) ? ' expanded' : '');
    row.dataset.listId = list.id;
    row.dataset.dndItem = '1';
    row.style.setProperty('--c', list.color);
    const undone = list.items.filter(i => !i.done).length;
    row.innerHTML =
      '<button class="cat-twist" title="Show its notes">' + UI.icon('chevR') + '</button>' +
      '<span class="cat-swatch"></span>' +
      '<span class="cat-name" title="' + UI.esc(list.name) + '">' + UI.esc(list.name) + '</span>' +
      '<span class="cat-meta">' + (undone || '') + '</span>' +
      '<button class="icon-btn sm cat-open" title="' + (isOpen ? 'Close' : 'Open on board') + '">' +
      UI.icon(isOpen ? 'minus' : 'plus') + '</button>';

    row.querySelector('.cat-open').onclick = e => {
      e.stopPropagation();
      isOpen ? Store.closeList(list.id) : tryOpen(list.id);
    };
    row.querySelector('.cat-twist').onclick = e => {
      e.stopPropagation();
      expanded.has(list.id) ? expanded.delete(list.id) : expanded.add(list.id);
      renderIndex();
    };
    row.onclick = () => { if (!isOpen) tryOpen(list.id); else flashList(list.id); };
    row.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); categoryMenu(e, list, isOpen); };

    // drag a category out of the sidebar (into a preset box, or onto a canvas)
    row.addEventListener('pointerdown', e => {
      if (e.target.closest('.icon-btn, .cat-twist')) return;
      DND.start(e, { el: row, kind: 'category', payload: { listId: list.id }, axis: 'y' });
    });
    wrap.appendChild(row);

    /* ---- its notes, draggable straight out of the panel ---- */
    if (expanded.has(list.id)) {
      const box = document.createElement('div');
      box.className = 'cat-notes';
      if (!list.items.length) {
        box.innerHTML = '<div class="cat-note-empty">No notes yet</div>';
      } else {
        list.items.forEach(item => {
          const n = document.createElement('div');
          n.className = 'cat-note' + (item.done ? ' done' : '');
          n.dataset.dndItem = '1';
          n.style.setProperty('--c', list.color);
          n.title = item.text || 'Untitled';
          n.innerHTML = '<span class="cn-tick"></span><span>' + UI.esc(item.text || 'Untitled') + '</span>';
          n.addEventListener('pointerdown', e => {
            DND.start(e, { el: n, kind: 'note', axis: 'y', payload: { listId: list.id, itemId: item.id } });
          });
          const noteRowMenu = e => {
            e.preventDefault(); e.stopPropagation();
            UI.menu(e.clientX, e.clientY, [
              { label: 'Rename', icon: 'pencil', onClick: () => {
                  /* the Lists panel shows a plain row, so renaming happens
                     on the board copy of the same note */
                  Lists.tryOpen(list.id);
                  setTimeout(() => Rename.open(Rename.find(item.id)), 60);
                } },
              { sep: true },
              { label: Store.inToday(list.id, item.id) ? 'Remove from Do Today' : 'Send to Do Today', icon: 'today',
                onClick: () => Store.inToday(list.id, item.id)
                  ? Store.removeFromToday(list.id, item.id)
                  : Store.addToToday(list.id, item.id) },
              { label: Store.isTomorrow(item) ? 'Not tomorrow after all' : 'Tomorrow', icon: 'calendar',
                onClick: () => Store.setTomorrow(list.id, item.id, !Store.isTomorrow(item)) },
              { label: item.done ? 'Mark not done' : 'Mark done', icon: 'check',
                onClick: () => Store.setDone(list.id, item.id) },
              { sep: true },
              { label: 'Delete note', icon: 'trash', danger: true, onClick: () => Store.deleteNote(list.id, item.id) }
            ]);
          };
          n.oncontextmenu = noteRowMenu;
          DoubleTap.on(n, noteRowMenu);
          box.appendChild(n);
        });
      }
      wrap.appendChild(box);
    }
    return wrap;
  }

  function tryOpen(id) {
    Store.setView('board');   // opening a category means you want to see the board
    const res = Store.openList(id);
    if (res.ok && res.collapsed) {
      UI.toast('Board is full — opened collapsed. Collapse or close another to expand it.');
    }
  }

  /* ============================================================
     REVEALING A NOTE

     "Reveal in …" used to open the column and stop, leaving you to find
     the note in it. This opens it, expands it if it was folded, scrolls
     the note into the middle of the screen, and lights it up long
     enough to be found — about two seconds.

     The light has to survive the board being drawn again. Opening a
     column redraws the board, and so can sync arriving a moment later;
     a class on the old element would be thrown away with it. So what is
     being revealed, and since when, is remembered here, and a fresh
     element picks the animation up part-way through rather than
     starting again.
     ============================================================ */
  const REVEAL_MS = 1900;
  let revealing = null;       // { itemId, at }

  function paintReveal(el) {
    if (!revealing || el.dataset.itemId !== revealing.itemId) return;
    const gone = Date.now() - revealing.at;
    if (gone >= REVEAL_MS) { revealing = null; return; }
    el.style.setProperty('--reveal-from', -gone + 'ms');
    /* taken off and put back, so revealing the same note twice lights it
       twice rather than leaving a spent animation where it was */
    el.classList.remove('revealed');
    void el.offsetWidth;
    el.classList.add('revealed');
    el._revealAt = revealing.at;       /* which reveal lit it, so it is not lit twice for one */
  }

  function reveal(listId, itemId) {
    const list = Store.listById(listId);
    if (!list || !Store.itemById(listId, itemId)) return false;

    /* Said first, so any redraw from here on — opening the column, closing
       a sheet — draws the note already lit. */
    const at = Date.now();
    revealing = { itemId, at };

    Store.setView('board');
    if (!Store.isOpen(listId)) tryOpen(listId);
    /* a full board opens it folded; unfold it if there is room, since a
       folded column has no notes to show */
    const now = Store.listById(listId);
    if (now && now.collapsed) Store.toggleCollapse(listId);

    /* on a phone the panel is a sheet over the board: the note would be
       revealed behind it */
    if (Mobile.isPhone()) Mobile.closeSheets(true);

    const find = () => boardEl.querySelector('[data-list-id="' + listId + '"] [data-item-id="' + itemId + '"]');

    /* Lit now, not on the next frame: the note is on the board the moment
       its column opens, and waiting for a frame only gave a slow one the
       chance to show an unlit note first. */
    const n = find();
    if (n && n._revealAt !== at) paintReveal(n);

    /* scrolling does want the layout settled */
    requestAnimationFrame(() => {
      const m = find();
      if (!m) return;
      m.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      if (m._revealAt !== at) paintReveal(m);
    });
    return true;
  }

  function flashList(id) {
    const el = boardEl.querySelector('[data-list-id="' + id + '"]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' }],
      { duration: 380, easing: 'ease-out' });
  }

  function categoryMenu(e, list, isOpen) {
    const items = [
      { label: isOpen ? 'Close on board' : 'Open on board', icon: isOpen ? 'minus' : 'plus',
        onClick: () => isOpen ? Store.closeList(list.id) : tryOpen(list.id) },
      { label: 'Rename', icon: 'pencil', onClick: () => renameList(e, list) },
      { sep: true },
      { head: 'Colour' },
      { html: '', mount: d => d.appendChild(UI.colorBlock(list.color, c => Store.mutate(() => { list.color = c; }, ['lists', 'board', 'presets']))) },
      { sep: true },
      { label: 'Delete category', icon: 'trash', danger: true,
        onClick: () => { if (UI.confirmDelete(list.name)) Store.deleteList(list.id); } }
    ];
    UI.menu(e.clientX, e.clientY, items);
  }

  function renameList(e, list) {
    const rect = (e.target.closest('.cat, .list-head') || e.target).getBoundingClientRect();
    UI.rename(rect, list.name, v => {
      Store.mutate(() => { list.name = v || 'Untitled'; }, ['lists', 'board', 'presets']);
    }, 'Full name — long ones are clipped on the board');
  }

  /* ============================================================
     BOARD
     ============================================================ */
  function renderBoard() {
    const s = Store.get();

    /* Remember each column's scroll position across the rebuild.

       A column drawn a moment ago has not been put back yet: its scroll goes
       back on the next frame, once its notes have grown to their height. So
       what it is ABOUT to be is what counts, not what it reads now. Ticking
       a note redraws the board twice in one go — once for the board, once
       for Do Today — and the second read the first's not-yet-restored 0 and
       threw you back to the top of the list. */
    const scrolls = {};
    boardEl.querySelectorAll('.list').forEach(el => {
      const body = el.querySelector('.list-body');
      if (body) scrolls[el.dataset.listId] = body._wantScroll !== undefined ? body._wantScroll : body.scrollTop;
    });
    const boardScroll = boardEl.scrollLeft;

    const prevSeen = seenLists;
    seenLists = new Set(s.board);

    /* ============================================================
       ONLY WHAT CHANGED

       Every change used to throw the whole board away and build it again
       - ten columns, hundreds of notes, a tenth of a second each time, on
       every tick. Now what is already on screen is looked at first. A
       column whose name, colour and fold are the same keeps its element,
       and only its count and sort light are touched. A note that says
       and shows the same keeps its element too. Only what changed is
       built again: tick a note and that note, its column's count and the
       copy in Completed are all that move.

       An element is only kept for the very same list and note objects it
       was built for - its buttons hold on to them. A board that arrives
       whole from the other device is all new objects, so all of it is
       built again, as it should be.
       ============================================================ */
    const oldNotes = new Map();
    boardEl.querySelectorAll('.list-body > .note').forEach(n => oldNotes.set(n.dataset.itemId, n));
    const oldLists = new Map();
    [].forEach.call(boardEl.children, c => { if (c.dataset && c.dataset.listId) oldLists.set(c.dataset.listId, c); });

    const want = [];
    s.board.forEach(id => {
      const list = Store.listById(id);
      if (!list) return;
      const sig = headSig(list);
      let el = oldLists.get(id);
      if (!(el && el._list === list && el._sig === sig)) {
        el = listEl(list, scrolls[id] || 0, !prevSeen.has(id));
        el._list = list;
        el._sig = sig;
      } else {
        paintHead(el, list);
      }
      const body = el.querySelector(':scope > .list-body');
      if (body) fillBody(body, list, oldNotes);
      want.push(el);
    });
    place(boardEl, want, c => !!(c.dataset && c.dataset.listId));

    emptyEl.classList.toggle('show', s.board.length === 0);
    boardEl.scrollLeft = boardScroll;
    /* put each column back now, as near as it will go before its notes have
       grown; the next frame puts it back exactly */
    boardEl.querySelectorAll('.list-body').forEach(b => { if (b._wantScroll) b.scrollTop = b._wantScroll; });

    DND.clearZones(z => z.kind === 'notes');
    boardEl.querySelectorAll('.list-body').forEach(body => {
      DND.zone(body, {
        kind: 'notes', accepts: ['note'], axis: 'y',
        /* A row dragged out of Do Today is a pointer to a note, and a
           column would treat it as the note itself and move it here, out
           of its own list. See today.js. */
        canAccept: payload => payload.from !== 'today',
        onDrop: (payload, index) => {
          /* where it was dropped, counting what is on screen — a sorted list
             takes the order it is showing as its own rather than springing
             the note back to wherever the sort wanted it */
          const to = Store.listById(body.dataset.listId);
          const wasSorted = Store.listSorted(to);
          Store.moveNoteInView(payload.listId, payload.itemId, body.dataset.listId, index);
          if (wasSorted) UI.toast('Moved by hand, so ' + (to ? to.name : 'the list') + ' is back in your own order.');
        }
      });
    });
    DND.zone(boardEl, {
      kind: 'board', accepts: ['list'], axis: 'x', itemSelector: '.list',
      onDrop: (payload, index) => Store.moveListOnBoard(payload.listId, index)
    });

    if (pendingFocus) {
      const sel = '[data-list-id="' + pendingFocus.listId + '"] [data-item-id="' + pendingFocus.itemId + '"]';
      const note = boardEl.querySelector(sel);
      pendingFocus = null;
      /* Through Rename, not a bare focus(): on a phone the text is
         read-only, and focusing a read-only field brings no keyboard up —
         so + made a note and then left you with nothing to type with.
         This all runs inside the tap that asked for the note, which is
         what lets a phone raise its keyboard for it at all. */
      if (note) Rename.open(note);
    }

    syncGrabline();
    Presets.renderBands();
  }

  /* what a column's header is built from, apart from the count and the
     sort light, which are cheap to change in place */
  const headSig = list => JSON.stringify([list.name, list.color, !!list.collapsed]);

  function paintHead(el, list) {
    const count = el.querySelector('.list-count');
    if (count) {
      const undone = list.items.filter(i => !i.done).length;
      const text = String(undone || '');
      if (count.textContent !== text) count.textContent = text;
    }
    const sortBtn = el.querySelector('.act-sort');
    if (sortBtn) sortBtn.classList.toggle('on', Store.listSorted(list) || !!list.hideDone);
  }

  /* what a note is drawn from, apart from its words */
  function noteSig(list, item) {
    const src = item.copyOf ? Store.sourceOf(item) : null;
    return JSON.stringify([
      !!item.done, !!item.expanded, item.hour || null,
      Store.inToday(list.id, item.id), Store.isTomorrow(item),
      item.copyOf || null, !!item.wasToday, src ? [src.name, src.color] : null,
      document.body.classList.contains('phone')
    ]);
  }
  const noteWords = item => JSON.stringify([item.text || '', item.detail || '']);

  /**
   * Put a column's notes in its body, keeping every note element that still
   * says and shows the same, for the same note in the same list.
   */
  function fillBody(body, list, oldNotes) {
    const want = [];
    if (!list.items.length) {
      const em = document.createElement('div');
      em.className = 'list-empty';
      em.innerHTML = 'Nothing here yet.<br>Hit <kbd>+</kbd> above, or right-click for the menu.';
      want.push(em);
    } else {
      const shown = Store.listView(list);
      shown.forEach(item => {
        const old = oldNotes.get(item.id);
        const sig = noteSig(list, item);
        const words = noteWords(item);
        const keep = old && old._list === list && old._item === item && old._sig === sig &&
          /* words typed into the note on screen are already there to see */
          (old._words === words || old.contains(document.activeElement));
        let el = old;
        if (keep) {
          old._words = words;
          if (revealing && old._revealAt !== revealing.at) paintReveal(old);
          /* a light that has run its course comes off, so nothing can set it going again */
          if (old.classList.contains('revealed') && (!revealing || old._revealAt !== revealing.at ||
              Date.now() - revealing.at >= REVEAL_MS)) {
            old.classList.remove('revealed');
          }
        } else {
          el = noteEl(list, item);
          el._list = list;
          el._item = item;
          el._sig = sig;
          el._words = words;
        }
        oldNotes.delete(item.id);
        want.push(el);
      });
      const hidden = list.items.length - shown.length;
      if (hidden) {
        const note = document.createElement('button');
        note.className = 'list-hidden';
        note.textContent = hidden + (hidden === 1 ? ' finished note hidden' : ' finished notes hidden');
        note.title = 'Show them again';
        note.onclick = () => Store.setListSort(list.id, { hideDone: false });
        want.push(note);
      }
    }
    place(body, want, () => true);
  }

  /**
   * Make a parent's children exactly `want`, in order, moving only what is
   * out of place. Children `mine` does not claim are left where they are.
   */
  function place(parent, want, mine) {
    /* what is going goes first - left in, it sat in the way, and every
       note after it was moved one place along to get past it */
    const keep = new Set(want);
    [].filter.call(parent.children, mine).forEach(n => { if (!keep.has(n)) n.remove(); });

    const next = n => { while (n && !mine(n)) n = n.nextElementSibling; return n; };
    let cursor = next(parent.firstElementChild);
    want.forEach(node => {
      if (node === cursor) { cursor = next(cursor.nextElementSibling); return; }
      parent.insertBefore(node, cursor);          // only this one moves
    });
  }

  function listEl(list, scrollTop, isNew) {
    const el = document.createElement('section');
    el.className = 'list' + (list.collapsed ? ' collapsed' : '') + (isNew ? ' just-opened' : '');
    el.dataset.listId = list.id;
    el.dataset.dndItem = '1';
    el.style.setProperty('--c', list.color);

    /* ---- header ---- */
    const head = document.createElement('div');
    head.className = 'list-head';
    const undone = list.items.filter(i => !i.done).length;
    head.innerHTML =
      '<div class="list-title-wrap">' +
        '<span class="list-title" title="' + UI.esc(list.name) + '">' + UI.esc(list.name) + '</span>' +
        (list.collapsed ? '' : '<span class="list-count">' + (undone || '') + '</span>') +
      '</div>' +
      '<div class="list-head-actions">' +
        (list.collapsed ? '' : '<button class="icon-btn sm act-add" title="Add note (top)">' + UI.icon('plus') + '</button>') +
        (list.collapsed ? '' : '<button class="icon-btn sm act-sort' + (Store.listSorted(list) || list.hideDone ? ' on' : '') +
          '" title="How this list is sorted">' + UI.icon('sort') + '</button>') +
        '<button class="icon-btn sm act-collapse" title="' + (list.collapsed ? 'Expand' : 'Collapse to a spine') + '">' +
          UI.icon(list.collapsed ? 'expand' : 'collapse') + '</button>' +
        '<button class="icon-btn sm act-close" title="Close (back to Lists panel)">' +
          UI.icon(list.collapsed ? 'x' : 'minus') + '</button>' +
      '</div>';

    const addBtn = head.querySelector('.act-add');
    if (addBtn) addBtn.onclick = e => { e.stopPropagation(); addNoteTop(list.id); };

    const sortBtn = head.querySelector('.act-sort');
    if (sortBtn) sortBtn.onclick = e => {
      e.stopPropagation();
      const r = sortBtn.getBoundingClientRect();
      sortMenu(r.left - 150, r.bottom + 6, list);
    };

    head.querySelector('.act-collapse').onclick = e => {
      e.stopPropagation();
      if (!Store.toggleCollapse(list.id)) {
        UI.toast('Already showing ' + Store.settings().maxOpen + ' columns. Collapse or close one first.');
      }
    };
    head.querySelector('.act-close').onclick = e => { e.stopPropagation(); Store.closeList(list.id); };

    head.ondblclick = e => { if (!e.target.closest('.icon-btn')) renameList(e, list); };

    // drag the whole column left/right by its header
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('.icon-btn')) return;
      DND.start(e, { el, kind: 'list', payload: { listId: list.id }, axis: 'x' });
    });

    // click a collapsed spine to expand it
    if (list.collapsed) {
      el.onclick = e => {
        if (e.target.closest('.icon-btn')) return;
        if (!Store.toggleCollapse(list.id)) {
          UI.toast('Already showing ' + Store.settings().maxOpen + ' columns. Collapse or close one first.');
        }
      };
    }

    el.appendChild(head);

    /* ---- body ---- */
    if (!list.collapsed) {
      const body = document.createElement('div');
      body.className = 'list-body';
      body.dataset.listId = list.id;

      /* its notes are put in by fillBody, which renderBoard calls next */
      el.appendChild(body);
      /* ...unless a note in this column is about to be typed into: a note
         just made at the top of a column scrolled to the bottom has to be
         brought into view, and putting the old position back would take it
         straight back off screen. Focusing it scrolls it into view itself. */
      if (!(pendingFocus && pendingFocus.listId === list.id)) {
        body._wantScroll = scrollTop;
        requestAnimationFrame(() => { body.scrollTop = scrollTop; delete body._wantScroll; });
      }
    }

    el.oncontextmenu = e => {
      if (e.target.closest('.note')) return;   // notes have their own menu
      e.preventDefault();
      listMenu(e, list);
    };

    return el;
  }

  /* ============================================================
     HOW A LIST IS SORTED

     The order you put a list in is the one it keeps. This shows it in
     another order without losing that — by when each note was written,
     with the finished ones out of the way. Ticks rather than words, so
     what is on is visible at a glance, and it stays open long enough to
     set two of them.
     ============================================================ */
  function sortMenu(x, y, list) {
    const tick = on => (on ? '✓' : '');
    const order = list.sort === 'new' || list.sort === 'old' ? list.sort : 'manual';
    const again = () => setTimeout(() => sortMenu(x, y, list), 0);
    UI.menu(x, y, [
      { head: 'Order' },
      /* back to the order the list is kept in — the one you put it in by
         hand — rather than keeping whatever the sort was showing */
      { label: 'My own order', icon: 'layers', right: tick(order === 'manual'),
        onClick: () => { Store.setListSort(list.id, { sort: null }); } },
      { label: 'Newest first', icon: 'arrowUp', right: tick(order === 'new'),
        onClick: () => { Store.setListSort(list.id, { sort: 'new' }); } },
      { label: 'Oldest first', icon: 'arrowDn', right: tick(order === 'old'),
        onClick: () => { Store.setListSort(list.id, { sort: 'old' }); } },
      { sep: true },
      { head: 'Finished notes' },
      { label: 'Keep them at the bottom', icon: 'check', right: tick(!!list.doneBottom),
        onClick: () => { Store.setListSort(list.id, { doneBottom: !list.doneBottom }); again(); } },
      { label: 'Hide them', icon: 'x', right: tick(!!list.hideDone),
        onClick: () => { Store.setListSort(list.id, { hideDone: !list.hideDone }); again(); } }
    ]);
  }

  function listMenu(e, list) {
    UI.menu(e.clientX, e.clientY, [
      { label: 'Add note', icon: 'plus', onClick: () => addNoteTop(list.id) },
      { label: 'Add note at bottom', icon: 'arrowDn', onClick: () => addNoteBottom(list.id) },
      { sep: true },
      { label: 'Rename', icon: 'pencil', onClick: () => renameList(e, list) },
      { label: 'How it is sorted', icon: 'sort', onClick: () => sortMenu(e.clientX, e.clientY, list) },
      { label: list.collapsed ? 'Expand' : 'Collapse', icon: list.collapsed ? 'expand' : 'collapse',
        onClick: () => { if (!Store.toggleCollapse(list.id)) UI.toast('No room to expand — collapse or close another column.'); } },
      { label: 'Close', icon: 'minus', onClick: () => Store.closeList(list.id) },
      { sep: true },
      { head: 'Colour' },
      { html: '', mount: d => d.appendChild(UI.colorBlock(list.color, c => Store.mutate(() => { list.color = c; }, ['lists', 'board', 'presets']))) },
      { sep: true },
      { label: 'Clear finished', icon: 'check',
        /* through the store, so one undo brings all of them back */
        onClick: () => {
          const n = Store.clearFinished(list.id);
          if (!n) UI.toast('Nothing finished in ' + list.name + ' yet.');
        } },
      { label: 'Delete category', icon: 'trash', danger: true,
        onClick: () => { if (UI.confirmDelete(list.name)) Store.deleteList(list.id); } }
    ]);
  }

  function addNoteTop(listId) {
    const n = Store.addNote(listId, 0, '');
    if (n) pendingFocus = { listId, itemId: n.id };
    renderBoard();
  }
  function addNoteBottom(listId) {
    const l = Store.listById(listId);
    const n = Store.addNote(listId, l ? l.items.length : 0, '');
    if (n) pendingFocus = { listId, itemId: n.id };
    renderBoard();
  }

  /* ============================================================
     NOTE
     ============================================================ */
  function noteEl(list, item) {
    const el = document.createElement('div');
    el.className = 'note' +
      (item.done ? ' done' : '') +
      (item.expanded ? ' expanded' : '') +
      (item.detail ? ' has-detail' : '');
    el.dataset.itemId = item.id;
    el.dataset.dndItem = '1';

    const inToday = Store.inToday(list.id, item.id);
    /* A copy in Completed that was on Do Today when it was ticked keeps its
       time and the Do Today mark as a record of the day. A record has no ×
       on it: a time or a mark lost to a stray tap could not be put back. */
    const record = !!item.copyOf && !inToday;
    const showToday = inToday || (record && item.wasToday);
    const shut = (label, act) => record ? '' : '<button data-act="' + act + '" title="' + label + '">&times;</button>';
    /* put off to tomorrow: a dashed bubble, because it is not yet */
    const tomorrow = Store.isTomorrow(item);
    /* a copy in Completed says which list it was ticked in, in that list's colour */
    const source = item.copyOf ? Store.sourceOf(item) : null;

    el.innerHTML =
      '<div class="note-row">' +
        '<button class="note-check" title="Done"><svg viewBox="0 0 24 24"><path d="M4.5 12.5l5 5 10-11"/></svg></button>' +
        '<textarea class="note-text" rows="1" spellcheck="false" placeholder="Write something…"></textarea>' +
        '<button class="note-exp" title="Details">' + UI.icon('chevR') + '</button>' +
      '</div>' +
      (item.hour || showToday || tomorrow || source ?
        '<div class="note-tags">' +
          (source ? '<span class="tag tag-from" style="--from:' + UI.esc(source.color || '') + '" title="Ticked off in ' +
            UI.esc(source.name) + '"><i class="tag-dot"></i><span class="tag-name">' + UI.esc(source.name || 'Untitled') + '</span></span>' : '') +
          (item.hour ? '<span class="tag">' + UI.icon('clock') + UI.hourLabel(item.hour) + shut('Clear time', 'hour') + '</span>' : '') +
          (showToday ? '<span class="tag tag-today' + (record ? ' was' : '') + '"' +
            (record ? ' title="It was on Do Today when it was done"' : '') + '>' +
            UI.icon('today') + 'Today' + shut('Remove from Today', 'today') + '</span>' : '') +
          (tomorrow ? '<span class="tag tag-tomorrow">' + UI.icon('calendar') + 'Tomorrow' +
            '<button data-act="tomorrow" title="Not tomorrow after all">&times;</button></span>' : '') +
        '</div>' : '') +
      '<div class="note-detail-wrap">' +
        '<textarea class="note-detail" placeholder="Longer description…"></textarea>' +
      '</div>';

    /* text */
    const ta = el.querySelector('.note-text');
    ta.value = item.text;

    /* On a phone the text is not typed into by tapping it. A tap there
       used to put the cursor in and start a rename — including the tap
       that was the beginning of a hold, so picking a note up renamed it
       at the same time. Renaming is asked for deliberately, from the
       menu two taps away. */
    if (document.body.classList.contains('phone')) ta.readOnly = true;
    UI.autoGrowSoon(ta);
    ta.addEventListener('input', () => {
      UI.autoGrow(ta);
      Store.mutate(() => { item.text = ta.value; }, null, { silent: true });
      const c = el.closest('.list').querySelector('.list-count');
      if (c) c.textContent = list.items.filter(i => !i.done).length || '';
    });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && Keys.on('noteEnter')) {
        e.preventDefault();
        const idx = list.items.findIndex(i => i.id === item.id);
        const n = Store.addNote(list.id, idx + 1, '');
        pendingFocus = { listId: list.id, itemId: n.id };
        renderBoard();
      } else if (e.key === 'Backspace' && ta.value === '' && !item.detail && Keys.on('noteBackspace')) {
        e.preventDefault();
        const idx = list.items.findIndex(i => i.id === item.id);
        const prev = list.items[idx - 1];
        if (prev) pendingFocus = { listId: list.id, itemId: prev.id };
        Store.deleteNote(list.id, item.id);
      } else if (e.key === 'Escape') { ta.blur(); }
    });

    /* done */
    el.querySelector('.note-check').onclick = e => {
      e.stopPropagation();
      Store.setDone(list.id, item.id);
      /* A moment's flourish on the note just ticked, for a theme that has
         one. Found again by id, since ticking may have drawn the note
         afresh. Only on a tick - a board opening with done notes on it
         does not set them all off. */
      const now = boardEl.querySelector('[data-list-id="' + list.id + '"] [data-item-id="' + item.id + '"]');
      if (now) {
        now.classList.add('just-ticked');
        setTimeout(() => now.classList.remove('just-ticked'), 600);
      }
    };

    /* detail box */
    const det = el.querySelector('.note-detail');
    det.value = item.detail || '';
    if (item.expanded) UI.autoGrowSoon(det, 132);
    det.addEventListener('input', () => {
      UI.autoGrow(det, 132);
      Store.mutate(() => { item.detail = det.value; }, null, { silent: true });
      el.classList.toggle('has-detail', !!det.value);
    });
    el.querySelector('.note-exp').onclick = e => {
      e.stopPropagation();
      item.expanded = !item.expanded;
      el.classList.toggle('expanded', item.expanded);
      Store.mutate(() => {}, null, { silent: true });
      if (item.expanded) { UI.autoGrow(det, 132); det.focus(); }
    };

    /* Tag chips.

       The chip is inert and only its × takes a tap — see the note on
       .tag in components.css. That is a deliberately small target: a
       thumb lands on these chips constantly on the way to the note, and
       a time cleared by accident is not missed until it is too late to
       matter. Aiming at the × is the whole of the gesture. */
    const acts = {
      hour: () => Store.mutate(() => { item.hour = null; }, ['board', 'today']),
      today: () => Store.removeFromToday(list.id, item.id),
      tomorrow: () => Store.setTomorrow(list.id, item.id, false)
    };
    el.querySelectorAll('.note-tags .tag button[data-act]').forEach(b => {
      b.onclick = e => { e.stopPropagation(); acts[b.dataset.act](); };
    });

    /* On a phone the text only opens for typing when asked (see above) —
       except on a note with no name yet, where there is nothing to protect
       and nothing else a tap could sensibly mean. A tap on one opens it for
       a name. Not a hold: holding is how a note is picked up. */
    let downAt = 0;
    el.addEventListener('pointerdown', () => { downAt = Date.now(); }, true);
    el.addEventListener('click', e => {
      if (!document.body.classList.contains('phone')) return;
      if (e.target.closest('button, .note-detail')) return;
      if (String(item.text || '').trim()) return;
      if (!ta.readOnly) return;                       // already being typed into
      if (Date.now() - downAt > TAP_MS) return;       // a hold, not a tap
      Rename.open(el);
    });

    /* drag — a first click on the text still focuses it for typing; only a
       textarea you are already editing is exempt, so selecting words works */
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      if (e.target.tagName === 'TEXTAREA' && document.activeElement === e.target) return;
      DND.start(e, { el, kind: 'note', payload: { listId: list.id, itemId: item.id }, axis: 'y' });
    });

    /* context menu */
    el.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); noteMenu(e, list, item); };
    /* a phone has no right button, so two taps open the same menu */
    DoubleTap.on(el, ev => noteMenu(ev, list, item));

    paintReveal(el);             // still lit, if the board was redrawn mid-reveal
    return el;
  }

  /* A note already put off says which day it is on, so the menu does not
     make you open the picker to find out. */
  function laterLabel(item) {
    const day = Store.dayOf(item);
    if (!day || day === Store.nextDayKey()) return 'A later date…';
    return 'On ' + When.pretty(day) + '…';
  }

  function noteMenu(e, list, item) {
    const idx = list.items.findIndex(i => i.id === item.id);
    const isToday = Store.inToday(list.id, item.id);
    const isTomorrow = Store.isTomorrow(item);
    UI.menu(e.clientX, e.clientY, [
      { label: 'Rename', icon: 'pencil', onClick: () => Rename.open(Rename.find(item.id)) },
      { sep: true },
      { label: 'Add note above', icon: 'arrowUp', onClick: () => { const n = Store.addNote(list.id, idx, ''); pendingFocus = { listId: list.id, itemId: n.id }; renderBoard(); } },
      { label: 'Add note below', icon: 'arrowDn', onClick: () => { const n = Store.addNote(list.id, idx + 1, ''); pendingFocus = { listId: list.id, itemId: n.id }; renderBoard(); } },
      { sep: true },
      { label: isToday ? 'Remove from Do Today' : 'Send to Do Today', icon: 'today',
        onClick: () => isToday ? Store.removeFromToday(list.id, item.id) : Store.addToToday(list.id, item.id) },
      { label: isTomorrow ? 'Not tomorrow after all' : 'Tomorrow', icon: 'calendar',
        onClick: () => Store.setTomorrow(list.id, item.id, !isTomorrow) },
      /* Today and tomorrow were the only two answers; the field always held
         a date, so this is the one that lets you say which. */
      { label: laterLabel(item), icon: 'calendar', onClick: ev => When.pick(ev, list.id, item.id) },
      { label: item.done ? 'Mark not done' : 'Mark done', icon: 'check',
        onClick: () => Store.setDone(list.id, item.id) },
      { label: item.expanded ? 'Hide details' : 'Show details', icon: item.expanded ? 'chevD' : 'chevR',
        onClick: () => { Store.mutate(() => { item.expanded = !item.expanded; }, ['board']); } },
      { sep: true },
      { head: 'Time' },
      { html: '', mount: d => d.appendChild(UI.hourBlock(item.hour, h => {
          Store.mutate(() => { item.hour = h; }, ['board', 'today']);
          /* a time puts a note on Do Today — unless it is for tomorrow, where it waits with its time */
          if (h && !Store.inToday(list.id, item.id) && !Store.isTomorrow(item)) Store.addToToday(list.id, item.id);
        })) },
      { sep: true },
      { label: 'Duplicate', icon: 'copy', onClick: () => {
          const copy = JSON.parse(JSON.stringify(item));
          copy.id = Store.uid();
          Store.mutate(() => { list.items.splice(idx + 1, 0, copy); }, ['board', 'lists']);
        } },
      { label: 'Delete note', icon: 'trash', danger: true, onClick: () => Store.deleteNote(list.id, item.id) }
    ]);
  }

  /* ============================================================
     GRAB LINE (sideways scroller)
     ============================================================ */
  function syncGrabline() {
    const overflow = boardEl.scrollWidth - boardEl.clientWidth;
    if (overflow <= 4) { grabline.classList.remove('show'); return; }
    grabline.classList.add('show');
    const ratio = boardEl.clientWidth / boardEl.scrollWidth;
    const trackW = grabline.clientWidth - 32;
    const thumbW = Math.max(44, trackW * ratio);
    const maxTravel = trackW - thumbW;
    const pos = (boardEl.scrollLeft / overflow) * maxTravel;
    grabthumb.style.width = thumbW + 'px';
    grabthumb.style.transform = 'translateX(' + pos + 'px)';
  }

  /* ============================================================
     DRAGGING THE BOARD ITSELF

     Hold the middle button anywhere on the board and pull: the columns
     travel with the pointer, which is the quickest way past ten of them.
     Sideways only — up and down belongs to whichever column is under the
     pointer, and taking that over would be a nuisance rather than a help.

     The middle button is otherwise Chrome's own scroll-anywhere gesture,
     which puts a compass on screen and fights this for the same pointer,
     so the press is taken before the browser sees it.
     ============================================================ */
  function wireBoardPan() {
    let panning = false, fromX = 0, fromScroll = 0, moved = 0;

    boardWrap.addEventListener('pointerdown', e => {
      if (e.button !== 1) return;
      panning = true; fromX = e.clientX; fromScroll = boardEl.scrollLeft; moved = 0;
      document.body.classList.add('board-panning');
      try { boardWrap.setPointerCapture(e.pointerId); } catch (err) { /* it will follow the pointer anyway */ }
      e.preventDefault();
    });
    boardWrap.addEventListener('pointermove', e => {
      if (!panning) return;
      const by = e.clientX - fromX;
      moved = Math.max(moved, Math.abs(by));
      boardEl.scrollLeft = fromScroll - by;
      e.preventDefault();
    });
    const letGo = e => {
      if (!panning) return;
      panning = false;
      document.body.classList.remove('board-panning');
      if (e) { try { boardWrap.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ } }
      syncGrabline();
    };
    boardWrap.addEventListener('pointerup', letGo);
    boardWrap.addEventListener('pointercancel', letGo);
    /* the click Chrome sends after a middle press: it would paste on some
       systems and open a link on others, and here it means nothing */
    boardWrap.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
    /* Chrome starts its own scroll-anywhere on mousedown, not pointerdown */
    boardWrap.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
  }

  function wireGrabline() {
    let dragging = false, startX = 0, startScroll = 0;
    grabthumb.addEventListener('pointerdown', e => {
      dragging = true; startX = e.clientX; startScroll = boardEl.scrollLeft;
      grabline.classList.add('dragging');
      grabthumb.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    grabthumb.addEventListener('pointermove', e => {
      if (!dragging) return;
      const overflow = boardEl.scrollWidth - boardEl.clientWidth;
      const trackW = grabline.clientWidth - 32;
      const thumbW = grabthumb.getBoundingClientRect().width;
      const maxTravel = Math.max(1, trackW - thumbW);
      boardEl.scrollLeft = startScroll + ((e.clientX - startX) / maxTravel) * overflow;
    });
    const stop = () => { dragging = false; grabline.classList.remove('dragging'); };
    grabthumb.addEventListener('pointerup', stop);
    grabthumb.addEventListener('pointercancel', stop);

    /* The wheel, over the bar itself. The bar sits under the board rather
       than inside it, so the board's own wheel handler below never heard
       about it and the wheel did nothing there. Grabbing and dragging the
       thumb is untouched. */
    grabline.addEventListener('wheel', e => {
      const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? boardEl.clientWidth : 1);
      /* a mouse wheel says Y; a trackpad pushed sideways says X */
      const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
      if (!d) return;
      boardEl.scrollLeft += d;
      e.preventDefault();
    }, { passive: false });     // only the bar itself waits on this, never a column

    grabline.addEventListener('pointerdown', e => {
      if (e.target === grabthumb) return;
      const rel = (e.clientX - grabline.getBoundingClientRect().left - 16) / (grabline.clientWidth - 32);
      boardEl.scrollLeft = rel * (boardEl.scrollWidth - boardEl.clientWidth);
    });

    boardEl.addEventListener('scroll', () => { syncGrabline(); Presets.renderBands(); });
    window.addEventListener('resize', () => { syncGrabline(); Presets.renderBands(); });

    /* The wheel over the gaps between columns - or over a column's head -
       slides the board sideways. Over a column it scrolls the column, and
       with shift held it slides the board: the browser does both itself.

       Passive, and that matters more than anything else here. A wheel
       listener that might cancel the scroll makes the browser hold every
       scroll underneath it - every column on the board - until this script
       has had its turn, so a busy moment on the page became a stutter in
       the scroll. This one only ever adds a sideways slide where nothing
       would scroll anyway, so it has nothing to cancel. */
    boardEl.addEventListener('wheel', e => {
      if (e.shiftKey || e.target.closest('.list-body')) return;
      boardEl.scrollLeft += (e.deltaY || e.deltaX);
    }, { passive: true });
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    wireGrabline();
    wireBoardPan();
    /* One function for all three, so a change that touches the board, Do
       Today and the categories at once - ticking a note does - redraws the
       board once, not once for each. See emit() in js/store.js. */
    const redraw = () => { renderBoard(); renderIndex(); };
    Store.on('lists', renderIndex);
    Store.on('board', redraw);
    Store.on('today', redraw);
    Store.on('*', redraw);

    document.getElementById('btn-add-list').onclick = e => {
      const l = Store.addList('New category');
      const rect = e.target.getBoundingClientRect();
      UI.rename(rect, l.name, v => Store.mutate(() => { l.name = v || 'Untitled'; }, ['lists']), 'Name your category');
    };

    renderIndex();
    renderBoard();
  }

  return { init, renderIndex, renderBoard, syncGrabline, tryOpen, reveal };
})();
