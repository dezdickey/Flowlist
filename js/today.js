/* ============================================================
   Flowlist — Do Today
   A dock that holds references to notes living in the categories.
   Two modes: a plain ordered list, or an hour timeline running
   7 AM → midnight with a rule across each hour.
   ============================================================ */
const Today = (function () {
  const dock = document.getElementById('panel-today');
  const bodyEl = document.getElementById('today-body');
  const dateEl = document.getElementById('today-date');
  const countEl = document.getElementById('today-count');
  const modeBtn = document.getElementById('btn-today-mode');
  const addBtn = document.getElementById('btn-today-add');

  let editingId = null;   // a note being written straight into the dock
  let editingOld = false; // ...or an unnamed one already there, being given a name

  /* Which rows have their longer description open. Kept here, not on the
     note: opening one in Do Today is a way of looking, and should neither
     open the same note on the board nor travel to the other device. */
  const openDetails = new Set();

  function render() {
    const s = Store.get();
    const timeline = s.settings.todayTimeline;
    dock.classList.toggle('wide', timeline);
    modeBtn.classList.toggle('on', timeline);

    dateEl.textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

    const entries = s.today.map(t => {
      const list = Store.listById(t.listId);
      const item = Store.itemById(t.listId, t.itemId);
      return (list && item) ? { list, item } : null;
    }).filter(Boolean);

    const done = entries.filter(e => e.item.done).length;
    countEl.textContent = entries.length
      ? done + ' / ' + entries.length + ' done'
      : 'Nothing scheduled';

    bodyEl.innerHTML = '';

    if (!entries.length) {
      const d = document.createElement('div');
      d.className = 'today-empty';
      d.innerHTML = 'Drag notes in from any column,<br>or right-click a note &rarr; <b>Send to Do Today</b>.';
      bodyEl.appendChild(d);
    } else if (timeline) {
      renderTimeline(entries);
    } else {
      entries.forEach(e => bodyEl.appendChild(itemEl(e.list, e.item)));
    }
    renderTomorrow(timeline);
    renderLater(timeline);

    /* The dock itself. As a plain list it is the whole order. On the
       timeline, its own items are the ones with no time — so a note let go
       down there has its time taken off, and goes where it was put. It
       used to do nothing at all on the timeline, and the note sprang back. */
    DND.zone(bodyEl, {
      kind: 'today', accepts: ['note'], axis: 'y',
      onDrop: (payload, index) => {
        if (timeline) { placeAt(payload, null, index); return; }
        const added = Store.addToToday(payload.listId, payload.itemId, index);
        if (!added) Store.reorderToday(payload.listId, payload.itemId, index);
      }
    });

    // a note being written keeps the caret, through any re-render
    if (editingId) {
      const inp = bodyEl.querySelector('.ti-input');
      if (inp && document.activeElement !== inp) {
        inp.focus();
        inp.scrollIntoView({ block: 'nearest' });
      }
    }

    /* In timeline mode each hour is its own target, and dropping on it sets
       the time AND the order among that hour's notes. It only ever set the
       time, so dragging a note above another at the same hour changed
       nothing, and it went straight back where it was.

       The notes live in the slot, but the target is the whole row — see
       `hit` in js/dnd.js — so letting go over the hour's label counts. */
    if (timeline) {
      /* today's hours only — tomorrow's are for looking at, not dropping on */
      bodyEl.querySelectorAll(':scope > .hour-row > .hour-slot').forEach(slot => {
        const h = parseInt(slot.dataset.hour, 10);
        DND.zone(slot, {
          kind: 'today-hour', accepts: ['note'], axis: 'y',
          hit: slot.parentNode,
          onDrop: (payload, index) => placeAt(payload, h, index)
        });
      });
    }
  }

  /**
   * Give a note a time (or none) and a place among the notes that share it,
   * adding it to Do Today if it is not there yet — all in one change, so
   * the dock is drawn once, already right.
   *
   * Do Today is one ordered list underneath; the timeline only groups it by
   * hour. So "third under 9 AM" means: just before whatever is third under
   * 9 AM now, wherever that sits in the whole list. Everything else keeps
   * its place.
   *
   * @param {Object} payload  { listId, itemId }
   * @param {Number|null} hour
   * @param {Number} index    among the OTHER notes at that hour, as the drag
   *                          engine counts it — the one being moved is not
   *                          one of them
   */
  function placeAt(payload, hour, index) {
    const listId = payload.listId, itemId = payload.itemId;
    const item = Store.itemById(listId, itemId);
    if (!item) return;
    const hourOf = t => { const it = Store.itemById(t.listId, t.itemId); return it ? (it.hour || null) : undefined; };

    Store.mutate(s => {
      item.hour = hour;
      delete item.tomorrow;          // on Do Today now, so not tomorrow

      let from = s.today.findIndex(t => t.listId === listId && t.itemId === itemId);
      let entry;
      if (from === -1) { entry = { listId, itemId }; from = s.today.length; }
      else entry = s.today.splice(from, 1)[0];

      const peers = [];
      s.today.forEach((t, i) => { if (hourOf(t) === hour) peers.push(i); });

      let at;
      if (index < peers.length) at = peers[index];
      else if (peers.length) at = peers[peers.length - 1] + 1;
      else at = Math.min(from, s.today.length);
      s.today.splice(at, 0, entry);
    }, ['today', 'board']);
  }

  function renderTimeline(entries) {
    const rawHour = new Date().getHours();
    const nowHour = rawHour === 0 ? 24 : rawHour;   // the timeline calls midnight 24
    const scheduled = entries.filter(e => e.item.hour);
    const loose = entries.filter(e => !e.item.hour);

    UI.HOURS.forEach(h => {
      const here = scheduled.filter(e => e.item.hour === h);
      const row = document.createElement('div');
      row.className = 'hour-row' + (h === nowHour ? ' now' : '') + (here.length ? ' filled' : '');
      row.innerHTML = '<div class="hour-label">' + UI.hourLabel(h) + '</div>';
      const slot = document.createElement('div');
      slot.className = 'hour-slot';
      slot.dataset.hour = h;
      here.forEach(e => slot.appendChild(itemEl(e.list, e.item, true)));
      row.appendChild(slot);
      bodyEl.appendChild(row);
    });

    if (loose.length) {
      const h = document.createElement('div');
      h.className = 'unscheduled-head';
      h.textContent = 'No time set';
      bodyEl.appendChild(h);
      loose.forEach(e => bodyEl.appendChild(itemEl(e.list, e.item)));
    }
  }

  /* ============================================================
     WRITING ONE STRAIGHT IN

     Do Today holds references to notes that live in categories, so a note
     started here still needs a home: Uncategorized, the catch-all the app
     ships with. It goes on top of the list, in a box you can type into
     immediately — no column to open, nothing to drag.
     ============================================================ */
  function newNote() {
    const list = Store.inbox();
    const item = Store.addNote(list.id, 0, '');
    if (!item) return null;
    editingId = item.id;
    editingOld = false;
    Store.addToToday(list.id, item.id, 0);   // straight to the top, and it renders
    return item;
  }

  /** The row while it is being written. Nothing else on it is live yet. */
  function editRow(list, item) {
    const el = document.createElement('div');
    el.className = 'today-item is-editing';
    el.style.setProperty('--c', list.color);
    el.innerHTML = '<span class="ti-newdot"></span>';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'ti-input';
    inp.value = item.text || '';
    inp.placeholder = 'What needs doing?';
    inp.spellcheck = false;

    let settled = false;
    const finish = keep => {
      if (settled) return;
      settled = true;
      const text = inp.value.trim();
      const existing = editingOld;
      editingId = null;
      editingOld = false;
      if (!keep || !text) {
        /* a note that was already there stays, name or no name — only one
           started here and left empty was never really a note */
        if (existing) render();
        else Store.deleteNote(list.id, item.id);
        return;
      }
      Store.mutate(() => { item.text = text; }, ['today', 'board', 'lists']);
    };

    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));

    el.appendChild(inp);
    return el;
  }

  function itemEl(list, item, hideTime) {
    if (item.id === editingId) return editRow(list, item);

    /* Only a note with something in its longer description gets an arrow.
       An arrow that opens onto nothing is a small lie on every row. */
    const detail = String(item.detail || '').trim();
    const opened = !!detail && openDetails.has(item.id);

    const el = document.createElement('div');
    el.className = 'today-item' + (item.done ? ' done' : '') + (opened ? ' open' : '');
    el.dataset.dndItem = '1';
    el.dataset.listId = list.id;
    el.dataset.itemId = item.id;
    el.style.setProperty('--c', list.color);

    el.innerHTML =
      '<button class="note-check" title="Done"><svg viewBox="0 0 24 24"><path d="M4.5 12.5l5 5 10-11"/></svg></button>' +
      '<div class="ti-main">' +
        '<div class="ti-text">' + (UI.esc(item.text) || '<span class="dim">Untitled</span>') + '</div>' +
        '<div class="ti-src">' + UI.esc(list.name) + '</div>' +
        (detail ? '<div class="ti-detail">' + UI.esc(detail) + '</div>' : '') +
      '</div>' +
      (!hideTime && item.hour ? '<div class="ti-time">' + UI.hourLabel(item.hour) + '</div>' : '') +
      (detail
        ? '<button class="icon-btn sm ti-exp" title="Show the rest" aria-expanded="' + opened + '">' +
            UI.icon('chevR') + '</button>'
        : '') +
      '<button class="icon-btn sm ti-x" title="Remove from today">' + UI.icon('x') + '</button>';

    const exp = el.querySelector('.ti-exp');
    if (exp) {
      exp.onclick = e => {
        e.stopPropagation();          // opening the rest is not "take me to the note"
        const now = !el.classList.contains('open');
        el.classList.toggle('open', now);
        exp.setAttribute('aria-expanded', String(now));
        if (now) openDetails.add(item.id); else openDetails.delete(item.id);
      };
    }

    el.querySelector('.note-check').onclick = e => {
      e.stopPropagation();
      Store.setDone(list.id, item.id);
    };
    el.querySelector('.ti-x').onclick = e => {
      e.stopPropagation();
      Store.removeFromToday(list.id, item.id);
    };
    /* A click takes you to the note on the board. Not on a phone: there Do
       Today is a sheet over the board, and the first of two taps — the way
       a phone opens this row's menu — would shut the sheet and send the
       second tap to whatever lay underneath. "Reveal" in the menu does it
       there, deliberately. */
    let downAt = 0;
    el.addEventListener('pointerdown', () => { downAt = Date.now(); }, true);
    el.onclick = () => {
      if (Mobile.isPhone()) {
        /* One exception on a phone: a note with no name opens right here
           for one, in the same box a note written straight in uses. A
           hold is a pick-up, not a tap. */
        if (!String(item.text || '').trim() && Date.now() - downAt <= 350) {
          editingId = item.id;
          editingOld = true;
          render();                 // focuses the box, inside this tap
        }
        return;
      }
      Lists.reveal(list.id, item.id);
    };
    const todayMenu = e => {
      e.preventDefault(); e.stopPropagation();
      UI.menu(e.clientX, e.clientY, [
        { label: 'Rename', icon: 'pencil', onClick: () => {
            /* in the row itself, the same box a note written straight in uses;
               the board copy may not even be on screen */
            editingId = item.id;
            editingOld = true;
            render();
          } },
        { sep: true },
        { head: 'Time' },
        { html: '', mount: d => d.appendChild(UI.hourBlock(item.hour, h => Store.mutate(() => { item.hour = h; }, ['today', 'board']))) },
        { sep: true },
        { label: item.done ? 'Mark not done' : 'Mark done', icon: 'check',
          onClick: () => Store.setDone(list.id, item.id) },
        { label: 'Move to tomorrow', icon: 'calendar', onClick: () => Store.setTomorrow(list.id, item.id, true) },
        { label: 'Reveal in ' + list.name, icon: 'layers', onClick: () => Lists.reveal(list.id, item.id) },
        { sep: true },
        { label: 'Remove from today', icon: 'x', danger: true, onClick: () => Store.removeFromToday(list.id, item.id) }
      ]);
    };
    el.oncontextmenu = todayMenu;
    /* two taps stand in for the right button a phone does not have */
    DoubleTap.on(el, todayMenu);

    /* `from: 'today'` so the list columns can turn it away. This row is a
       reference to a note, not the note; letting it go over a column on
       the board used to MOVE the note into that column — out of its own
       list — which is easy to do by overshooting the dock by an inch. */
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      DND.start(e, { el, kind: 'note', payload: { listId: list.id, itemId: item.id, from: 'today' }, axis: 'y' });
    });

    return el;
  }

  /* ============================================================
     TOMORROW

     What has been put off to tomorrow waits folded at the bottom of the
     dock, under a line that says how many. Open, it lists them. On the
     timeline it carries on past midnight instead: a line for each hour of
     tomorrow that has something at it, and one more at the end, Unset,
     for the ones with no time.

     Open or folded is one choice for both ways of looking at the dock,
     and this device remembers it. It is not the board, so it never syncs.
     ============================================================ */
  const OPEN_KEY = () => Profiles.key('tomorrowOpen.v1');
  let tomorrowOpen = (() => { try { return localStorage.getItem(OPEN_KEY()) === '1'; } catch (e) { return false; } })();

  function setTomorrowOpen(v) {
    tomorrowOpen = !!v;
    try { localStorage.setItem(OPEN_KEY(), tomorrowOpen ? '1' : '0'); } catch (e) { /* only this session, then */ }
  }

  function renderTomorrow(timeline) {
    const items = Store.tomorrowItems();
    if (!items.length) return;

    const box = document.createElement('div');
    box.className = 'tomorrow' + (tomorrowOpen ? ' open' : '');
    /* anything dragged to the end of today goes above this, not under it */
    box.dataset.dndTail = '1';

    const head = document.createElement('button');
    head.className = 'tomorrow-head';
    head.setAttribute('aria-expanded', String(tomorrowOpen));
    head.title = tomorrowOpen ? 'Fold tomorrow away' : 'Show what is on for tomorrow';
    head.innerHTML = UI.icon('calendar', 'tm-ic') + '<span class="tm-title">Tomorrow</span>' +
      '<span class="tm-count">' + items.length + '</span>' + UI.icon('chevR', 'tm-chev');
    head.onclick = () => {
      setTomorrowOpen(!tomorrowOpen);
      render();
      const now = bodyEl.querySelector('.tomorrow');
      if (tomorrowOpen && now && now.scrollIntoView) now.scrollIntoView({ block: 'nearest' });
    };
    box.appendChild(head);

    if (tomorrowOpen) {
      const body = document.createElement('div');
      body.className = 'tomorrow-body';
      if (timeline) {
        const line = (label, rows) => {
          const row = document.createElement('div');
          row.className = 'hour-row filled tm-hour';
          row.innerHTML = '<div class="hour-label">' + label + '</div>';
          const slot = document.createElement('div');
          slot.className = 'hour-slot';
          rows.forEach(e => slot.appendChild(tomorrowRow(e.list, e.item, true)));
          row.appendChild(slot);
          body.appendChild(row);
        };
        const hours = [];
        items.forEach(e => { if (e.item.hour && hours.indexOf(e.item.hour) === -1) hours.push(e.item.hour); });
        hours.sort((a, b) => a - b).forEach(h => line(UI.hourLabel(h), items.filter(e => e.item.hour === h)));
        const unset = items.filter(e => !e.item.hour);
        if (unset.length) line('Unset', unset);
      } else {
        items.forEach(e => body.appendChild(tomorrowRow(e.list, e.item)));
      }
      box.appendChild(body);
    }
    bodyEl.appendChild(box);

    /* Let go of a note over Tomorrow and that is where it goes. Without its
       own target the dock underneath took the drop, and a note dropped on
       the word Tomorrow went on today. */
    DND.zone(box, {
      kind: 'tomorrow', accepts: ['note'], noPlaceholder: true,
      onDrop: payload => Store.setTomorrow(payload.listId, payload.itemId, true)
    });
  }

  /* ============================================================
     LATER

     Under Tomorrow, everything put off further out, a fold for each day,
     soonest first. Inside a day its notes go by the hour they are set for,
     with Unset at the end for the ones with no time — the same shape as
     Tomorrow, so scrolling down the dock reads as one timeline: today,
     then tomorrow, then each day after it in turn.

     Which days are open is this device's business and does not sync. The
     set is kept by date, so a day that goes by takes its entry with it
     rather than leaving the fold state of a day that no longer exists.
     ============================================================ */
  const LATER_KEY = () => Profiles.key('laterOpen.v1');
  let laterOpen = (() => {
    try { return new Set(JSON.parse(localStorage.getItem(LATER_KEY()) || '[]')); }
    catch (e) { return new Set(); }
  })();

  function setLaterOpen(day, on) {
    if (on) laterOpen.add(day); else laterOpen.delete(day);
    try { localStorage.setItem(LATER_KEY(), JSON.stringify([].slice.call(laterOpen))); } catch (e) { /* this session, then */ }
  }

  /** "Sat 4 Oct", and "in 9 days" beside it, because a date alone is work to read. */
  function dayLabel(key) {
    const p = key.split('-');
    const d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function daysOff(key) {
    const p = key.split('-');
    const then = new Date(+p[0], +p[1] - 1, +p[2]);
    const now = new Date();
    const days = Math.round((then - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    return days === 2 ? 'in 2 days' : 'in ' + days + ' days';
  }

  function renderLater(timeline) {
    const days = Store.laterItems();
    if (!days.length) return;

    days.forEach(({ day, items }) => {
      const open = laterOpen.has(day);
      const box = document.createElement('div');
      box.className = 'tomorrow later' + (open ? ' open' : '');
      box.dataset.dndTail = '1';
      box.dataset.day = day;

      const head = document.createElement('button');
      head.className = 'tomorrow-head';
      head.setAttribute('aria-expanded', String(open));
      head.title = open ? 'Fold this day away' : 'Show what is on for this day';
      head.innerHTML = UI.icon('calendar', 'tm-ic') +
        '<span class="tm-title">' + UI.esc(dayLabel(day)) + '</span>' +
        '<span class="tm-when">' + UI.esc(daysOff(day)) + '</span>' +
        '<span class="tm-count">' + items.length + '</span>' + UI.icon('chevR', 'tm-chev');
      head.onclick = () => {
        setLaterOpen(day, !open);
        render();
        const now = bodyEl.querySelector('.later[data-day="' + day + '"]');
        if (!open && now && now.scrollIntoView) now.scrollIntoView({ block: 'nearest' });
      };
      box.appendChild(head);

      if (open) {
        const body = document.createElement('div');
        body.className = 'tomorrow-body';
        if (timeline) {
          const line = (label, rows) => {
            const row = document.createElement('div');
            row.className = 'hour-row filled tm-hour';
            row.innerHTML = '<div class="hour-label">' + UI.esc(label) + '</div>';
            const slot = document.createElement('div');
            slot.className = 'hour-slot';
            rows.forEach(e => slot.appendChild(tomorrowRow(e.list, e.item, true, day)));
            row.appendChild(slot);
            body.appendChild(row);
          };
          const hours = [];
          items.forEach(e => { if (e.item.hour && hours.indexOf(e.item.hour) === -1) hours.push(e.item.hour); });
          hours.sort((a, b) => a - b).forEach(h => line(UI.hourLabel(h), items.filter(e => e.item.hour === h)));
          const unset = items.filter(e => !e.item.hour);
          if (unset.length) line('Unset', unset);
        } else {
          items.forEach(e => body.appendChild(tomorrowRow(e.list, e.item, false, day)));
        }
        box.appendChild(body);
      }
      bodyEl.appendChild(box);

      /* let go of a note over a day and it is put off to that day */
      DND.zone(box, {
        kind: 'later', accepts: ['note'], noPlaceholder: true,
        onDrop: payload => Store.setDay(payload.listId, payload.itemId, day)
      });
    });
  }

  /** A note waiting for tomorrow, or for a day further out. Looked at, ticked, or given a time — not dragged. */
  function tomorrowRow(list, item, hideTime, day) {
    const el = document.createElement('div');
    el.className = 'today-item tm-item' + (item.done ? ' done' : '');
    el.dataset.listId = list.id;
    el.dataset.itemId = item.id;
    el.style.setProperty('--c', list.color);
    el.innerHTML =
      '<button class="note-check" title="Done"><svg viewBox="0 0 24 24"><path d="M4.5 12.5l5 5 10-11"/></svg></button>' +
      '<div class="ti-main">' +
        '<div class="ti-text">' + (UI.esc(item.text) || '<span class="dim">Untitled</span>') + '</div>' +
        '<div class="ti-src">' + UI.esc(list.name) + '</div>' +
      '</div>' +
      (!hideTime && item.hour ? '<div class="ti-time">' + UI.hourLabel(item.hour) + '</div>' : '') +
      '<button class="icon-btn sm ti-x" title="' + (day ? 'Not this day after all' : 'Not tomorrow after all') + '">' + UI.icon('x') + '</button>';

    el.querySelector('.note-check').onclick = e => { e.stopPropagation(); Store.setDone(list.id, item.id); };
    el.querySelector('.ti-x').onclick = e => { e.stopPropagation(); Store.setDay(list.id, item.id, null); };
    el.onclick = () => { if (!Mobile.isPhone()) Lists.reveal(list.id, item.id); };

    const menu = e => {
      e.preventDefault(); e.stopPropagation();
      UI.menu(e.clientX, e.clientY, [
        { head: day ? 'Time on ' + dayLabel(day) : 'Time tomorrow' },
        { html: '', mount: d => d.appendChild(UI.hourBlock(item.hour, h => Store.mutate(() => { item.hour = h; }, ['today', 'board']))) },
        { sep: true },
        { label: 'Do it today instead', icon: 'today', onClick: () => Store.addToToday(list.id, item.id) },
        { label: 'A different day…', icon: 'calendar', onClick: ev => When.pick(ev, list.id, item.id) },
        { label: item.done ? 'Mark not done' : 'Mark done', icon: 'check', onClick: () => Store.setDone(list.id, item.id) },
        { label: 'Reveal in ' + list.name, icon: 'layers', onClick: () => Lists.reveal(list.id, item.id) },
        { sep: true },
        { label: day ? 'Not this day after all' : 'Not tomorrow after all', icon: 'x', danger: true,
          onClick: () => Store.setDay(list.id, item.id, null) }
      ]);
    };
    el.oncontextmenu = menu;
    DoubleTap.on(el, menu);
    return el;
  }

  /* When the day turns, tomorrow's notes become today's. Checked every half
     minute and whenever the app comes back into view: a phone asleep at
     midnight runs no timers, so the check has to happen when it wakes. */
  let lastDay = null;
  function tick() {
    const moved = Store.rollTomorrow();
    const day = Store.dayKey();
    /* nothing moved, but it is a new day: the date at the top has to change */
    if (!moved && lastDay && day !== lastDay) { render(); Store.emit(['board']); }
    lastDay = day;
    return moved;
  }

  function init() {
    Store.on('today', render);
    Store.on('*', render);

    /* after everything else has started — sync included, so what moves is sent */
    setTimeout(tick, 0);
    setInterval(tick, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    window.addEventListener('focus', tick);

    addBtn.onclick = () => newNote();
    modeBtn.onclick = () => Store.mutate(s => { s.settings.todayTimeline = !s.settings.todayTimeline; }, ['today', 'settings']);

    document.getElementById('btn-today-clear').onclick = () => {
      Store.mutate(s => {
        s.today = s.today.filter(t => {
          const it = Store.itemById(t.listId, t.itemId);
          return it && !it.done;
        });
      }, ['today', 'board']);
    };

    render();
  }

  return { init, render, newNote, tick, isTomorrowOpen: () => tomorrowOpen };
})();
