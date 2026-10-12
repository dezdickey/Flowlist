/* the calendar: the day a note is for, the month grid, and the surface */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + got + ' want ' + want); }
function shown(id) { return getComputedStyle(document.getElementById(id)).display !== 'none'; }
function cells() { return document.querySelectorAll('#cal-grid .cal-cell'); }
function cellFor(key) { return document.querySelector('#cal-grid .cal-cell[data-day="' + key + '"]'); }
function dayPlus(n) {
  var d = new Date();
  return Store.dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}
/* a note to play with, from the first real category */
function anItem(i) {
  var lists = Store.get().lists.filter(function (l) { return l.id !== Store.COMPLETED_ID && (l.items || []).length; });
  var l = lists[0];
  return { listId: l.id, itemId: l.items[i || 0].id, list: l, item: l.items[i || 0] };
}

var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 60); }); };
setTimeout(async function () {
  try {
    var noAnim = document.createElement('style');
    noAnim.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
    document.head.appendChild(noAnim);

    Store.reset();

    /* ============================================================
       THE DAY A NOTE IS FOR
       `tomorrow` has always held a date rather than a flag. The calendar
       widens it to any day instead of inventing a second field.
       ============================================================ */
    var a = anItem(0);
    eq('a fresh note is not spoken for', Store.dayOf(a.item), null);

    var far = dayPlus(12);
    ok('it can be put on a day a fortnight out', Store.setDay(a.listId, a.itemId, far));
    eq('...and it remembers which day', Store.dayOf(a.item), far);
    ok('...setting the same day again changes nothing', !Store.setDay(a.listId, a.itemId, far));

    Store.addToToday(a.listId, a.itemId);
    ok('putting it on Do Today takes the day off it', Store.dayOf(a.item) === null, Store.dayOf(a.item));
    ok('...and it is on Do Today', Store.inToday(a.listId, a.itemId));

    Store.setDay(a.listId, a.itemId, far);
    ok('giving it a day takes it off Do Today', !Store.inToday(a.listId, a.itemId));

    ok('and the day can be taken off again', Store.setDay(a.listId, a.itemId, null));
    eq('...leaving it spoken for by nothing', Store.dayOf(a.item), null);

    /* the old way in is untouched, because it is the same field */
    Store.setTomorrow(a.listId, a.itemId, true);
    eq('put off to tomorrow still means tomorrow', Store.dayOf(a.item), dayPlus(1));
    Store.setTomorrow(a.listId, a.itemId, false);
    eq('...and taking that back clears it', Store.dayOf(a.item), null);

    /* ============================================================
       TOMORROW IS TOMORROW, NOT "LATER"
       Once a note can be put off a fortnight, calling the whole future
       "Tomorrow" in the dock would be untrue.
       ============================================================ */
    var b = anItem(1);
    Store.setDay(a.listId, a.itemId, dayPlus(1));
    Store.setDay(b.listId, b.itemId, dayPlus(9));
    var tm = Store.tomorrowItems(Date.now());
    eq('Do Today counts only what is actually for tomorrow', tm.length, 1);
    eq('...and it is the right note', tm[0].item.id, a.itemId);
    ok('...the one further out is still spoken for', Store.dayOf(b.item) === dayPlus(9));

    /* ============================================================
       A MONTH IN ONE PASS
       ============================================================ */
    var by = Store.scheduled(dayPlus(0), dayPlus(30));
    ok('both show up in the month', (by[dayPlus(1)] || []).length === 1 && (by[dayPlus(9)] || []).length === 1);
    ok('a day nothing falls on is absent, not empty', by[dayPlus(5)] === undefined);
    var narrow = Store.scheduled(dayPlus(0), dayPlus(3));
    ok('...and a range only reaches as far as it says', narrow[dayPlus(9)] === undefined);

    /* two on one day come back earliest first */
    var c = anItem(2);
    Store.setDay(c.listId, c.itemId, dayPlus(1));
    c.item.hour = 9; a.item.hour = 15;
    var pair = Store.scheduled(dayPlus(1), dayPlus(1))[dayPlus(1)];
    eq('two on a day come back in time order', pair[0].item.id, c.itemId);
    a.item.hour = null; c.item.hour = null;

    /* ============================================================
       THE SURFACE
       ============================================================ */
    var btn = document.getElementById('btn-view-calendar');
    ok('there is a Calendar button on the rail', !!btn);
    eq('...labelled Calendar', btn.querySelector('span').textContent, 'Calendar');

    btn.click();
    eq('pressing it opens the calendar', Store.get().view, 'calendar');
    ok('...the calendar takes the middle', shown('calendar-wrap'));
    ok('...and the board is put away', !shown('board-wrap'));
    ok('...the button says it is the live view', btn.classList.contains('view-on'));
    ok('...and the Board button no longer does',
       !document.getElementById('btn-view-board').classList.contains('view-on'));

    btn.click();
    eq('pressing it again goes back to the board', Store.get().view, 'board');
    btn.click();

    /* the calendar keeps its own panel layout, or opening one here would
       quietly rearrange the board's */
    ok('the calendar has a panel set of its own', !!Store.settings().panels.calendar);
    ok('...with Do Today up, since that is what you drag from',
       Store.settings().panels.calendar.today === true);

    /* ============================================================
       THE GRID
       ============================================================ */
    eq('a week has seven headings', document.querySelectorAll('#cal-grid .cal-dow').length, 7);
    eq('...and the month is always six weeks of cells', cells().length, 42);

    var today = Store.dayKey(new Date());
    var todayCell = cellFor(today);
    ok('today is in the grid and marked', !!todayCell && todayCell.classList.contains('today'));
    ok('yesterday is marked as gone by', cellFor(dayPlus(-1)).classList.contains('past'));
    ok('...and tomorrow is not', !cellFor(dayPlus(1)).classList.contains('past'));

    var tcell = cellFor(dayPlus(1));
    ok('a note put off to a day shows on that day', tcell.querySelectorAll('.cal-chip').length >= 1);
    ok('...and a day with nothing on it shows nothing',
       cellFor(dayPlus(5)).querySelectorAll('.cal-chip').length === 0);

    /* a busy day counts the rest rather than growing */
    var busy = dayPlus(2);
    var lists = Store.get().lists.filter(function (l) { return l.id !== Store.COMPLETED_ID; });
    var put = 0;
    lists.forEach(function (l) {
      (l.items || []).forEach(function (it) {
        if (put < 6) { Store.setDay(l.id, it.id, busy); put++; }
      });
    });
    var bcell = cellFor(busy);
    ok('a busy day shows a few and counts the rest',
       bcell.querySelectorAll('.cal-chip').length === 3 && !!bcell.querySelector('.cal-more'),
       bcell.querySelectorAll('.cal-chip').length);
    ok('...saying how many more', /^\+\d+ more$/.test(bcell.querySelector('.cal-more').textContent),
       bcell.querySelector('.cal-more').textContent);

    /* ============================================================
       MOVING ABOUT
       ============================================================ */
    var was = Calendar.month();
    var title = document.getElementById('cal-title').textContent;
    Calendar.go(1);
    ok('the next month is a different month', Calendar.month() !== was, Calendar.month());
    ok('...and the title says so', document.getElementById('cal-title').textContent !== title);
    Calendar.go(-1);
    eq('...and back again', Calendar.month(), was);

    Calendar.go(3);
    document.getElementById('cal-today').click();
    eq('the Today button comes home', Calendar.month(), was);

    /* ============================================================
       DROPPING A NOTE ON A DAY
       Today is the Do Today pile, not a date - so a note dropped on today
       joins the pile, and one dropped further out is put off to then.
       ============================================================ */
    var d = anItem(0);
    Store.setDay(d.listId, d.itemId, null);
    Calendar.drop({ listId: d.listId, itemId: d.itemId }, dayPlus(4));
    eq('dropped on a day to come, it is put off to then', Store.dayOf(d.item), dayPlus(4));
    ok('...and is not on Do Today', !Store.inToday(d.listId, d.itemId));

    Calendar.drop({ listId: d.listId, itemId: d.itemId }, today);
    ok('dropped on today, it joins the pile', Store.inToday(d.listId, d.itemId));
    eq('...and carries no day, because today is not a date here', Store.dayOf(d.item), null);

    /* ============================================================
       THE DAY BESIDE THE MONTH
       ============================================================ */
    Calendar.pick(dayPlus(4));
    eq('picking a day opens it', Calendar.picked(), dayPlus(4));
    ok('...and the cell says it is picked', cellFor(dayPlus(4)).classList.contains('picked'));
    Calendar.pick(dayPlus(4));
    eq('...and picking it again closes it', Calendar.picked(), null);

    /* ============================================================
       DAYS GONE BY ARE WHAT WAS DONE
       A note loses its day when the day arrives, so the past can only
       honestly be read from what was ticked off.
       ============================================================ */
    var e = anItem(1);
    Store.setDay(e.listId, e.itemId, null);
    Store.setDone(e.listId, e.itemId, true);
    var done = Store.doneBetween(dayPlus(-1), dayPlus(1));
    ok('what was ticked off today is on today', (done[today] || []).length >= 1,
       (done[today] || []).length);
    var none = Store.doneBetween(dayPlus(-40), dayPlus(-30));
    ok('...and a stretch when nothing was done is empty', Object.keys(none).length === 0);

    /* ============================================================
       LATER: THE DAYS AFTER TOMORROW
       Tomorrow has its own fold in the dock, so it is left out here and
       neither shows the same note twice.
       ============================================================ */
    Store.reset();
    var la = anItem(0), lb = anItem(1), lc = anItem(2);
    Store.setDay(la.listId, la.itemId, dayPlus(1));    // tomorrow
    Store.setDay(lb.listId, lb.itemId, dayPlus(6));
    Store.setDay(lc.listId, lc.itemId, dayPlus(3));
    var later = Store.laterItems();
    eq('tomorrow is not counted as later', later.filter(function (g) { return g.day === dayPlus(1); }).length, 0);
    eq('...and the rest come soonest first', later.map(function (g) { return g.day; }).join(' '),
       dayPlus(3) + ' ' + dayPlus(6));
    eq('...each day carrying its own notes', later[0].items.length, 1);

    /* two on one day: timed first, untimed last */
    var extra = Store.addNote(lc.listId, 0, 'an extra one');
    Store.setDay(lc.listId, extra.id, dayPlus(3));
    Store.mutate(function () { extra.hour = 8; lc.item.hour = null; }, ['board']);
    var day3 = Store.laterItems().filter(function (g) { return g.day === dayPlus(3); })[0];
    eq('a day holds both', day3.items.length, 2);
    eq('...with the timed one first', day3.items[0].item.id, extra.id);
    eq('...and the untimed one after it', day3.items[1].item.id, lc.itemId);

    Store.setDone(lb.listId, lb.itemId, true);
    ok('a finished note drops out of later',
       Store.laterItems().filter(function (g) { return g.day === dayPlus(6); }).length === 0);
    Store.setDone(lb.listId, lb.itemId, false);

    /* ============================================================
       PUTTING ONE OFF TO A CHOSEN DAY
       ============================================================ */
    var w = anItem(0);
    Store.setDay(w.listId, w.itemId, null);
    When.set(w.listId, w.itemId, dayPlus(11), '14');
    eq('a note can be put off to a day of your choosing', Store.dayOf(w.item), dayPlus(11));
    eq('...with a time on it', w.item.hour, 14);
    When.set(w.listId, w.itemId, dayPlus(11), '');
    eq('...or with none', w.item.hour, null);
    When.set(w.listId, w.itemId, Store.dayKey(), '');
    ok('choosing today means Do Today, not a date',
       Store.inToday(w.listId, w.itemId) && Store.dayOf(w.item) === null);

    /* ============================================================
       WRITING ONE STRAIGHT ONTO A DAY
       ============================================================ */
    Store.setView('calendar');
    await wait(80);
    var onDay = dayPlus(5);
    var before = Store.inbox() ? Store.inbox().items.length : 0;
    Calendar.add(onDay);
    await wait(80);
    ok('adding puts a new note on that day', !!Calendar.editing(), JSON.stringify(Calendar.editing()));
    eq('...in the inbox, where a just-thought-of note goes', Store.inbox().items.length, before + 1);
    var made = Calendar.editing();
    eq('...on the day it was added to', Store.dayOf(Store.itemById(made.listId, made.itemId)), onDay);
    ok('...and it opens for writing, with a way to keep it and a way to bin it',
       !!document.querySelector('.cal-edit .cal-edit-text') &&
       !!document.querySelector('.cal-edit .btn-min:not(.danger)') &&
       !!document.querySelector('.cal-edit .btn-min.danger'));

    /* typed straight in, and kept without pressing anything */
    var box = document.querySelector('.cal-edit .cal-edit-text');
    var det = document.querySelector('.cal-edit .cal-edit-detail');
    box.value = 'Dentist'; box.dispatchEvent(new Event('input', { bubbles: true }));
    det.value = 'Bring the letter'; det.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(60);
    eq('what is typed is kept as it is typed', Store.itemById(made.listId, made.itemId).text, 'Dentist');
    eq('...details and all', Store.itemById(made.listId, made.itemId).detail, 'Bring the letter');
    ok('...and it shows on the day', (Store.scheduled(onDay, onDay)[onDay] || []).length === 1);

    document.querySelector('.cal-edit .btn-min:not(.danger)').click();
    await wait(80);
    ok('Save closes the editor and keeps the note', !Calendar.editing() &&
       !!Store.itemById(made.listId, made.itemId));

    /* a blank one made by Add is not left lying about */
    var blankBefore = Store.inbox().items.length;
    Calendar.add(dayPlus(7));
    await wait(60);
    Calendar.go(1);
    await wait(60);
    eq('a note added and left blank is thrown away', Store.inbox().items.length, blankBefore);
    Calendar.toToday();

    /* delete takes it away */
    Calendar.add(dayPlus(8));
    await wait(60);
    var doomed = Calendar.editing();
    document.querySelector('.cal-edit .cal-edit-text').value = 'Not this';
    document.querySelector('.cal-edit .cal-edit-text').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.cal-edit .btn-min.danger').click();
    await wait(80);
    ok('Delete takes the note away altogether',
       !Store.itemById(doomed.listId, doomed.itemId) && !Calendar.editing());

    /* a day gone by takes nothing new */
    var pastBefore = Store.inbox().items.length;
    Calendar.add(dayPlus(-3));
    await wait(60);
    ok('...and a day gone by is a record, so nothing is added to it',
       Store.inbox().items.length === pastBefore ||
       Store.dayOf(Store.itemById((Calendar.editing() || {}).listId, (Calendar.editing() || {}).itemId) || {}) !== dayPlus(-3));

    /* ============================================================
       THE DAY'S MENU

       The panel beside the month is hidden whenever Do Today is up, which
       is its usual state, so an editor that only appeared there looked
       like nothing had happened. The day is worked on from its own menu
       instead: what is already on it, and a way to add one.
       ============================================================ */
    Store.reset();
    Store.setView('calendar');
    await wait(80);
    var mday = dayPlus(6);
    var m1 = anItem(0), m2 = anItem(1);
    Store.setDay(m1.listId, m1.itemId, mday);
    Store.setDay(m2.listId, m2.itemId, mday);
    Store.mutate(function () { m2.item.hour = 15; }, ['board']);
    await wait(80);

    var rightClick = function (key) {
      var c = cellFor(key);
      var b = c.getBoundingClientRect();
      c.dispatchEvent(new MouseEvent('contextmenu',
        { bubbles: true, cancelable: true, clientX: b.left + 10, clientY: b.top + 10 }));
    };
    var ctxLabels = function () {
      return [].map.call(document.querySelectorAll('#ctx .ctx-item'), function (b) { return b.textContent.trim(); });
    };
    var ctxFind = function (re) {
      return [].slice.call(document.querySelectorAll('#ctx .ctx-item')).filter(function (b) { return re.test(b.textContent); })[0];
    };

    /* ---------- grouped by category, what was added here first ----------
       A flat list of everything on a day makes you work out for yourself
       which of it is work and which is shopping. Notes added straight onto
       the day land in the inbox, and go first because they are the ones
       with no category yet - the ones to read and file. */
    var ctxShape = function () {
      return [].map.call(document.querySelectorAll('#ctx > *'), function (el) {
        if (el.className.indexOf('ctx-head') !== -1) return 'HEAD:' + el.textContent.trim();
        if (el.className.indexOf('ctx-sep') !== -1) return '-';
        return 'ITEM:' + el.textContent.trim();
      });
    };
    var headsIn = function (shape) {
      return shape.filter(function (r) { return r.indexOf('HEAD:') === 0; })
                  .map(function (r) { return r.slice(5); });
    };

    /* its own notes, so it cannot take any out from under the assertions
       that follow - they are about a different day and the same board */
    var gday = dayPlus(7);
    var cats = Store.get().lists.filter(function (l) {
      return l.id !== Store.COMPLETED_ID && l.id !== (Store.inbox() || {}).id;
    }).slice(0, 2);
    cats.forEach(function (l, i) {
      var made = Store.addNote(l.id, 0, 'GROUPED-' + i);
      Store.setDay(l.id, made.id, gday);
    });
    var inbox = Store.inbox();
    var fresh = Store.addNote(inbox.id, 0, 'ADDED-ON-THE-DAY');
    Store.setDay(inbox.id, fresh.id, gday);
    await wait(100);

    rightClick(gday);
    await wait(100);
    var shape = ctxShape();
    var heads = headsIn(shape);
    ok('a day is grouped by the category each note is in', heads.length >= 3, heads.join(' | '));
    var dayWords = function (k) {
      var p = k.split('-');
      return new Date(+p[0], +p[1] - 1, +p[2])
        .toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    };
    eq('...the day itself heading the menu', heads[0], dayWords(gday));
    eq('...then what was added straight onto the day', heads[1], inbox.name);
    ok('...and that group holds it', shape[shape.indexOf('HEAD:' + inbox.name) + 1] === 'ITEM:ADDED-ON-THE-DAY',
       shape.join(' | '));
    ok('...with the other categories named below it',
       heads.slice(2).indexOf(cats[0].name) !== -1 && heads.slice(2).indexOf(cats[1].name) !== -1,
       heads.join(' | '));
    ok('...in the order they sit on the board',
       heads.indexOf(cats[0].name) < heads.indexOf(cats[1].name), heads.join(' | '));
    ok('...and a note under its heading still opens for writing',
       !!ctxFind(/ADDED-ON-THE-DAY/));
    UI.close();

    rightClick(mday);
    await wait(80);
    var labels = ctxLabels();
    ok('the day names what is already on it', labels.filter(function (t) {
      return t.indexOf(m1.item.text.slice(0, 12)) !== -1 || t.indexOf(m2.item.text.slice(0, 12)) !== -1;
    }).length === 2, labels.join(' | '));
    ok('...with the time beside the one that has it',
       labels.some(function (t) { return /3p$/.test(t); }), labels.join(' | '));
    ok('...and offers a new one', !!ctxFind(/Add something/));

    /* pick one already there and write in it, without leaving the month */
    ctxFind(new RegExp(m1.item.text.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).click();
    await wait(120);
    var inMenu = document.querySelector('#ctx .cal-menu-edit .cal-edit');
    ok('picking one opens it for writing in the menu', !!inMenu);
    var mt = document.querySelector('#ctx .cal-edit-text');
    var md = document.querySelector('#ctx .cal-edit-detail');
    eq('...already filled in with what it says', mt.value, m1.item.text);
    ok('...with a time on it and a way to bin it',
       !!document.querySelector('#ctx .cal-edit-time') && !!document.querySelector('#ctx .cal-edit .btn-min.danger'));
    /* the first key must not wipe the name of a note that already has one */
    ok('...and its name is not selected, or the first key would wipe it',
       mt.selectionStart === mt.value.length && mt.selectionEnd === mt.value.length,
       mt.selectionStart + '-' + mt.selectionEnd);

    md.value = 'Ask Sam first';
    md.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(80);
    eq('what is typed there is kept', Store.itemById(m1.listId, m1.itemId).detail, 'Ask Sam first');
    ok('...and the menu stays up while you write',
       document.getElementById('ctx').classList.contains('show'));

    /* a new one, from the same menu */
    rightClick(mday);
    await wait(80);
    var inboxWas = Store.inbox().items.length;
    ctxFind(/Add something/).click();
    await wait(120);
    ok('adding opens a blank one in the menu too', !!document.querySelector('#ctx .cal-menu-edit .cal-edit'));
    var nt = document.querySelector('#ctx .cal-edit-text');
    nt.value = 'Car service';
    nt.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(60);
    document.querySelector('#ctx .cal-edit .btn-min:not(.danger)').click();
    await wait(120);
    ok('Save puts it on the day and closes the menu',
       (Store.scheduled(mday, mday)[mday] || []).some(function (e) { return e.item.text === 'Car service'; }) &&
       !document.getElementById('ctx').classList.contains('show'));

    /* one added and abandoned is not left lying about */
    rightClick(dayPlus(10));
    await wait(80);
    var beforeBlank = Store.inbox().items.length;
    ctxFind(/Add something/).click();
    await wait(120);
    eq('(a blank one exists while it is open)', Store.inbox().items.length, beforeBlank + 1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(150);
    eq('closing the menu on a blank one throws it away', Store.inbox().items.length, beforeBlank);

    /* a day gone by is a record: it can be read, not written to */
    rightClick(dayPlus(-2));
    await wait(80);
    ok('a day gone by offers nothing to add', !ctxFind(/Add something/), ctxLabels().join(' | '));
    UI.close();

    /* ============================================================
       NOTHING OF THIS LEAVES THE DEVICE
       ============================================================ */
    ok('the calendar asks the network for nothing',
       !/fetch\(|XMLHttpRequest|<iframe/.test(Calendar.render.toString() + Calendar.drop.toString()));

  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }

  document.title = 'CALENDAR ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre');
  pre.id = 'calendarresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
