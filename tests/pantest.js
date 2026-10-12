/*
 * Pulling the board sideways with the middle button.
 *
 * Ten columns is more than fits, and the quickest way past them is to grab
 * the board itself. Sideways only: up and down belongs to whichever column
 * is under the pointer.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 60); }); };

var boardEl = function () { return document.getElementById('board'); };
var wrap = function () { return document.getElementById('board-wrap'); };
var near = function (a, b, slack) { return Math.abs(a - b) <= (slack || 2); };
function press(type, x, y, button) {
  var e = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'mouse',
                                   button: button === undefined ? 1 : button, clientX: x, clientY: y });
  return e;
}

setTimeout(function () {
  (async function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');

    var st = JSON.parse(Store.exportState());
    st.lists = []; st.board = [];
    for (var i = 0; i < 10; i++) {
      var items = [];
      for (var j = 0; j < 12; j++) items.push({ id: 'N' + i + '_' + j, text: 'Note ' + i + '.' + j, detail: '', expanded: false, done: false, hour: null });
      st.lists.push({ id: 'L' + i, name: 'List ' + i, color: '#5cc8ff', collapsed: false, items: items });
      st.board.push('L' + i);
    }
    st.closedOrder = []; st.today = [];
    st.settings.layout = 'desktop';
    st.settings.maxOpen = 10;
    st.settings.panels.board = { lists: false, presets: false, canvas: false, today: false };
    Store.importJSON(JSON.stringify(st));
    Mobile.apply();
    await wait(400);

    ok('(the board is wider than the window)', boardEl().scrollWidth > boardEl().clientWidth + 200,
       boardEl().scrollWidth + ' vs ' + boardEl().clientWidth);
    boardEl().scrollLeft = 400;
    await wait();
    var from = boardEl().scrollLeft;

    /* ---------- pulling ---------- */
    var mid = { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) };
    wrap().dispatchEvent(press('pointerdown', mid.x, mid.y));
    ok('the board says it is being pulled', document.body.classList.contains('board-panning'));
    window.dispatchEvent(press('pointermove', mid.x - 150, mid.y));
    wrap().dispatchEvent(press('pointermove', mid.x - 150, mid.y));
    await wait();
    ok('pulling left moves the board right by as much', near(boardEl().scrollLeft, from + 150, 3),
       boardEl().scrollLeft + ' vs ' + (from + 150));
    wrap().dispatchEvent(press('pointermove', mid.x + 100, mid.y));
    await wait();
    ok('...and pulling back the other way follows the pointer', near(boardEl().scrollLeft, from - 100, 3),
       boardEl().scrollLeft + ' vs ' + (from - 100));

    /* up and down is not ours */
    var col = document.querySelector('#board [data-list-id="L0"] .list-body');
    col.scrollTop = 60;
    var colAt = col.scrollTop;
    wrap().dispatchEvent(press('pointermove', mid.x + 100, mid.y - 120));
    await wait();
    ok('moving up and down while pulling does not scroll a column', near(col.scrollTop, colAt),
       col.scrollTop + ' vs ' + colAt);

    wrap().dispatchEvent(press('pointerup', mid.x + 100, mid.y - 120));
    ok('letting go stops the pull', !document.body.classList.contains('board-panning'));
    var rest = boardEl().scrollLeft;
    wrap().dispatchEvent(press('pointermove', mid.x - 300, mid.y));
    await wait();
    ok('...and moving after that does nothing', near(boardEl().scrollLeft, rest), boardEl().scrollLeft + ' vs ' + rest);

    /* ---------- the middle button only ---------- */
    boardEl().scrollLeft = 300;
    await wait();
    var before = boardEl().scrollLeft;
    wrap().dispatchEvent(press('pointerdown', mid.x, mid.y, 0));
    window.dispatchEvent(press('pointermove', mid.x - 200, mid.y, 0));
    await wait();
    ok('the left button does not pull the board', near(boardEl().scrollLeft, before), boardEl().scrollLeft + ' vs ' + before);
    ok('...and does not say it is pulling', !document.body.classList.contains('board-panning'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.dispatchEvent(press('pointerup', mid.x - 200, mid.y, 0));
    await wait(100);

    /* ---------- over a column, not just the gaps ---------- */
    var over = document.querySelector('#board [data-list-id="L1"] .note');
    var r = over ? over.getBoundingClientRect() : null;
    ok('(there is a note to start the pull on)', !!r);
    boardEl().scrollLeft = 200;
    await wait();
    before = boardEl().scrollLeft;
    over.dispatchEvent(press('pointerdown', r.left + 20, r.top + 8));
    wrap().dispatchEvent(press('pointermove', r.left - 80, r.top + 8));
    await wait();
    ok('a pull that starts on a note works the same', near(boardEl().scrollLeft, before + 100, 3),
       boardEl().scrollLeft + ' vs ' + (before + 100));
    ok('...and does not pick the note up', !document.body.classList.contains('dnd-active'));
    wrap().dispatchEvent(press('pointerup', r.left - 80, r.top + 8));
    await wait();

    /* ---------- the grab line follows ---------- */
    var thumb = document.getElementById('grabthumb');
    var was = thumb.style.transform;
    boardEl().scrollLeft = 0;
    await wait();
    wrap().dispatchEvent(press('pointerdown', mid.x, mid.y));
    wrap().dispatchEvent(press('pointermove', mid.x - 250, mid.y));
    wrap().dispatchEvent(press('pointerup', mid.x - 250, mid.y));
    await wait(100);
    ok('the bar at the bottom follows the board', thumb.style.transform !== was && /translateX/.test(thumb.style.transform),
       thumb.style.transform + ' was ' + was);
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'PAN ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'panresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
