/*
 * Small things that were in the way.
 *
 *   · a collapsed column is a 40px spine at every window width - in a
 *     cropped window it was being blown up to the width of an open one
 *   · ten columns open at once, not five
 *   · a note in Do Today can be renamed from its own menu
 *   · a mouse picks a note up at two pixels, not five
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 60); }); };
function menuItem(re) {
  return [].slice.call(document.querySelectorAll('#ctx .ctx-item')).filter(function (b) { return re.test(b.textContent.trim()); })[0];
}
function rightClick(el) {
  var r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 }));
}
/** Every style rule that sets a column's width inside a narrow-window media block. */
function narrowListRules() {
  var out = [];
  [].forEach.call(document.styleSheets, function (sheet) {
    var rules; try { rules = sheet.cssRules; } catch (e) { return; }
    [].forEach.call(rules || [], function (rule) {
      if (!rule.media || !/max-width/.test(rule.conditionText || rule.media.mediaText)) return;
      [].forEach.call(rule.cssRules || [], function (inner) {
        if (!inner.selectorText || !/\.list\b/.test(inner.selectorText)) return;
        if (!/width/.test(inner.style.cssText)) return;
        out.push({ at: rule.conditionText || rule.media.mediaText, sel: inner.selectorText, css: inner.style.cssText });
      });
    });
  });
  return out;
}

setTimeout(function () {
  (async function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');

    var st = JSON.parse(Store.exportState());
    st.lists = [];
    for (var i = 0; i < 14; i++) st.lists.push({ id: 'L' + i, name: 'List ' + i, color: '#5cc8ff', collapsed: false,
      items: [{ id: 'N' + i, text: 'Note ' + i, detail: '', expanded: false, done: false, hour: null }] });
    st.board = ['L0', 'L1']; st.closedOrder = []; st.today = [{ listId: 'L0', itemId: 'N0' }];
    st.settings.layout = 'desktop';
    st.settings.panels.board.today = true;
    Store.importJSON(JSON.stringify(st));
    Mobile.apply();
    await wait(300);

    /* ============================================================
       a collapsed column is a spine, whatever the window
       ============================================================ */
    var rules = narrowListRules();
    ok('(a cropped window has a rule for column width)', rules.length > 0, JSON.stringify(rules));
    ok('a cropped window does not blow up collapsed columns',
       rules.every(function (r) { return /:not\(\.collapsed\)/.test(r.sel); }),
       JSON.stringify(rules));
    Store.toggleCollapse('L0');
    await wait(80);
    var spine = document.querySelector('#board [data-list-id="L0"]');
    ok('(a collapsed column here is a spine)', Math.round(spine.getBoundingClientRect().width) === 40,
       Math.round(spine.getBoundingClientRect().width));
    Store.toggleCollapse('L0');

    /* ============================================================
       ten columns, not five
       ============================================================ */
    eq('the board holds ten columns now', Store.settings().maxOpen, 10);
    var slider = document.querySelector('[data-slider="Columns on screen"]');
    Themes.openDrawer();
    slider = document.querySelector('[data-slider="Columns on screen"]');
    ok('(the setting is there)', !!slider);
    ok('...and goes past ten', slider && parseInt(slider.querySelector('input').max, 10) >= 10,
       slider && slider.querySelector('input').max);
    Themes.closeDrawer();

    var collapsedOnOpen = [];
    for (var k = 2; k < 12; k++) collapsedOnOpen.push(Store.openList('L' + k).collapsed);
    await wait(100);
    eq('ten open at once, all of them unfolded', collapsedOnOpen.slice(0, 8), [false, false, false, false, false, false, false, false]);
    ok('...the eleventh arrives folded, as the cap says', collapsedOnOpen[8] === true, JSON.stringify(collapsedOnOpen));
    eq('(ten unfolded on the board)', Store.expandedCount(), 10);

    /* a board saved under the old cap of five is raised once */
    var old = JSON.parse(Store.exportJSON());
    old.settings.maxOpen = 5;
    delete old.settings.maxOpenRaised;
    Store.importJSON(JSON.stringify(old));
    eq('a board saved with the old cap of five is raised', Store.settings().maxOpen, 10);
    var mine = JSON.parse(Store.exportJSON());
    mine.settings.maxOpen = 4;
    mine.settings.maxOpenRaised = true;
    Store.importJSON(JSON.stringify(mine));
    eq('...but a cap set on purpose is left alone', Store.settings().maxOpen, 4);
    Store.mutate(function (s) { s.settings.maxOpen = 10; }, ['board']);

    /* a brand new board, not one loaded and raised */
    var keep = Store.exportJSON();
    Store.reset();
    eq('a board made from scratch starts with ten', Store.settings().maxOpen, 10);
    Store.importJSON(keep);
    await wait(100);

    /* ============================================================
       renaming from Do Today
       ============================================================ */
    Store.importJSON(JSON.stringify(st));
    Mobile.apply();
    await wait(200);
    var row = document.querySelector('#today-body .today-item[data-item-id="N0"]');
    ok('(a row in Do Today)', !!row);
    rightClick(row);
    var rename = menuItem(/^Rename$/);
    ok('a row in Do Today offers Rename', !!rename);
    if (rename) rename.click();
    await wait(80);
    var box = document.querySelector('#today-body .ti-input');
    ok('...which opens a box right there', !!box && document.activeElement === box);
    eq('...with what the note says in it', box && box.value, 'Note 0');
    box.value = 'Renamed from Do Today';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(80);
    eq('typing a new name renames the note', Store.itemById('L0', 'N0').text, 'Renamed from Do Today');
    ok('...and it is still in its list and on Do Today', !!Store.itemById('L0', 'N0') && Store.inToday('L0', 'N0'));
    ok('...and the row shows the new name',
       (document.querySelector('#today-body .today-item[data-item-id="N0"] .ti-text') || {}).textContent === 'Renamed from Do Today');

    /* Escape leaves it as it was */
    rightClick(document.querySelector('#today-body .today-item[data-item-id="N0"]'));
    var again = menuItem(/^Rename$/);
    if (again) again.click();
    await wait(80);
    box = document.querySelector('#today-body .ti-input');
    box.value = 'Thought better of it';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(80);
    eq('Escape leaves the name as it was', Store.itemById('L0', 'N0').text, 'Renamed from Do Today');
    ok('...and the note is still there', !!Store.itemById('L0', 'N0') && Store.inToday('L0', 'N0'));

    /* ============================================================
       a mouse picks a note up at two pixels
       ============================================================ */
    var note = document.querySelector('#board [data-list-id="L0"] [data-item-id="N0"]');
    var r = note.getBoundingClientRect();
    var pt = function (type, dx, dy) {
      return new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0,
                                      clientX: r.left + 30 + (dx || 0), clientY: r.top + 10 + (dy || 0) });
    };
    note.dispatchEvent(pt('pointerdown', 0, 0));
    window.dispatchEvent(pt('pointermove', 1, 0));
    ok('a pixel of wobble is not a drag', !document.body.classList.contains('dnd-active'));
    window.dispatchEvent(pt('pointermove', 2, 1));
    ok('two pixels and the note is in your hand', document.body.classList.contains('dnd-active'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.dispatchEvent(pt('pointerup', 2, 1));
    await wait(80);
    ok('(and it goes back when let go on nothing)', !document.body.classList.contains('dnd-active'));
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'HANDLING ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'handlingresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
