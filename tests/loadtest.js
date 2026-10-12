/*
 * Opening the app on a board that is already saved.
 *
 * Every other suite starts on an empty browser, so the path a real device
 * takes every morning — reading its own saved board — was never run. A
 * mistake there does not look like a mistake: load() falls back to a fresh
 * example board, and the first save writes it over the real one.
 *
 * First pass saves a board and reloads; second pass checks what opened.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var STAGE = 'flowlist.loadtest.stage';

setTimeout(function () {
  if (sessionStorage.getItem(STAGE) !== 'saved') {
    var st = JSON.parse(Store.exportState());
    delete st.settings.completedMade;                 // a board from before Completed existed
    st.lists = [{ id: 'Lsaved', name: 'Saved board', color: '#5cc8ff', collapsed: false, items: [
      { id: 'Nmine', text: 'Mine, from before', detail: '', expanded: false, done: false, hour: null }
    ] }];
    st.board = ['Lsaved'];
    st.closedOrder = [];
    st.today = [{ listId: 'Lsaved', itemId: 'Nmine' }];
    Store.importJSON(JSON.stringify(st));
    Store.flush();
    sessionStorage.setItem(STAGE, 'saved');
    location.reload();
    return;
  }
  sessionStorage.removeItem(STAGE);

  Promise.resolve().then(function () {
    var names = Store.get().lists.map(function (l) { return l.name; });
    ok('the saved board opens, not the examples', names.indexOf('Saved board') !== -1, names.join(','));
    ok('...with its note', !!Store.itemById('Lsaved', 'Nmine'));
    ok('...still on Do Today', Store.inToday('Lsaved', 'Nmine'));
    eq('...and no example category crept in', names.indexOf('Work'), -1);
    ok('Completed is added to it', names.indexOf('Completed') !== -1, names.join(','));
    eq('...once', names.filter(function (n) { return n === 'Completed'; }).length, 1);
  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'LOAD ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'loadresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
