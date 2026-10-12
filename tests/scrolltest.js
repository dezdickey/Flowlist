/*
 * Staying put.
 *
 * Ticking a note off redraws the board and Do Today. The redraw is allowed;
 * losing your place is not. Wherever you were scrolled to - in a column, in
 * Do Today, in the Categories panel - is where you still are afterwards, so
 * the next note down can be ticked straight away, and the one after that.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 60); }); };

var col = function (id) { return document.querySelector('#board [data-list-id="' + id + '"] .list-body'); };
var boardNote = function (id) { return document.querySelector('#board [data-item-id="' + id + '"]'); };
var dock = function () { return document.getElementById('today-body'); };
var near = function (a, b) { return Math.abs(a - b) <= 2; };
function menuItem(re) {
  return [].slice.call(document.querySelectorAll('#ctx .ctx-item')).filter(function (b) { return re.test(b.textContent.trim()); })[0];
}
function rightClick(el) { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 400, clientY: 400 })); }

setTimeout(function () {
  (async function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');

    var st = JSON.parse(Store.exportState());
    var items = [], today = [];
    for (var i = 0; i < 40; i++) {
      items.push({ id: 'N' + i, text: 'Note number ' + i, detail: '', expanded: false, done: false, hour: i % 3 === 0 ? 9 + (i % 12) : null });
      if (i % 2 === 0) today.push({ listId: 'Lwork', itemId: 'N' + i });
    }
    var lists = [{ id: 'Lwork', name: 'Work', color: '#5cc8ff', collapsed: false, items: items }];
    var long = [];
    for (var m = 0; m < 30; m++) long.push({ id: 'W' + m, detail: '', expanded: false, done: false, hour: null,
      text: 'A long note that wraps onto several lines in its column, number ' + m + ', so the column only reaches its full height once every note has grown to fit its words' });
    lists.push({ id: 'Llong', name: 'Long notes', color: '#6ee7a0', collapsed: false, items: long });
    for (var k = 0; k < 30; k++) lists.push({ id: 'Lx' + k, name: 'Category ' + k, color: '#7c8dff', collapsed: false, items: [] });
    st.lists = lists;
    st.board = ['Lwork']; st.closedOrder = []; st.today = today;
    st.settings.layout = 'desktop';
    st.settings.todayTimeline = false;
    st.settings.panels.board = { lists: true, presets: false, canvas: false, today: true };
    Store.importJSON(JSON.stringify(st));
    Mobile.apply();
    Store.setDone('Lwork', 'N0');                 /* makes Completed, to have it open beside Work */
    Store.openList('completed');
    await wait(300);

    /* ---------- a column ---------- */
    col('Lwork').scrollTop = 700;
    await wait();
    var at = col('Lwork').scrollTop;
    ok('(the Work column is scrolled well down)', at > 400, at);
    boardNote('N21').querySelector('.note-check').click();
    ok('ticking a note keeps the column where it was, straight away', near(col('Lwork').scrollTop, at), col('Lwork').scrollTop + ' vs ' + at);
    await wait(100);
    ok('...and once the redraw has settled', near(col('Lwork').scrollTop, at), col('Lwork').scrollTop + ' vs ' + at);
    ok('(it was ticked, and copied to Completed)', Store.itemById('Lwork', 'N21').done && Store.listById('completed').items.length === 2);

    /* one after another, without waiting for anything */
    boardNote('N23').querySelector('.note-check').click();
    boardNote('N25').querySelector('.note-check').click();
    boardNote('N27').querySelector('.note-check').click();
    ok('ticking three in a row, as fast as they can be clicked, still keeps the place', near(col('Lwork').scrollTop, at), col('Lwork').scrollTop + ' vs ' + at);
    await wait(100);
    ok('...after they settle too', near(col('Lwork').scrollTop, at), col('Lwork').scrollTop + ' vs ' + at);

    boardNote('N27').querySelector('.note-check').click();
    await wait(100);
    ok('unticking keeps the place', near(col('Lwork').scrollTop, at), col('Lwork').scrollTop + ' vs ' + at);

    rightClick(boardNote('N29'));
    var mark = menuItem(/^Mark done$/);
    if (mark) mark.click();
    await wait(100);
    ok('Mark done from the menu keeps the place', !!mark && near(col('Lwork').scrollTop, at), col('Lwork').scrollTop + ' vs ' + at);

    /* the other column on the board holds its place too */
    ['N1', 'N3', 'N5', 'N7', 'N9', 'N11', 'N13', 'N15', 'N17', 'N19', 'N31'].forEach(function (id) { Store.setDone('Lwork', id); });
    await wait(100);
    col('completed').scrollTop = 250;
    await wait();
    var cAt = col('completed').scrollTop;
    /* what is at the top of what you can see, and where on screen it is */
    var firstSeen = function () {
      var top = col('completed').getBoundingClientRect().top;
      var n = [].filter.call(col('completed').querySelectorAll('.note'), function (x) { return x.getBoundingClientRect().top >= top - 1; })[0];
      return n ? { id: n.dataset.itemId, y: Math.round(n.getBoundingClientRect().top) } : null;
    };
    var seen = firstSeen();
    boardNote('N33').querySelector('.note-check').click();
    await wait(100);
    var seenAfter = firstSeen();
    /* the new copy goes in at the very top, out of sight above; what you were
       looking at stays exactly where it was on screen */
    ok('the Completed column beside it keeps what you were looking at in place',
       cAt > 100 && !!seen && !!seenAfter && seen.id === seenAfter.id && Math.abs(seen.y - seenAfter.y) <= 2,
       JSON.stringify(seen) + ' vs ' + JSON.stringify(seenAfter));
    ok('...as does Work', near(col('Lwork').scrollTop, at), col('Lwork').scrollTop + ' vs ' + at);

    /* ---------- a column of long notes, scrolled right to the bottom ---------- */
    Store.openList('Llong');
    await wait(300);
    col('Llong').scrollTop = 100000;
    await wait();
    var lAt = col('Llong').scrollTop;
    ok('(the long-notes column is scrolled to the bottom)', lAt > 800, lAt);
    document.querySelector('#board [data-item-id="W28"] .note-check').click();
    await wait(100);
    ok('ticking near the bottom of a column of long notes keeps the place exactly', near(col('Llong').scrollTop, lAt), col('Llong').scrollTop + ' vs ' + lAt);
    document.querySelector('#board [data-item-id="W27"] .note-check').click();
    await wait(100);
    ok('...and again', near(col('Llong').scrollTop, lAt), col('Llong').scrollTop + ' vs ' + lAt);
    Store.closeList('Llong');
    await wait(100);

    /* ---------- Do Today, as a list ---------- */
    dock().scrollTop = 500;
    await wait();
    var dAt = dock().scrollTop;
    ok('(Do Today is scrolled down)', dAt > 200, dAt);
    var row = document.querySelector('#today-body .today-item[data-item-id="N30"]');
    row.querySelector('.note-check').click();
    ok('ticking in Do Today keeps Do Today where it was', near(dock().scrollTop, dAt), dock().scrollTop + ' vs ' + dAt);
    await wait(100);
    ok('...once settled', near(dock().scrollTop, dAt), dock().scrollTop + ' vs ' + dAt);
    ok('...and the column behind it keeps its place', near(col('Lwork').scrollTop, at), col('Lwork').scrollTop + ' vs ' + at);

    /* ---------- Do Today, on the timeline ---------- */
    document.getElementById('btn-today-mode').click();
    await wait(100);
    dock().scrollTop = 400;
    await wait();
    dAt = dock().scrollTop;
    row = [].filter.call(document.querySelectorAll('#today-body .today-item:not(.done)'), function (r) {
      var b = r.getBoundingClientRect(), d = dock().getBoundingClientRect();
      return b.top >= d.top && b.bottom <= d.bottom;
    })[0];
    ok('(a row on screen to tick, with the timeline scrolled down)', !!row && dAt > 200, dAt);
    if (row) row.querySelector('.note-check').click();
    await wait(100);
    ok('ticking on the timeline keeps the timeline where it was', near(dock().scrollTop, dAt), dock().scrollTop + ' vs ' + dAt);
    document.getElementById('btn-today-mode').click();
    await wait(100);

    /* ---------- the Categories panel ---------- */
    var index = document.querySelector('#panel-lists .panel-body');
    index.scrollTop = 300;
    await wait();
    var iAt = index.scrollTop;
    ok('(the Categories panel is scrolled down)', iAt > 100, iAt);
    boardNote('N35').querySelector('.note-check').click();
    await wait(100);
    ok('ticking a note keeps the Categories panel where it was', near(index.scrollTop, iAt), index.scrollTop + ' vs ' + iAt);

    /* ---------- other changes that redraw the same way ---------- */
    rightClick(boardNote('N37'));
    var tmr = menuItem(/^Tomorrow$/);
    if (tmr) tmr.click();
    await wait(100);
    ok('putting a note off to tomorrow keeps the place', !!tmr && near(col('Lwork').scrollTop, at), col('Lwork').scrollTop + ' vs ' + at);
    rightClick(boardNote('N39'));
    var send = menuItem(/^Send to Do Today$/);
    if (send) send.click();
    await wait(100);
    ok('sending a note to Do Today keeps the place', !!send && near(col('Lwork').scrollTop, at), col('Lwork').scrollTop + ' vs ' + at);

    /* ---------- on a phone ---------- */
    Store.mutate(function (s) { s.settings.layout = 'phone'; }, null, { silent: true });
    Mobile.apply();
    Store.emit(['board']);
    await wait(400);
    ok('(the phone shape)', document.body.classList.contains('phone'));
    col('Lwork').scrollTop = 900;
    await wait();
    var pAt = col('Lwork').scrollTop;
    var next = [].filter.call(document.querySelectorAll('#board [data-list-id="Lwork"] .note:not(.done)'), function (n) {
      var r = n.getBoundingClientRect(), b = col('Lwork').getBoundingClientRect();
      return r.top >= b.top && r.bottom <= b.bottom;
    })[0];
    ok('(a note on screen to tick, with the column scrolled down)', !!next && pAt > 300, pAt);
    if (next) next.querySelector('.note-check').click();
    await wait(100);
    ok('on the phone, ticking a note keeps the column where it was', near(col('Lwork').scrollTop, pAt), col('Lwork').scrollTop + ' vs ' + pAt);
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'SCROLL ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'scrollresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
