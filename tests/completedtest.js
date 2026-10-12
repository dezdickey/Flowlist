/*
 * Completed.
 *
 * Ticking a note off copies it into Completed and leaves it where it was.
 * A note that was on Do Today when it was ticked keeps its time and the
 * Do Today mark on the copy; any other note is copied as just the note.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

function board() {
  var st = JSON.parse(Store.exportState());
  st.settings.completedMade = false;
  st.lists = [
    { id: 'Lwork', name: 'Work', color: '#5cc8ff', collapsed: false, items: [
      { id: 'Nplain', text: 'Plain note', detail: 'the longer part', expanded: false, done: false, hour: null },
      { id: 'Ntimed', text: 'Timed on today', detail: '', expanded: false, done: false, hour: 15 },
      { id: 'Nloose', text: 'On today, no time', detail: '', expanded: false, done: false, hour: null },
      { id: 'Nhourly', text: 'Has a time, not on today', detail: '', expanded: false, done: false, hour: 9 }
    ] }
  ];
  st.board = ['Lwork'];
  st.closedOrder = [];
  st.today = [{ listId: 'Lwork', itemId: 'Ntimed' }, { listId: 'Lwork', itemId: 'Nloose' }];
  return st;
}
var completed = function () { return Store.listById('completed'); };
var copiesOf = function (id) { var c = completed(); return c ? c.items.filter(function (i) { return i.copyOf === id; }) : []; };
var noteOnBoard = function (listId, itemId) {
  return document.querySelector('#board [data-list-id="' + listId + '"] [data-item-id="' + itemId + '"]');
};
var todayRow = function (itemId) { return document.querySelector('#today-body .today-item[data-item-id="' + itemId + '"]'); };

setTimeout(function () {
  Promise.resolve().then(function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    var atStart = completed();
    ok('the app opens with a Completed list', !!atStart && atStart.items.length === 0);
    Store.importJSON(JSON.stringify(board()));
    ok('a board arriving by sync or from a backup does not grow one', !completed());
    Store.setDone('Lwork', 'Nplain');
    Store.setDone('Lwork', 'Nplain');        // ticked and unticked: the list is made, the copy taken back

    /* ---------- the list is there ---------- */
    var box = completed();
    ok('ticking makes a Completed list where there is none', !!box);
    eq('...called Completed', box && box.name, 'Completed');
    eq('...empty to begin with', box && box.items.length, 0);
    eq('...and only one of it', Store.get().lists.filter(function (l) { return l.name === 'Completed'; }).length, 1);
    Store.importJSON(Store.exportState());
    eq('loading again does not make a second', Store.get().lists.filter(function (l) { return l.id === 'completed'; }).length, 1);

    /* ---------- a note that is not on Do Today ---------- */
    var todayBefore = Store.get().today.length;
    noteOnBoard('Lwork', 'Nplain').querySelector('.note-check').click();
    var orig = Store.itemById('Lwork', 'Nplain');
    ok('ticking a note leaves it in its own list', !!orig);
    ok('...ticked', orig && orig.done === true);
    var c = copiesOf('Nplain');
    eq('...and puts one copy in Completed', c.length, 1);
    ok('...with the same words and description', c[0] && c[0].text === 'Plain note' && c[0].detail === 'the longer part');
    ok('...no time', c[0] && c[0].hour === null);
    ok('...no Do Today mark', c[0] && c[0].wasToday === false);
    ok('...ticked off itself', c[0] && c[0].done === true);
    ok('...with its own id', c[0] && c[0].id !== 'Nplain');

    Store.setDone('Lwork', 'Nhourly');
    c = copiesOf('Nhourly');
    ok('a note with a time but not on Do Today is copied without the time', c.length === 1 && c[0].hour === null && !c[0].wasToday,
       JSON.stringify(c));

    /* ---------- a note on Do Today, with a time ---------- */
    Store.openList('completed');
    todayRow('Ntimed').querySelector('.note-check').click();
    c = copiesOf('Ntimed');
    eq('ticked in Do Today, it is copied once', c.length, 1);
    eq('...keeping its time', c[0] && c[0].hour, 15);
    ok('...and the Do Today mark', c[0] && c[0].wasToday === true);
    ok('the note itself stays in its list and on Do Today', !!Store.itemById('Lwork', 'Ntimed') && Store.inToday('Lwork', 'Ntimed'));
    eq('the copy does not appear on Do Today as well', Store.get().today.length, todayBefore);

    var copyEl = noteOnBoard('completed', c[0].id);
    ok('the copy is drawn in Completed', !!copyEl);
    var tags = copyEl ? [].slice.call(copyEl.querySelectorAll('.note-tags .tag')) : [];
    ok('...with the clock and its time', tags.some(function (t) {
      return !t.classList.contains('tag-today') && t.querySelector('.ic') && t.textContent.indexOf(UI.hourLabel(15)) !== -1;
    }), tags.map(function (t) { return t.textContent; }).join('|'));
    ok('...and the Do Today mark', tags.some(function (t) { return t.classList.contains('tag-today'); }));
    eq('...neither of which can be knocked off by a stray tap', copyEl ? copyEl.querySelectorAll('.note-tags button').length : -1, 0);

    var bubbles = function (el) {
      return el ? [].map.call(el.querySelectorAll('.note-tags .tag'), function (t) {
        return (t.classList.contains('tag-from') ? 'from:' : t.classList.contains('tag-today') ? 'today:' : 'time:') + t.textContent.trim();
      }) : [];
    };
    eq('...three bubbles: the list it came from, its time, and Today', bubbles(copyEl),
       ['from:Work', 'time:' + UI.hourLabel(15), 'today:Today']);
    var fromTag = copyEl && copyEl.querySelector('.tag-from');
    ok('...the list bubble in that list\'s colour', !!fromTag && fromTag.style.getPropertyValue('--from').trim() === '#5cc8ff',
       fromTag && fromTag.getAttribute('style'));

    var plainEl = noteOnBoard('completed', copiesOf('Nplain')[0].id);
    eq('a copy that was not on Do Today has one bubble: the list it came from', bubbles(plainEl), ['from:Work']);

    /* ---------- on Do Today, no time ---------- */
    noteOnBoard('Lwork', 'Nloose').querySelector('.note-check').click();
    c = copiesOf('Nloose');
    ok('on Do Today with no time: the mark but no clock', c.length === 1 && c[0].wasToday === true && c[0].hour === null,
       JSON.stringify(c));
    var looseEl = c[0] && noteOnBoard('completed', c[0].id);
    eq('...drawn that way: the list and Today, no clock', bubbles(looseEl), ['from:Work', 'today:Today']);

    eq('the newest copy is at the top', completed().items[0].copyOf, 'Nloose');

    /* ---------- unticking ---------- */
    Store.setDone('Lwork', 'Nloose');
    eq('unticking the same day takes that copy back out', copiesOf('Nloose').length, 0);
    ok('...and the note is unticked, still in its list', Store.itemById('Lwork', 'Nloose').done === false);

    Store.mutate(function () { copiesOf('Nplain')[0].doneAt = Date.now() - 2 * 86400000; }, null, { silent: true });
    Store.setDone('Lwork', 'Nplain');
    eq('unticking later keeps the earlier day\'s record', copiesOf('Nplain').length, 1);
    Store.setDone('Lwork', 'Nplain');
    eq('...and ticking again adds today\'s', copiesOf('Nplain').length, 2);

    /* ---------- ticking inside Completed ---------- */
    var before = completed().items.length;
    var aCopy = completed().items[0];
    Store.setDone('completed', aCopy.id);
    ok('unticking a copy in Completed just unticks it', completed().items.length === before && aCopy.done === false);
    Store.setDone('completed', aCopy.id);
    eq('...and ticking it makes no copy of the copy', completed().items.length, before);

    /* ---------- every way of ticking ---------- */
    Store.mutate(function (s) {
      Store.listById('Lwork').items.push({ id: 'Nmenu', text: 'Ticked from a menu', detail: '', expanded: false, done: false, hour: null });
    }, ['board']);
    noteOnBoard('Lwork', 'Nmenu').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 }));
    var mark = [].slice.call(document.querySelectorAll('#ctx .ctx-item'))
      .filter(function (b) { return /^\s*Mark done\s*$/.test(b.textContent); })[0];
    ok('(the note menu offers Mark done)', !!mark);
    if (mark) mark.click();
    eq('Mark done from the menu copies it too', copiesOf('Nmenu').length, 1);

    /* ---------- deleted ---------- */
    Store.deleteList('completed');
    Store.importJSON(Store.exportState());
    ok('a Completed list you deleted does not come back on its own', !completed());
    Store.setDone('Lwork', 'Nhourly');   // unticked
    Store.setDone('Lwork', 'Nhourly');   // ticked again
    ok('...but ticking something off makes it again', !!completed() && copiesOf('Nhourly').length === 1);

    /* ---------- two devices ---------- */
    var base = JSON.parse(Store.exportState());
    base.lists = base.lists.filter(function (l) { return l.id !== 'completed'; });
    var mine = JSON.parse(JSON.stringify(base)), theirs = JSON.parse(JSON.stringify(base));
    mine.lists.push({ id: 'completed', name: 'Completed', color: '#12a594', collapsed: false,
      items: [{ id: 'cA', text: 'Done on the laptop', copyOf: 'x', done: true, hour: null, detail: '', expanded: false }] });
    theirs.lists.push({ id: 'completed', name: 'Completed', color: '#12a594', collapsed: false,
      items: [{ id: 'cB', text: 'Done on the phone', copyOf: 'y', done: true, hour: 10, wasToday: true, detail: '', expanded: false }] });
    var merged = Merge.three(base, mine, theirs).state;
    var boxes = merged.lists.filter(function (l) { return l.id === 'completed'; });
    eq('two devices that each made Completed end up with one', boxes.length, 1);
    ok('...holding what both of them ticked', boxes[0] && boxes[0].items.length === 2);

    /* ---------- where it came from, when lists change ---------- */
    Store.mutate(function (s) {
      s.lists.push({ id: 'Linbox', name: 'Uncategorized', color: '#8fb7ff', collapsed: false, items: [
        { id: 'Nin', text: 'Written into Do Today', detail: '', expanded: false, done: false, hour: 20 }
      ] });
      s.today.push({ listId: 'Linbox', itemId: 'Nin' });
    }, ['board', 'today', 'lists']);
    Store.openList('completed');
    Store.setDone('Linbox', 'Nin');
    var inCopy = copiesOf('Nin')[0];
    ok('the copy records the list it was ticked in', !!inCopy && inCopy.from && inCopy.from.listId === 'Linbox' &&
       inCopy.from.name === 'Uncategorized', JSON.stringify(inCopy && inCopy.from));
    Store.mutate(function () { var l = Store.listById('Linbox'); l.name = 'Do today'; l.color = '#ff6fae'; }, ['board', 'lists']);
    var inEl = inCopy && noteOnBoard('completed', inCopy.id);
    eq('renaming that list renames the bubble — Uncategorized became Do today', bubbles(inEl),
       ['from:Do today', 'time:' + UI.hourLabel(20), 'today:Today']);
    ok('...and recolouring it recolours the bubble', !!inEl && inEl.querySelector('.tag-from').style.getPropertyValue('--from').trim() === '#ff6fae');

    Store.deleteList('Linbox');
    inEl = noteOnBoard('completed', inCopy.id);
    eq('with the list deleted, the bubble keeps the name it had when the note was ticked', bubbles(inEl).slice(0, 1), ['from:Uncategorized']);

    Store.mutate(function () {
      completed().items.unshift({ id: 'Cold', text: 'Copied before lists were written down', detail: '', expanded: false,
                                  done: true, hour: null, wasToday: false, copyOf: 'Nhourly', doneAt: Date.now() });
    }, ['board', 'lists']);
    eq('an older copy is traced back to its note\'s list', bubbles(noteOnBoard('completed', 'Cold')), ['from:Work']);

    ok('a note that is not a copy has no list bubble', !noteOnBoard('Lwork', 'Nplain').querySelector('.tag-from'));

    /* ---------- reminders ---------- */
    ok('a copy with a time sends no reminder', Ntfy.plan().every(function (p) { return p.listId !== 'completed'; }));
  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'COMPLETED ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'completedresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
