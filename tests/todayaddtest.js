var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var addBtn = function () { return document.getElementById('btn-today-add'); };
var input = function () { return document.querySelector('#today-body .ti-input'); };
var rows = function () { return [].slice.call(document.querySelectorAll('#today-body .today-item')); };
var texts = function () {
  return [].slice.call(document.querySelectorAll('#today-body .ti-text')).map(function (t) { return t.textContent; });
};
function uncat() {
  return Store.get().lists.filter(function (l) { return l.name === 'Uncategorized'; })[0];
}
function key(el, k) {
  var ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
}

setTimeout(function () {
  try {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    var noAnim = document.createElement('style');
    noAnim.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
    document.head.appendChild(noAnim);
    Store.reset();
    Store.mutate(function (s) { s.settings.panels.board.today = true; }, ['panels']);

    /* ============================================================
       the button itself
       ============================================================ */
    ok('there is a + in the Do Today header', !!addBtn());
    eq('...that says what it does', addBtn().title, 'New note for today');
    var actions = [].slice.call(document.querySelectorAll('#panel-today .panel-head-actions button'));
    eq('...sitting before the clock and the arrow', actions.indexOf(addBtn()), 0);
    eq('...with the clock still next to it', actions[1].id, 'btn-today-mode');
    eq('...and the arrow after that', actions[2].id, 'btn-today-mode' === actions[1].id ? actions[2].id : '', actions[2].id);
    ok('...the arrow being the panel close', actions[2].classList.contains('panel-close'));

    /* ============================================================
       writing one
       ============================================================ */
    eq('nothing is scheduled yet', Store.get().today.length, 0);
    var before = uncat().items.length;

    addBtn().click();
    var inp = input();
    ok('a box to type in appears', !!inp);
    ok('...ready for typing', document.activeElement === inp, document.activeElement.tagName);
    eq('...asking the obvious question', inp.placeholder, 'What needs doing?');
    eq('a note was made', uncat().items.length, before + 1);
    eq('...and it is in Do Today', Store.get().today.length, 1);
    eq('...living in Uncategorized', Store.get().today[0].listId, uncat().id);
    eq('...at the top of the list', Store.get().today[0].itemId, uncat().items[0].id);
    ok('...and it is empty until you write something', uncat().items[0].text === '');

    inp.value = 'Book the dentist';
    key(inp, 'Enter');

    ok('the box is gone once you press Enter', !input());
    eq('...and the words are the note', uncat().items[0].text, 'Book the dentist');
    eq('...showing in the dock', texts()[0], 'Book the dentist');
    eq('...still just the one', Store.get().today.length, 1);
    ok('...with its home named underneath',
       document.querySelector('#today-body .ti-src').textContent === 'Uncategorized');
    eq('...and counted', document.getElementById('today-count').textContent, '0 / 1 done');

    /* it is an ordinary note from here on */
    var row = rows()[0];
    row.querySelector('.note-check').click();
    ok('it ticks off like any other', uncat().items[0].done === true);
    eq('...and the count follows', document.getElementById('today-count').textContent, '1 / 1 done');
    row = rows()[0];
    row.querySelector('.ti-x').click();
    eq('taking it out of today leaves the note alone', uncat().items.length, before + 1);
    eq('...but off the list', Store.get().today.length, 0);

    /* ============================================================
       a second one goes above the first
       ============================================================ */
    Store.reset();
    Store.mutate(function (s) { s.settings.panels.board.today = true; }, ['panels']);
    addBtn().click();
    input().value = 'First';
    key(input(), 'Enter');
    addBtn().click();
    input().value = 'Second';
    key(input(), 'Enter');
    eq('two of them now', Store.get().today.length, 2);
    eq('the newest is on top', texts()[0], 'Second');
    eq('...pushing the other down', texts()[1], 'First');
    eq('and both live in Uncategorized', uncat().items.length, 2);

    /* ============================================================
       changing your mind
       ============================================================ */
    var was = uncat().items.length, wasToday = Store.get().today.length;
    addBtn().click();
    key(input(), 'Escape');
    eq('Escape leaves no note behind', uncat().items.length, was);
    eq('...and nothing on the list', Store.get().today.length, wasToday);
    ok('...and no empty box', !input());

    addBtn().click();
    key(input(), 'Enter');
    eq('Enter on an empty box does the same', uncat().items.length, was);
    eq('...nothing added', Store.get().today.length, wasToday);

    addBtn().click();
    input().blur();
    eq('so does clicking away from an empty one', uncat().items.length, was);

    addBtn().click();
    input().value = 'Written then clicked away';
    input().blur();
    eq('but clicking away from a written one keeps it', Store.get().today.length, wasToday + 1);
    eq('...with the words', uncat().items[0].text, 'Written then clicked away');
    ok('...and the box is gone', !input());

    /* ============================================================
       on the timeline
       ============================================================ */
    Store.reset();
    Store.mutate(function (s) {
      s.settings.panels.board.today = true;
      s.settings.todayTimeline = true;
    }, ['panels', 'today']);
    addBtn().click();
    ok('the timeline gets a box too', !!input());
    input().value = 'No time on it yet';
    key(input(), 'Enter');
    ok('an untimed note waits under "No time set"',
       !!document.querySelector('#today-body .unscheduled-head'));
    ok('...and is not inside an hour', !document.querySelector('.hour-slot .today-item'));
    Store.mutate(function (s) { s.settings.todayTimeline = false; }, ['today']);

    /* ============================================================
       where a note goes when Uncategorized is not there
       ============================================================ */
    eq('normally it is the catch-all column', Store.inbox().name, 'Uncategorized');
    var u = uncat();
    Store.mutate(function () { u.name = 'Odds and ends'; }, ['lists']);
    eq('renamed, the first category takes them', Store.inbox().id, Store.get().lists[0].id);
    Store.mutate(function () { u.name = 'Uncategorized'; }, ['lists']);

    Store.get().lists.slice().forEach(function (l) { Store.deleteList(l.id); });
    eq('with no categories at all there are none', Store.get().lists.length, 0);
    var made = Store.inbox();
    eq('...so one is made', made.name, 'Uncategorized');
    eq('...and it is the only one', Store.get().lists.length, 1);
    addBtn().click();
    input().value = 'Still works from nothing';
    key(input(), 'Enter');
    eq('a note can still be written', Store.get().today.length, 1);
    eq('...into the new category', Store.get().lists[0].items[0].text, 'Still works from nothing');

    /* the column does not have to be open on the board */
    ok('and its column is not forced onto the board',
       Store.get().board.indexOf(Store.get().lists[0].id) === -1 ||
       Store.get().board.length <= 1);
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }
  document.title = 'TODAYADD ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre'); pre.id = 'taresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2400);
