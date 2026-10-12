/* ============================================================
   Flowlist — the calendar

   A month at a time, built on what the board already knew rather than on
   a second set of dates beside it.

   A note has always carried `tomorrow`: not a flag but the day it is for,
   so a device shut at midnight still knows what is due when it opens. The
   calendar only widens that — it sets the same field to days further out.
   Everything that already worked keeps working: `rollTomorrow` brings a
   note onto Do Today when its day arrives, sync carries the field, and
   the merge joins the two devices as before.

   So the three parts of the grid are three different truths, and none of
   them is invented here:

     days to come   notes spoken for, by `tomorrow`
     today          the Do Today pile, which is what today means already
     days gone by   what was ticked off, from the Completed box

   A note loses its day when that day arrives, which is why the past is
   read from what was finished rather than from what was planned: the plan
   is gone by then, and only the doing is still on record.

   Nothing here reaches the network. The calendar is the board seen down a
   different axis, and it is all on this device.
   ============================================================ */
const Calendar = (function () {
  const wrap = document.getElementById('calendar-wrap');
  const gridEl = document.getElementById('cal-grid');
  const titleEl = document.getElementById('cal-title');
  const dayEl = document.getElementById('cal-day');

  /* The first of the month on show, and the day whose detail is open.
     Both are view state: which month you were looking at is not worth
     syncing to the other device, and a day left open here should not open
     there. */
  let cursor = null;
  let picked = null;
  /* the note open for editing in the day panel, if any:
     { listId, itemId, fresh } - fresh means it was made by Add and has no
     words in it yet, so leaving it alone throws it away rather than
     littering the inbox with blank notes */
  let editing = null;

  /* How many notes a cell shows before it gives up and counts the rest.
     Six rows of cells have to fit a screen, so a busy day is summarised
     rather than allowed to push the grid out of shape. */
  const CHIPS = 3;

  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ---------- days ---------- */

  const keyOf = d => Store.dayKey(d);
  const dateOf = key => { const p = key.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const firstOfMonth = d => new Date(d.getFullYear(), d.getMonth(), 1);
  const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  /**
   * The six weeks a month grid draws. Always six, never five or seven, so
   * the grid does not change height as you page through the year — a grid
   * that resizes under the pointer makes every click a guess.
   */
  function gridDays(month) {
    const start = addDays(firstOfMonth(month), -firstOfMonth(month).getDay());
    const out = [];
    for (let i = 0; i < 42; i++) out.push(addDays(start, i));
    return out;
  }

  /* ---------- drawing ---------- */

  function chip(entry, kind) {
    const el = document.createElement('div');
    el.className = 'cal-chip' + (kind ? ' ' + kind : '');
    el.style.setProperty('--c', entry.list.color);
    if (entry.item.hour !== null && entry.item.hour !== undefined) {
      const t = document.createElement('b');
      t.className = 'cal-at';
      t.textContent = hourLabel(entry.item.hour);
      el.appendChild(t);
    }
    const txt = document.createElement('span');
    txt.textContent = entry.item.text || 'Untitled';
    el.appendChild(txt);
    el.title = entry.item.text || 'Untitled';
    return el;
  }

  const hourLabel = h => {
    if (h === 0) return '12a';
    if (h === 12) return '12p';
    return (h > 12 ? h - 12 : h) + (h >= 12 ? 'p' : 'a');
  };

  function render() {
    if (!wrap || Store.get().view !== 'calendar') return;
    if (!cursor) cursor = firstOfMonth(new Date());

    const today = keyOf(new Date());
    const days = gridDays(cursor);
    const from = keyOf(days[0]);
    const to = keyOf(days[41]);
    const plan = Store.scheduled(from, to);
    const done = Store.doneBetween(from, to);
    const todayPile = Store.get().today
      .map(t => ({ list: Store.listById(t.listId), item: Store.itemById(t.listId, t.itemId) }))
      .filter(e => e.list && e.item && !e.item.done);

    titleEl.textContent = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    gridEl.textContent = '';
    DOW.forEach(d => {
      const h = document.createElement('div');
      h.className = 'cal-dow';
      h.textContent = d;
      gridEl.appendChild(h);
    });

    days.forEach(d => {
      const key = keyOf(d);
      const cell = document.createElement('div');
      const past = key < today;
      cell.className = 'cal-cell' +
        (d.getMonth() === cursor.getMonth() ? '' : ' away') +
        (key === today ? ' today' : '') +
        (past ? ' past' : '') +
        (key === picked ? ' picked' : '');
      cell.dataset.day = key;

      const n = document.createElement('div');
      n.className = 'cal-n';
      n.textContent = d.getDate();
      cell.appendChild(n);

      const body = document.createElement('div');
      body.className = 'cal-cell-body';
      cell.appendChild(body);

      /* today is the Do Today pile; other days are what they hold */
      const entries = key === today ? todayPile : (plan[key] || []);
      const finished = past ? (done[key] || []) : [];
      const all = entries.concat(finished);

      all.slice(0, CHIPS).forEach(e => body.appendChild(chip(e, e.item.done ? 'done' : '')));
      if (all.length > CHIPS) {
        const more = document.createElement('div');
        more.className = 'cal-more';
        more.textContent = '+' + (all.length - CHIPS) + ' more';
        body.appendChild(more);
      }

      /* A day to come can be dropped on; a day gone by cannot, because
         there is no such thing as scheduling Tuesday last week. Today
         takes a drop too - it means the same as dropping on Do Today. */
      if (!past) {
        DND.zone(cell, {
          kind: 'cal-day', accepts: ['note'], axis: 'y',
          onDrop: payload => put(payload, key, today)
        });
      }

      cell.addEventListener('click', () => pick(key));
      /* Right-click a day to put something on it. A day gone by is a record
         of what was done and nothing can be added to it. */
      cell.addEventListener('contextmenu', ev => {
        ev.preventDefault(); ev.stopPropagation();
        dayMenu(ev, key, past);
      });
      gridEl.appendChild(cell);
    });

    renderDay(today, plan, done, todayPile);
  }

  /**
   * Dropping a note on a day. Today is not a date to this app - it is the
   * Do Today pile - so a note dropped on today joins the pile, and one
   * dropped further out is given the day and taken off the pile until it
   * comes round.
   */
  function put(payload, key, today) {
    if (key === today) {
      Store.setDay(payload.listId, payload.itemId, null);
      Store.addToToday(payload.listId, payload.itemId);
      UI.toast('On Do Today.');
      return;
    }
    Store.setDay(payload.listId, payload.itemId, key);
    UI.toast('Put off to ' + dateOf(key).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) + '.');
  }

  /* ---------- putting something on a day ----------
     A new note has to live in a category, and the one for something you
     have only just thought of is the inbox - the same place a note typed
     into Do Today goes. It opens for editing straight away in the panel
     beside the month, because a note with no words in it is not yet
     anything. */
  function add(key, ev) {
    /* The menu does not offer this on a day gone by, but the guard belongs
       here as well: a past day is a record of what was done, and nothing
       can be put on it after the fact. */
    if (key < keyOf(new Date())) { UI.toast('That day has gone.'); return; }
    const box = Store.inbox();
    if (!box) return;
    const note = Store.addNote(box.id, 0, '');
    if (!note) return;
    if (key === keyOf(new Date())) Store.addToToday(box.id, note.id);
    else Store.setDay(box.id, note.id, key);
    picked = key;
    editing = { listId: box.id, itemId: note.id, fresh: true };
    render();
    /* Written where it was asked for. The panel beside the month is hidden
       whenever Do Today is up, which is most of the time, so an editor that
       only ever appeared there would look like nothing had happened. */
    if (ev) { openEditor(ev, box.id, note.id, key, true); return; }
    const inp = dayEl && dayEl.querySelector('.cal-edit-text');
    if (inp) inp.focus();
  }

  /* ---------- the day's own menu ----------
     Everything on a day, right there: pick one to write in, or start a new
     one. The month is the only part of the calendar guaranteed to be on
     screen, so this is where a day is worked on. */
  function dayMenu(ev, key, past) {
    const today = keyOf(new Date());
    const title = dateOf(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const here = key === today ? todayPile() : (Store.scheduled(key, key)[key] || []);
    const finished = past ? (Store.doneBetween(key, key)[key] || []) : [];

    const items = [{ head: title }];

    /* Grouped by the category each note lives in, rather than run together
       in one list: on a busy day the question is usually "what have I got
       on for work" rather than "what have I got on", and a flat list makes
       that something you have to work out for yourself.

       What was added straight onto the day goes first. Those land in the
       inbox (see add()), so they are the ones with no category of their
       own yet - which is exactly why they want to be at the top, where
       they can be read and filed rather than lost among the rest. */
    byGroup(here).forEach(g => {
      items.push({ head: g.head });
      g.rows.forEach(e => items.push({
        label: short(e.item) + (e.item.hour === null || e.item.hour === undefined ? '' : '   ' + hourLabel(e.item.hour)),
        icon: 'pencil',
        onClick: at => openEditor(at || ev, e.list.id, e.item.id, key)
      }));
    });

    /* A day gone by can be read and not written to. What was ticked off is
       grouped the same way, by the category it was ticked off in - the
       Completed box keeps that on each copy (`item.from`), so the record
       reads like the day did rather than as one undifferentiated heap. */
    if (finished.length) {
      items.push({ head: 'Done that day' });
      byGroup(finished).forEach(g => {
        if (g.head !== DONE_GROUP) items.push({ head: g.head });
        g.rows.forEach(e => items.push({ label: short(e.item), icon: 'check' }));
      });
    }

    if (here.length || finished.length) items.push({ sep: true });
    if (!past) items.push({ label: 'Add something for this day', icon: 'plus', onClick: at => add(key, at || ev) });
    items.push({ label: 'Show this day beside the month', icon: 'chevR',
                 onClick: () => { dropIfBlank(); editing = null; picked = key; render(); } });

    UI.menu(ev.clientX, ev.clientY, items);
  }

  const short = item => {
    const t = (item.text || '').trim() || 'Untitled';
    return t.length > 34 ? t.slice(0, 33) + '…' : t;
  };

  /* What a finished note is headed under when its own category is gone or
     was never recorded — the Completed box itself is not a useful heading. */
  const DONE_GROUP = 'Ticked off';

  /**
   * Sort a day's notes into groups, one per category, in the order the
   * categories sit on the board — with whatever was added straight onto
   * the day first.
   *
   * A finished note is a copy living in the Completed box, so its own
   * category is read from `item.from`, which that copy keeps for exactly
   * this reason (see setDone in js/store.js).
   *
   * @returns {Array} [{ head, rows: [{ list, item }] }]
   */
  function byGroup(entries) {
    const box = Store.inbox();
    const inboxId = box ? box.id : null;
    const order = Store.get().lists.map(l => l.id);

    const groups = [];
    const at = {};
    entries.forEach(e => {
      const from = e.item.done && e.item.from ? e.item.from : null;
      const id = from ? from.listId : e.list.id;
      const name = from ? from.name : e.list.name;
      const key = id || name || DONE_GROUP;
      if (!at[key]) {
        at[key] = { head: name || DONE_GROUP, id: id, rows: [] };
        groups.push(at[key]);
      }
      at[key].rows.push(e);
    });

    /* the inbox first, then board order, then anything whose category has
       since been deleted - it still has a name on it and is worth showing */
    return groups.sort((a, b) => {
      if (a.id === inboxId && a.id) return -1;
      if (b.id === inboxId && b.id) return 1;
      const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }

  /** Do Today's pile, which is what today holds instead of a date. */
  function todayPile() {
    return Store.get().today
      .map(t => ({ list: Store.listById(t.listId), item: Store.itemById(t.listId, t.itemId) }))
      .filter(e => e.list && e.item && !e.item.done);
  }

  /** The editor, in a menu of its own, over the day it belongs to. */
  function openEditor(ev, listId, itemId, key, fresh) {
    const list = Store.listById(listId);
    const item = Store.itemById(listId, itemId);
    if (!list || !item) return;
    if (fresh) editing = { listId, itemId, fresh: true };
    UI.menu((ev && ev.clientX) || 160, (ev && ev.clientY) || 160, [
      { head: dateOf(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) },
      { mount: box => {
          box.className = 'cal-menu-edit';
          box.appendChild(editor({ list, item }, key, { inMenu: true }));
          setTimeout(() => {
            const inp = box.querySelector('.cal-edit-text');
            if (!inp) return;
            try {
              inp.focus();
              /* A new note is empty, so selecting costs nothing. One that
                 already has a name must NOT be selected: you opened it to
                 change the details, and the first key would have wiped the
                 title instead. Caret to the end. */
              if (fresh) inp.select();
              else inp.setSelectionRange(inp.value.length, inp.value.length);
            } catch (e) { /* never mind */ }
          }, 0);

          /* Clicking away from a brand new note is a way of saying you did
             not want it, so it is not left blank in the inbox. Watched
             rather than hooked to a button, because the menu can be closed
             by Escape, by a click outside or by another menu opening. */
          if (!fresh || typeof MutationObserver === 'undefined') return;
          const ctx = document.getElementById('ctx');
          if (!ctx) return;
          const obs = new MutationObserver(() => {
            if (ctx.classList.contains('show') && ctx.contains(box)) return;
            obs.disconnect();
            dropIfBlank();
          });
          obs.observe(ctx, { attributes: true, childList: true, attributeFilter: ['class'] });
        } }
    ]);
  }

  /* ---------- the day beside the month ---------- */

  function renderDay(today, plan, done, todayPile) {
    if (!dayEl) return;
    const key = picked || today;
    const d = dateOf(key);
    const past = key < today;
    const entries = key === today ? todayPile : (plan[key] || []);
    const finished = past ? (done[key] || []) : [];

    dayEl.textContent = '';

    const head = document.createElement('div');
    head.className = 'cal-day-head';
    const h = document.createElement('h3');
    h.textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    head.appendChild(h);
    const sub = document.createElement('span');
    sub.className = 'cal-day-sub';
    sub.textContent = key === today ? 'Today' : past ? 'Done that day' : 'Put off to this day';
    head.appendChild(sub);
    dayEl.appendChild(head);

    const body = document.createElement('div');
    body.className = 'cal-day-body';
    dayEl.appendChild(body);

    const rows = entries.concat(finished);
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'cal-empty';
      empty.textContent = past
        ? 'Nothing was ticked off on this day.'
        : 'Nothing here yet. Drag a note onto the day to put it off to then.';
      body.appendChild(empty);
      return;
    }

    rows.forEach(e => {
      if (editing && editing.listId === e.list.id && editing.itemId === e.item.id) {
        body.appendChild(editor(e, key));
        return;
      }
      const row = document.createElement('div');
      row.className = 'cal-row' + (e.item.done ? ' done' : '');
      row.style.setProperty('--c', e.list.color);
      if (!past && !e.item.done) {
        row.classList.add('can-edit');
        row.onclick = () => { editing = { listId: e.list.id, itemId: e.item.id }; render(); };
      }

      const txt = document.createElement('div');
      txt.className = 'cal-row-text';
      txt.textContent = e.item.text || 'Untitled';
      row.appendChild(txt);

      const where = document.createElement('div');
      where.className = 'cal-row-where';
      where.textContent = (e.item.from && e.item.from.name) || e.list.name;
      row.appendChild(where);

      /* only a day still to come can be given back - the past is a record,
         not a plan, and there is nothing there to undo */
      if (!past && !e.item.done && key !== today) {
        const off = document.createElement('button');
        off.className = 'cal-row-off txt-btn';
        off.textContent = 'Take off this day';
        off.onclick = ev => {
          ev.stopPropagation();
          Store.setDay(e.list.id, e.item.id, null);
        };
        row.appendChild(off);
      }
      body.appendChild(row);
    });
  }

  /* ---------- writing one down ----------
     What is typed is kept as it is typed. The writes are silent - the store
     still puts them on disk and queues them for the other device, but no
     redraw is announced, because rebuilding the panel under the caret would
     take the caret with it. Save is therefore not the thing that saves: it
     is the thing that says you have finished, and closes the editor. It is
     here because a box with no way out looks unfinished, and because it is
     the obvious place to look for reassurance. */
  function editor(e, key, opts) {
    const inMenu = !!(opts && opts.inMenu);
    const wrap = document.createElement('div');
    wrap.className = 'cal-edit';
    wrap.style.setProperty('--c', e.list.color);

    const text = document.createElement('input');
    text.type = 'text';
    text.className = 'cal-edit-text';
    text.placeholder = 'What is it?';
    text.value = e.item.text || '';
    wrap.appendChild(text);

    const detail = document.createElement('textarea');
    detail.className = 'cal-edit-detail';
    detail.placeholder = 'Anything else worth writing down';
    detail.rows = 4;
    detail.value = e.item.detail || '';
    wrap.appendChild(detail);

    const when = document.createElement('select');
    when.className = 'cal-edit-time';
    when.appendChild(new Option('No time', ''));
    for (let h = 0; h < 24; h++) when.appendChild(new Option(UI.hourLabel(h), String(h)));
    when.value = (e.item.hour === null || e.item.hour === undefined) ? '' : String(e.item.hour);
    wrap.appendChild(when);

    const keep = () => Store.mutate(() => {
      const it = Store.itemById(e.list.id, e.item.id);
      if (!it) return;
      it.text = text.value;
      it.detail = detail.value;
      it.hour = when.value === '' ? null : +when.value;
    }, null, { silent: true });
    text.oninput = keep;
    detail.oninput = keep;
    /* The time is worth seeing on the day at once. In the menu it must NOT
       redraw, though: rendering rebuilds the grid this menu is sitting over
       and the select would lose focus mid-choice. The month catches up when
       the menu closes. */
    when.onchange = () => { keep(); if (!inMenu) render(); };

    const bar = document.createElement('div');
    bar.className = 'cal-edit-bar';

    const save = document.createElement('button');
    save.className = 'btn-min';
    save.textContent = 'Save';
    save.onclick = () => {
      keep();
      editing = null;
      if (inMenu) UI.close();
      /* the silent writes are on disk already; this is what tells the rest
         of the app to catch up with them */
      Store.mutate(() => {}, ['board', 'today', 'calendar', 'lists']);
    };
    bar.appendChild(save);

    const del = document.createElement('button');
    del.className = 'btn-min danger';
    del.textContent = 'Delete';
    del.onclick = () => {
      editing = null;
      if (inMenu) UI.close();
      Store.deleteNote(e.list.id, e.item.id);
      UI.toast('Deleted. Ctrl+Z brings it back.');
    };
    bar.appendChild(del);

    const where = document.createElement('span');
    where.className = 'cal-edit-where';
    where.textContent = 'in ' + e.list.name;
    bar.appendChild(where);

    wrap.appendChild(bar);
    return wrap;
  }

  /**
   * A note made by Add and left with no words in it is thrown away rather
   * than left in the inbox, because it was never anything. One that was
   * given words is kept, whatever else happens.
   */
  function dropIfBlank() {
    if (!editing || !editing.fresh) return;
    const it = Store.itemById(editing.listId, editing.itemId);
    if (it && !(it.text || '').trim() && !(it.detail || '').trim()) {
      Store.deleteNote(editing.listId, editing.itemId);
    }
  }

  /* ---------- moving about ---------- */

  function pick(key) {
    dropIfBlank();
    editing = null;
    picked = picked === key ? null : key;
    render();
  }

  function go(n) {
    dropIfBlank();
    editing = null;
    cursor = addMonths(cursor || firstOfMonth(new Date()), n);
    picked = null;
    render();
  }

  function toToday() {
    dropIfBlank();
    editing = null;
    cursor = firstOfMonth(new Date());
    picked = null;
    render();
  }

  function init() {
    if (!wrap) return;
    const prev = document.getElementById('cal-prev');
    const next = document.getElementById('cal-next');
    const now = document.getElementById('cal-today');
    if (prev) prev.onclick = () => go(-1);
    if (next) next.onclick = () => go(1);
    if (now) now.onclick = toToday;

    /* Anything that can change what a day holds redraws it. `calendar` is
       the channel setDay announces on; the rest are the ways a note can
       change underneath the grid without the calendar being touched. */
    ['calendar', 'board', 'today', 'lists', 'view'].forEach(ch => Store.on(ch, render));
  }

  return {
    init, render, go, toToday, add,
    editing: () => editing,
    /* What a drop on a day does, without a pointer in the way - the grid
       hands it the same call. Kept out here so the rule about today being
       the pile rather than a date can be tested on its own. */
    drop: (payload, key) => put(payload, key, Store.dayKey(new Date())),
    /* for the tests, and for anything that wants to know where it is */
    month: () => cursor && Store.dayKey(cursor),
    picked: () => picked,
    pick
  };
})();
