/*
 * Naming a note on a phone.
 *
 * A note's text is read-only on a phone, so a tap on a note does not
 * start a rename by accident. But a read-only field brings no keyboard up
 * when it is focused, so + made a note and left nothing to type with, and
 * a note with no name could not be given one without going through the
 * menu. Now:
 *
 *   · + (and Enter, and Add note above/below) opens the new note for typing
 *   · a tap on any note with no name opens it for a name
 *   · a tap on a named note, or a hold on any note, still does not
 *
 * What is checked is what brings a keyboard up — the field is editable and
 * it takes focus inside the tap. The keyboard itself needs a real phone.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 60); }); };

function board(extra) {
  var st = JSON.parse(Store.exportState());
  var items = [
    { id: 'Nnamed', text: 'Has a name', detail: '', expanded: false, done: false, hour: null },
    { id: 'Nblank', text: '', detail: '', expanded: false, done: false, hour: null },
    { id: 'Nspaces', text: '   ', detail: 'kept details', expanded: false, done: false, hour: null }
  ];
  for (var i = 0; i < (extra || 0); i++) items.push({ id: 'Nfill' + i, text: 'Filler ' + i, detail: '', expanded: false, done: false, hour: null });
  st.lists = [{ id: 'Lwork', name: 'Work', color: '#5cc8ff', collapsed: false, items: items }];
  st.board = ['Lwork']; st.closedOrder = [];
  st.today = [{ listId: 'Lwork', itemId: 'Nblank' }, { listId: 'Lwork', itemId: 'Nnamed' }];
  st.settings.layout = 'phone';
  st.settings.todayTimeline = false;
  return st;
}
var note = function (id) { return document.querySelector('#board [data-list-id="Lwork"] [data-item-id="' + id + '"]'); };
var textOf = function (id) { var n = note(id); return n && n.querySelector('.note-text'); };
var editing = function (ta) { return !!ta && document.activeElement === ta && ta.readOnly === false; };
function touch(el, type) {
  var r = el.getBoundingClientRect();
  var o = { bubbles: true, cancelable: true, pointerType: 'touch', button: 0, isPrimary: true,
            clientX: r.left + Math.min(40, r.width / 2), clientY: r.top + r.height / 2 };
  el.dispatchEvent(new PointerEvent(type, o));
}
/* a tap: down, up, then the click a phone sends after */
function tap(el) {
  touch(el, 'pointerdown');
  touch(el, 'pointerup');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}
function blurAll() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }

setTimeout(function () {
  (async function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    Store.importJSON(JSON.stringify(board()));
    Mobile.apply();
    Store.emit(['board']);                  // drawn again in the phone shape
    await wait(400);
    ok('(this is the phone layout)', document.body.classList.contains('phone'));
    ok('(a named note is read-only, as before)', textOf('Nnamed').readOnly === true);

    /* ---------- + on a list ---------- */
    var before = Store.listById('Lwork').items.length;
    document.querySelector('#board [data-list-id="Lwork"] .act-add').click();
    var fresh = Store.listById('Lwork').items[0];
    ok('+ makes a note at the top', Store.listById('Lwork').items.length === before + 1 && fresh.text === '');
    var ta = textOf(fresh.id);
    ok('...and opens it for typing straight away', editing(ta),
       'active=' + (document.activeElement && document.activeElement.className) + ' readOnly=' + (ta && ta.readOnly));
    ta.value = 'Typed on the phone';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    eq('...what is typed is its name', Store.itemById('Lwork', fresh.id).text, 'Typed on the phone');
    blurAll();
    ok('...and it locks again once you are done', ta.readOnly === true);

    /* ---------- Enter makes the next one, open for typing ---------- */
    Rename.open(note(fresh.id));
    textOf(fresh.id).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    var next = Store.listById('Lwork').items[1];
    ok('Enter makes a note below, open for typing', next.text === '' && editing(textOf(next.id)));
    blurAll();

    /* ---------- Add note below, from the menu ---------- */
    await wait(400);
    note('Nnamed').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }));
    var below = [].slice.call(document.querySelectorAll('#ctx .ctx-item'))
      .filter(function (b) { return /Add note below/.test(b.textContent); })[0];
    ok('(the menu offers Add note below)', !!below);
    var idx = Store.listById('Lwork').items.findIndex(function (i) { return i.id === 'Nnamed'; });
    if (below) below.click();
    var made = Store.listById('Lwork').items[idx + 1];
    ok('Add note below opens the new note for typing', !!made && made.text === '' && editing(textOf(made.id)));
    blurAll();

    /* ---------- a tap on a note with no name ---------- */
    await wait(400);
    tap(textOf('Nblank'));
    ok('a tap on a note with no name opens it for a name', editing(textOf('Nblank')));
    blurAll();
    ok('...locked again after', textOf('Nblank').readOnly === true);

    await wait(400);
    tap(note('Nspaces'));
    ok('...a name of nothing but spaces counts as no name, tapped anywhere on the note', editing(textOf('Nspaces')));
    blurAll();

    /* ---------- but not on a named note ---------- */
    await wait(400);
    tap(textOf('Nnamed'));
    ok('a tap on a named note does not open it', !editing(textOf('Nnamed')));
    blurAll();

    /* ---------- nor a hold ---------- */
    await wait(400);
    var blankEl = note('Nblank');
    touch(blankEl, 'pointerdown');
    await wait(600);                                  // held past the pick-up
    touch(blankEl, 'pointerup');
    blankEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(80);
    ok('holding a note with no name picks it up rather than opening it', !editing(textOf('Nblank')));
    blurAll();

    /* a press held down without the drag engine taking it, so the note is not redrawn under it */
    await wait(400);
    blankEl = note('Nblank');
    blankEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0, clientX: 60, clientY: 60 }));
    await wait(600);
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', button: 0, clientX: 60, clientY: 60 }));
    blankEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    ok('...nor does a long press that picks nothing up', !editing(textOf('Nblank')));
    blurAll();

    /* ---------- nor the tick or the arrow ---------- */
    await wait(400);
    tap(note('Nblank').querySelector('.note-check'));
    ok('ticking a note with no name does not open the keyboard', !editing(textOf('Nblank')));
    Store.setDone('Lwork', 'Nblank', false);
    blurAll();

    /* ---------- nor a tap in its details box ---------- */
    await wait(400);
    tap(note('Nspaces').querySelector('.note-detail'));
    ok('a tap in the details box of a note with no name leaves the name alone', !editing(textOf('Nspaces')));
    blurAll();

    /* ---------- nor on a computer ---------- */
    Store.mutate(function (s) { s.settings.layout = 'desktop'; }, ['settings']);
    Mobile.apply();
    await wait(400);
    ok('(back to the desktop layout)', !document.body.classList.contains('phone'));
    document.querySelector('#board [data-list-id="Lwork"] .act-add').click();
    var deskNote = Store.listById('Lwork').items[0];
    ok('on a computer + still puts the cursor in the new note', document.activeElement === textOf(deskNote.id));
    blurAll();
    Store.deleteNote('Lwork', deskNote.id);
    Store.mutate(function (s) { s.settings.layout = 'phone'; }, ['settings']);
    Mobile.apply();
    await wait(400);

    /* ---------- + with the column scrolled down ---------- */
    Store.importJSON(JSON.stringify(board(40)));
    Mobile.apply();
    await wait(300);
    var body = document.querySelector('#board [data-list-id="Lwork"] .list-body');
    body.scrollTop = body.scrollHeight;
    await wait(100);
    ok('(the column is scrolled well down)', body.scrollTop > 200, body.scrollTop);
    document.querySelector('#board [data-list-id="Lwork"] .act-add').click();
    await wait(200);
    var top = Store.listById('Lwork').items[0];
    var nb = note(top.id).getBoundingClientRect(), bb = document.querySelector('#board [data-list-id="Lwork"] .list-body').getBoundingClientRect();
    ok('a note made at the top of a scrolled column is brought into view', nb.top >= bb.top - 1 && nb.bottom <= bb.bottom + 1,
       'note ' + Math.round(nb.top) + '..' + Math.round(nb.bottom) + ' body ' + Math.round(bb.top) + '..' + Math.round(bb.bottom));
    ok('...still open for typing', editing(textOf(top.id)));
    blurAll();
    Store.deleteNote('Lwork', top.id);

    /* ---------- Do Today ---------- */
    Store.importJSON(JSON.stringify(board()));
    Mobile.apply();
    Store.mutate(function (s) { s.settings.panels.board.today = true; }, ['panels', 'today']);   // the sheet is open, as it is when you tap in it
    await wait(500);
    ok('(the Do Today sheet is showing)', document.getElementById('panel-today').getBoundingClientRect().width > 100);
    var row = document.querySelector('#today-body .today-item[data-item-id="Nblank"]');
    ok('(the unnamed note is on Do Today)', !!row);
    tap(row);
    var inp = document.querySelector('#today-body .ti-input');
    ok('a tap on an unnamed row in Do Today opens a box to name it', !!inp && document.activeElement === inp);
    inp.value = 'Named in Do Today';
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    eq('...and the name is given to the note', Store.itemById('Lwork', 'Nblank') && Store.itemById('Lwork', 'Nblank').text, 'Named in Do Today');
    ok('...which stays in its list and on Do Today', Store.inToday('Lwork', 'Nblank'));

    Store.mutate(function () { Store.itemById('Lwork', 'Nblank').text = ''; }, ['today', 'board']);
    await wait(400);
    tap(document.querySelector('#today-body .today-item[data-item-id="Nblank"]'));
    inp = document.querySelector('#today-body .ti-input');
    ok('(open again)', !!inp);
    if (inp) inp.blur();
    await wait(50);
    ok('leaving it without a name keeps the note — it was already there', !!Store.itemById('Lwork', 'Nblank') && Store.inToday('Lwork', 'Nblank'));
    ok('...and the row goes back to normal', !document.querySelector('#today-body .ti-input') &&
       !!document.querySelector('#today-body .today-item[data-item-id="Nblank"]'));

    await wait(400);
    tap(document.querySelector('#today-body .today-item[data-item-id="Nnamed"]'));
    ok('a tap on a named row in Do Today opens nothing', !document.querySelector('#today-body .ti-input'));

    var count = Store.listById(Store.inbox().id).items.length;
    document.getElementById('btn-today-add').click();
    inp = document.querySelector('#today-body .ti-input');
    ok('+ in Do Today still opens a box', !!inp && document.activeElement === inp);
    if (inp) inp.blur();
    await wait(50);
    eq('...and one left empty is still taken away again', Store.listById(Store.inbox().id).items.length, count);
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'NAMETAP ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'nametapresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
