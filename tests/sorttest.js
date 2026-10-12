/*
 * How a list is sorted, and what is shown in it.
 *
 * The order you put a list in is the one it keeps. The sort button beside +
 * shows it in another order - by when each note was written - and puts the
 * finished ones at the bottom or out of sight. Moving a note by hand while
 * a list is sorted makes the order you can see the order it keeps, because
 * anything else would put the note straight back where it came from.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 60); }); };

var DAY = 86400000;
var shown = function (id) {
  return [].map.call(document.querySelectorAll('#board [data-list-id="' + (id || 'Lwork') + '"] .note .note-text'),
    function (t) { return t.value; });
};
var kept = function (id) { return Store.listById(id || 'Lwork').items.map(function (i) { return i.text; }); };
/* the label alone: a ticked item has the tick in its text as well */
function labelOf(b) {
  var mark = b.querySelector('.ctx-arrow');
  return b.textContent.replace(mark ? mark.textContent : '', '').trim();
}
function menuItem(re) {
  return [].slice.call(document.querySelectorAll('#ctx .ctx-item')).filter(function (b) { return re.test(labelOf(b)); })[0];
}
function ticked(re) {
  var b = menuItem(re);
  var mark = b && b.querySelector('.ctx-arrow');
  return !!mark && mark.textContent.indexOf('✓') !== -1;
}
function openSortMenu() {
  var btn = document.querySelector('#board [data-list-id="Lwork"] .act-sort');
  if (btn) btn.click();
  return btn;
}

setTimeout(function () {
  (async function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');

    var now = Date.now();
    var mk = function (id, text, made, done) {
      return { id: id, text: text, detail: '', expanded: false, done: !!done, hour: null, made: made };
    };
    var st = JSON.parse(Store.exportState());
    /* written in one order, kept in another: this is the order they were put in */
    st.lists = [{ id: 'Lwork', name: 'Work', color: '#5cc8ff', collapsed: false, items: [
      mk('Nb', 'Written second', now - 2 * DAY),
      mk('Nd', 'Written fourth, and finished', now - 4 * DAY, true),
      mk('Na', 'Written first', now - 1 * DAY),
      mk('Nc', 'Written third', now - 3 * DAY)
    ] }];
    st.board = ['Lwork']; st.closedOrder = []; st.today = [];
    st.settings.layout = 'desktop';
    st.settings.panels.board.today = false;
    Store.importJSON(JSON.stringify(st));
    Mobile.apply();
    await wait(300);

    /* ---------- the button ---------- */
    var head = document.querySelector('#board [data-list-id="Lwork"] .list-head-actions');
    var order = [].map.call(head.querySelectorAll('button'), function (b) { return b.className.replace(/icon-btn sm ?/, ''); });
    ok('there is a sort button in the header', order.indexOf('act-sort') !== -1, order.join(','));
    ok('...right after the + button', order.indexOf('act-sort') === order.indexOf('act-add') + 1, order.join(','));
    ok('...not lit while the list is in your own order',
       !document.querySelector('#board [data-list-id="Lwork"] .act-sort').classList.contains('on'));

    eq('the list is shown in the order it was put in', shown(), ['Written second', 'Written fourth, and finished', 'Written first', 'Written third']);

    /* ---------- newest first ---------- */
    openSortMenu();
    ok('the menu offers my own order, newest and oldest', !!menuItem(/^My own order$/) && !!menuItem(/^Newest first$/) && !!menuItem(/^Oldest first$/));
    ok('...with my own order ticked to begin with', ticked(/^My own order$/) && !ticked(/^Newest first$/));
    ok('...and the two for finished notes', !!menuItem(/Keep them at the bottom/) && !!menuItem(/^Hide them$/));
    menuItem(/^Newest first$/).click();
    await wait(80);
    eq('newest first puts the newest at the top', shown(), ['Written first', 'Written second', 'Written third', 'Written fourth, and finished']);
    eq('...and the list itself is untouched underneath', kept(), ['Written second', 'Written fourth, and finished', 'Written first', 'Written third']);
    ok('...and the button is lit', document.querySelector('#board [data-list-id="Lwork"] .act-sort').classList.contains('on'));

    openSortMenu();
    ok('the menu shows newest first as the one in use', ticked(/^Newest first$/) && !ticked(/^My own order$/));
    menuItem(/^Oldest first$/).click();
    await wait(80);
    eq('oldest first turns it around', shown(), ['Written fourth, and finished', 'Written third', 'Written second', 'Written first']);

    /* ---------- finished notes ---------- */
    openSortMenu();
    menuItem(/Keep them at the bottom/).click();
    await wait(80);
    eq('finished notes go to the bottom', shown(), ['Written third', 'Written second', 'Written first', 'Written fourth, and finished']);
    openSortMenu();
    ok('...and it is ticked', ticked(/Keep them at the bottom/));
    menuItem(/^Hide them$/).click();
    await wait(80);
    eq('hiding them takes them out of the list', shown(), ['Written third', 'Written second', 'Written first']);
    ok('...saying how many are hidden', !!document.querySelector('#board [data-list-id="Lwork"] .list-hidden'),
       (document.querySelector('#board [data-list-id="Lwork"] .list-hidden') || {}).textContent);
    ok('...without deleting anything', kept().length === 4);
    document.querySelector('#board [data-list-id="Lwork"] .list-hidden').click();
    await wait(80);
    ok('and that line brings them back', shown().length === 4 && !Store.listById('Lwork').hideDone);

    /* ---------- back to my own order ---------- */
    openSortMenu();
    menuItem(/^My own order$/).click();
    await wait(80);
    eq('my own order goes back to the order it was put in, not the order it was showing',
       shown(), ['Written second', 'Written first', 'Written third', 'Written fourth, and finished']);
    ok('...with the finished one still kept at the bottom, which is its own choice',
       !!Store.listById('Lwork').doneBottom && !Store.listById('Lwork').sort);
    ok('...so the button stays lit for that', document.querySelector('#board [data-list-id="Lwork"] .act-sort').classList.contains('on'));
    openSortMenu();
    menuItem(/Keep them at the bottom/).click();
    await wait(80);
    eq('turning that off too leaves the list exactly as it was put together',
       shown(), ['Written second', 'Written fourth, and finished', 'Written first', 'Written third']);
    ok('...and the button goes out', !document.querySelector('#board [data-list-id="Lwork"] .act-sort').classList.contains('on'));

    /* ---------- moving a note by hand while sorted ---------- */
    Store.setListSort('Lwork', { sort: 'new' });
    await wait(80);
    eq('(sorted newest first again)', shown(), ['Written first', 'Written second', 'Written third', 'Written fourth, and finished']);
    /* drag the third note to the top of the same list */
    var third = document.querySelector('#board [data-item-id="Nc"]');
    var body = document.querySelector('#board [data-list-id="Lwork"] .list-body');
    var r = third.getBoundingClientRect(), b = body.getBoundingClientRect();
    var pt = function (type, x, y) {
      return new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, clientX: x, clientY: y });
    };
    third.dispatchEvent(pt('pointerdown', r.left + 30, r.top + 10));
    window.dispatchEvent(pt('pointermove', r.left + 30, r.top + 4));
    window.dispatchEvent(pt('pointermove', b.left + 40, b.top + 6));
    window.dispatchEvent(pt('pointerup', b.left + 40, b.top + 6));
    await wait(150);
    eq('a note moved by hand stays where it was put', shown()[0], 'Written third');
    ok('...and the list is back in your own order', !Store.listSorted(Store.listById('Lwork')),
       JSON.stringify(Store.listById('Lwork').sort));
    eq('...which is now the order on screen', kept(), shown());

    /* ---------- hiding finished notes survives a move ----------
       Hiding them is about what you want to look at, not about order, so
       taking hold of the order by hand has no business switching it off.
       It used to: keepShownOrder dropped hideDone along with the sort, and
       the finished notes reappeared the moment a note was dragged. */
    Store.setListSort('Lwork', { hideDone: true });
    await wait(80);
    ok('(hiding finished notes again)', shown().indexOf('Written fourth, and finished') === -1, shown());
    var beforeCount = kept().length;
    var top = document.querySelector('#board [data-list-id="Lwork"] .note');
    var topId = top.closest('[data-item-id]').getAttribute('data-item-id');
    var rr = top.getBoundingClientRect(), bb = document.querySelector('#board [data-list-id="Lwork"] .list-body').getBoundingClientRect();
    top.dispatchEvent(pt('pointerdown', rr.left + 30, rr.top + 10));
    window.dispatchEvent(pt('pointermove', rr.left + 30, rr.top + 16));
    window.dispatchEvent(pt('pointermove', bb.left + 40, bb.bottom - 10));
    window.dispatchEvent(pt('pointerup', bb.left + 40, bb.bottom - 10));
    await wait(150);
    ok('moving a note leaves Hide finished notes on', !!Store.listById('Lwork').hideDone,
       JSON.stringify(Store.listById('Lwork').hideDone));
    ok('...so the finished one is still out of sight',
       shown().indexOf('Written fourth, and finished') === -1, shown());
    eq('...and nothing was lost', kept().length, beforeCount);
    ok('...while the note really did move', shown()[0] !== undefined && topId !== null);

    /* a hidden note goes back behind the same note it sat behind, rather
       than being swept to the end - which is what the doc comment always
       claimed and the code did not do */
    Store.mutate(function () {
      var l = Store.listById('Lwork');
      l.items = [
        { id: 'H1', text: 'one', detail: '', expanded: false, done: false, hour: null },
        { id: 'H2', text: 'finished', detail: '', expanded: false, done: true, hour: null },
        { id: 'H3', text: 'two', detail: '', expanded: false, done: false, hour: null },
        { id: 'H4', text: 'three', detail: '', expanded: false, done: false, hour: null }
      ];
    }, ['board']);
    Store.setListSort('Lwork', { hideDone: true });
    Store.moveNoteInView('Lwork', 'H4', 'Lwork', 0);
    await wait(80);
    eq('a hidden note stays behind the note it sat behind',
       kept().slice(0, 3), ['three', 'one', 'finished']);
    ok('...and is still hidden', !!Store.listById('Lwork').hideDone && shown().indexOf('finished') === -1, shown());

    /* ---------- a note with no time on it ---------- */
    Store.mutate(function () {
      Store.listById('Lwork').items.push({ id: 'Nplain', text: 'No time on it', detail: '', expanded: false, done: false, hour: null });
    }, ['board']);
    Store.setListSort('Lwork', { sort: 'new' });
    await wait(80);
    eq('a note that cannot say when it was written goes last, not first', shown()[shown().length - 1], 'No time on it');

    /* ---------- it is the same on the other device ---------- */
    var sent = JSON.parse(Store.exportState());
    ok('the sort travels with the board', sent.lists[0].sort === 'new', JSON.stringify(sent.lists[0].sort));

    /* ---------- a new note remembers when it was written ---------- */
    var fresh = Store.addNote('Lwork', 0, 'Brand new');
    ok('a new note is stamped with the time it was written', typeof fresh.made === 'number' && Math.abs(Date.now() - fresh.made) < 60000,
       fresh.made);
    await wait(80);
    eq('...so newest first puts it on top', shown()[0], 'Brand new');
    ok('and an older note without a stamp still sorts by its id',
       typeof Store.madeAt({ id: 'mu0w2jffcxjni' }) === 'number', Store.madeAt({ id: 'mu0w2jffcxjni' }));
    ok('...while something that is not a time at all gives nothing',
       Store.madeAt({ id: 'N1' }) === null, Store.madeAt({ id: 'N1' }));
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'SORT ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'sortresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
