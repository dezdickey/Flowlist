/*
 * Keeping it quick.
 *
 * Everything felt a beat behind: every letter typed, every tick, every panel
 * opened. Measured on a board of ten columns, the reasons were:
 *
 *   · each keystroke made the browser lay out the whole board, measuring the
 *     note's height by hand (21ms a letter)
 *   · each change built the whole board again from nothing (about 90ms)...
 *   · ...and did it twice, once for each part of the app the change touched
 *   · the top bar, the rail and the dim behind Settings blurred whatever was
 *     behind them, and with a moving scene behind that is every frame's work
 *
 * These tests hold each of those in place.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 60); }); };

var noteEl = function (id) { return document.querySelector('#board [data-item-id="' + id + '"]'); };
var allNotes = function () { return [].slice.call(document.querySelectorAll('#board .list-body > .note')); };

setTimeout(function () {
  (async function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');

    var st = JSON.parse(Store.exportState());
    st.lists = []; st.board = []; st.today = [];
    for (var i = 0; i < 10; i++) {
      var items = [];
      for (var j = 0; j < 20; j++) items.push({ id: 'N' + i + '_' + j, text: 'Note ' + i + '.' + j, detail: '', expanded: false, done: false, hour: null });
      st.lists.push({ id: 'L' + i, name: 'List ' + i, color: '#5cc8ff', collapsed: false, items: items });
      st.board.push('L' + i);
    }
    st.lists[0].items[1].text = 'A much longer note that wraps across several lines in its column, so that it has to be taller than a note of one short line if it is sized to its words at all';
    st.closedOrder = [];
    st.settings.layout = 'desktop';
    st.settings.maxOpen = 10;
    st.settings.panels.board = { lists: true, presets: false, canvas: false, today: true };
    Store.importJSON(JSON.stringify(st));
    Mobile.apply();
    await wait(300);

    /* ============================================================
       typing does not measure anything
       ============================================================ */
    ok('this browser sizes a text box to its words by itself', UI.nativeFit());
    var ta = noteEl('N0_3').querySelector('.note-text');
    ta.focus();
    ta.value = ta.value + ' and some more words typed in';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    eq('typing into a note sets no height by hand', ta.style.height, '');
    eq('...and the words are saved', Store.itemById('L0', 'N0_3').text, 'Note 0.3 and some more words typed in');
    var oneLine = noteEl('N0_0').querySelector('.note-text').getBoundingClientRect().height;
    var many = noteEl('N0_1').querySelector('.note-text').getBoundingClientRect().height;
    ok('a note with many words is still as tall as its words', many > oneLine * 2, many + ' vs ' + oneLine);
    ok('...and a note of one line is one line tall', oneLine > 10 && oneLine < 30, oneLine);

    /* ============================================================
       one change, one redraw
       ============================================================ */
    var calls = 0;
    var probe = function () { calls++; };
    Store.on('board', probe);
    Store.on('today', probe);
    Store.on('lists', probe);
    Store.emit(['board', 'today', 'lists']);
    eq('something listening to three parts of a change hears it once', calls, 1);

    /* ============================================================
       only what changed is built again
       ============================================================ */
    ta.blur();
    await wait(80);
    var before = allNotes();
    var added = [];
    var mo = new MutationObserver(function (list) {
      list.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.classList && n.classList.contains('note')) added.push(n.dataset.itemId); }); });
    });
    mo.observe(document.getElementById('board'), { childList: true, subtree: true });
    Store.setDone('L4', 'N4_7');
    await wait(20);
    mo.disconnect();
    ok('ticking a note builds that note again and nothing else on the board', added.length === 1 && added[0] === 'N4_7',
       JSON.stringify(added));
    var after = allNotes();
    var kept = before.filter(function (n) { return n.dataset.itemId !== 'N4_7' && after.indexOf(n) !== -1; }).length;
    eq('...every other note on the board is the very same element', kept, before.length - 1);
    ok('...and the ticked note shows as ticked', noteEl('N4_7').classList.contains('done'));
    eq('...and its column count went down', document.querySelector('#board [data-list-id="L4"] .list-count').textContent, '19');

    /* typing, then something else redraws: the note being typed into is kept */
    ta = noteEl('N2_5').querySelector('.note-text');
    ta.focus();
    ta.value = 'Half-way through typing';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    Store.emit(['board', 'today']);
    ok('a redraw while a note is being typed into keeps the very same box', noteEl('N2_5').querySelector('.note-text') === ta);
    ok('...still being typed into', document.activeElement === ta);
    ta.blur();

    /* words changed from elsewhere are shown */
    Store.mutate(function () { Store.itemById('L3', 'N3_2').text = 'Changed on the phone'; }, ['board']);
    eq('words changed somewhere else are drawn', noteEl('N3_2').querySelector('.note-text').value, 'Changed on the phone');

    /* a note moved to another column is built for that column */
    var moving = noteEl('N5_0');
    Store.moveNote('L5', 'N5_0', 'L6', 0);
    var moved = document.querySelector('#board [data-list-id="L6"] [data-item-id="N5_0"]');
    ok('a note moved to another column is there', !!moved);
    ok('...built again for it, not carried across', moved && moved !== moving);
    ok('...and gone from where it was', !document.querySelector('#board [data-list-id="L5"] [data-item-id="N5_0"]'));

    /* a column folded is built again as a spine */
    var col = document.querySelector('#board [data-list-id="L7"]');
    Store.toggleCollapse('L7');
    var spine = document.querySelector('#board [data-list-id="L7"]');
    ok('folding a column rebuilds that column', spine !== col && spine.classList.contains('collapsed'));
    Store.toggleCollapse('L7');

    /* a board that arrives whole is built whole: its buttons must hold the new notes */
    var old = noteEl('N8_4');
    Store.importJSON(Store.exportState());
    var fresh = noteEl('N8_4');
    ok('a board that arrives whole is built again', fresh && fresh !== old);
    fresh.querySelector('.note-check').click();
    ok('...and what is clicked on it acts on the note that is really there', Store.itemById('L8', 'N8_4').done === true);

    /* the order changes, the elements are moved, not rebuilt */
    var third = noteEl('N9_2');
    Store.moveNote('L9', 'N9_2', 'L9', 0);
    ok('reordering a column moves the note', document.querySelector('#board [data-list-id="L9"] .list-body > .note') === noteEl('N9_2'));
    ok('...without building it again', noteEl('N9_2') === third);

    /* ============================================================
       nothing blurs what moves behind it
       ============================================================ */
    Themes.apply('valley');
    await wait(100);
    ['#topbar', '#rail', '#scrim'].forEach(function (sel) {
      var el = document.querySelector(sel) || document.querySelector('.scrim');
      var bf = el ? getComputedStyle(el).backdropFilter : '(not found)';
      ok(sel + ' does not blur the scene behind it', bf === 'none' || bf === '', bf);
    });
    var bar = getComputedStyle(document.getElementById('topbar')).backgroundColor;
    var alpha = parseFloat((bar.match(/rgba?\([^)]*,\s*([\d.]+)\)/) || [0, 1])[1]);
    ok('...and on a scenery theme the bar is solid enough not to need it', alpha >= 0.84, bar);
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'SPEED ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'speedresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
