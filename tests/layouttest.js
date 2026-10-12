/*
 * The computer and the phone keep their own layouts.
 *
 * Which panels are open and which lists are on the board belong to each
 * shape on its own. A board arriving by sync brings its notes, never how
 * the sending device was laid out — unless a part has been switched on in
 * Settings to cross over, and then only changes made on purpose do.
 *
 * One page plays both parts: it is the computer, then turned into the
 * phone shape, then back. Boards from "the other device" are built by hand
 * and handed to sync the way the stream would hand them over.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 80); }); };

var DB = null, PUTS = [];
window.fetch = function (url, opt) {
  if (String(url).indexOf('firebaseio') === -1) return Promise.reject(new Error('not the database'));
  if (opt && opt.method === 'PUT') { DB = JSON.parse(opt.body); PUTS.push(DB); return Promise.resolve({ ok: true, status: 200 }); }
  var doc = DB ? JSON.parse(JSON.stringify(DB)) : null;
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(doc); } });
};
function StubES() { this.listeners = {}; this.closed = false; }
StubES.prototype.addEventListener = function (k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); };
StubES.prototype.close = function () { this.closed = true; };

var S = function () { return Store.get(); };
var panel = function (k) { return !!S().settings.panels.board[k]; };
var L = function (shape, part) { return (S().layouts && S().layouts[shape] && S().layouts[shape][part]) || null; };
function shape(which) {
  Store.mutate(function (s) { s.settings.layout = which; }, null, { silent: true });
  Mobile.apply();
}
/* what the other device sends: this board, changed the way it would be */
function fromOther(rev, change) {
  var st = JSON.parse(Store.exportState());
  change(st);
  return { rev: rev, at: Date.now(), from: 'Other', state: st };
}
var noteText = function (id) { var i = Store.itemById('LA', id); return i && i.text; };

setTimeout(function () {
  (async function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    window.EventSource = StubES;
    Sync.stop();

    var st = JSON.parse(Store.exportState());
    st.lists = ['LA', 'LB', 'LC'].map(function (id) {
      return { id: id, name: 'List ' + id, color: '#5cc8ff', collapsed: false,
               items: [{ id: 'N' + id, text: 'Note in ' + id, detail: '', expanded: false, done: false, hour: null }] };
    });
    st.board = ['LA', 'LB']; st.closedOrder = ['LC']; st.today = [];
    st.settings.layout = 'desktop';
    st.settings.panels.board = { lists: true, presets: false, canvas: false, today: true };
    delete st.layouts;
    Store.importJSON(JSON.stringify(st));
    Mobile.apply();
    Layouts.record();
    ['url', 'room', 'device', 'rev', 'dirty', 'warn'].forEach(function (k) {
      Sync.setLocal(k, { url: 'https://demo-default-rtdb.firebaseio.com', room: 'board-layout', device: 'Laptop', rev: 5, dirty: false, warn: false }[k]);
    });
    Sync.setLocal('on', true);
    await wait(200);
    PUTS = [];

    /* ============================================================
       1. a change here is written down for this shape only
       ============================================================ */
    ok('(the computer shape)', !document.body.classList.contains('phone'));
    ok('where things already are is written down, not counted as a change', !!L('desktop', 'today') && L('desktop', 'today').at === 0);
    document.getElementById('btn-panel-today').click();
    ok('closing Do Today on the computer closes it here', !panel('today'));
    ok('...and is written down for the computer, with the time', L('desktop', 'today').v.board === false && L('desktop', 'today').at > 0);
    eq('...but not for the phone', L('phone', 'today'), null);
    await wait(1600);                                          // let that go out, so nothing is waiting

    /* ============================================================
       2. a board from the phone brings its notes, not its layout
       ============================================================ */
    var t = Date.now();
    await Sync.adopt(fromOther(10, function (s) {
      s.lists[0].items[0].text = 'Edited on the phone';
      s.settings.panels.board.lists = false;
      s.settings.panels.board.today = true;
      s.board = ['LC']; s.closedOrder = ['LA', 'LB'];
      s.settings.layout = 'phone';
      s.layouts = s.layouts || {};
      s.layouts.phone = {
        categories: { v: { board: false, canvas: false }, at: t },
        today: { v: { board: true, canvas: false }, at: t },
        lists: { v: { open: ['LC'], closed: ['LA', 'LB'], folded: [], bands: {} }, at: t }
      };
    }));
    await wait();
    eq('the edit made on the phone arrives', noteText('NLA'), 'Edited on the phone');
    ok('the phone closing Categories leaves it open on the computer', panel('lists'));
    ok('the phone having Do Today open leaves it closed on the computer', !panel('today'));
    eq('the lists open on the phone do not replace the computer\'s', S().board, ['LA', 'LB']);
    eq('the phone\'s shape setting is not taken either', S().settings.layout, 'desktop');
    ok('the phone\'s layout is carried along, for the phone', !!L('phone', 'lists') && L('phone', 'lists').v.open[0] === 'LC');

    /* ============================================================
       3. a part the phone was set to share does cross over
       ============================================================ */
    var t2 = Date.now() + 5;
    await Sync.adopt(fromOther(11, function (s) {
      s.settings.layoutShare.phone.today = true;
      s.settings.panels.board.today = true;
      s.layouts.phone.today = { v: { board: true, canvas: false }, at: t2 };
      s.layouts.desktop.today = { v: { board: true, canvas: false }, at: t2 };   // written for both, as the phone would
    }));
    await wait();
    ok('Do Today opened on the phone, shared, opens it on the computer', panel('today'));
    eq('...and nothing that was not shared moves', S().board, ['LA', 'LB']);
    ok('...Categories included', panel('lists'));

    /* ============================================================
       4. Settings on the computer: which of its changes reach the phone
       ============================================================ */
    Themes.openDrawer();
    var head = document.querySelector('#settings-body .layout-cross');
    ok('Settings has the choice on the computer', !!head && /change the phone too/.test(head.textContent), head && head.textContent);
    var rows = document.querySelectorAll('#settings-body [data-layout-part]');
    eq('...one switch for each part', [].map.call(rows, function (r) { return r.dataset.layoutPart; }),
       ['categories', 'presets', 'canvases', 'today', 'lists']);
    ok('...all off to begin with', [].every.call(rows, function (r) { return !r.querySelector('.switch').classList.contains('on'); }));
    document.querySelector('#settings-body [data-layout-part="lists"] .switch').click();
    Themes.closeDrawer();
    ok('switching one on is saved for the computer\'s changes', S().settings.layoutShare.desktop.lists === true &&
       S().settings.layoutShare.phone.lists === false);

    var phoneCatsAt = L('phone', 'categories').at;
    Store.closeList('LB');
    eq('closing a list here, shared, closes it for the phone too', L('phone', 'lists') && L('phone', 'lists').v.open, ['LA']);
    document.getElementById('btn-panel-lists').click();
    ok('closing Categories here, not shared, closes it here', !panel('lists'));
    ok('...and leaves the phone\'s alone', L('phone', 'categories').at === phoneCatsAt);
    document.getElementById('btn-panel-lists').click();          // open again
    await wait(1600);
    var last = PUTS[PUTS.length - 1];
    ok('what the computer sends carries the phone\'s share of it', !!last && last.state.layouts.phone.lists.v.open.join() === 'LA');
    ok('...and the notes, as ever', !!last && last.state.lists.length === 3);

    /* ============================================================
       5. merging keeps the layout apart too
       ============================================================ */
    var mine = { desktop: { today: { v: { board: true }, at: 50 }, lists: { v: { open: ['A'] }, at: 90 } } };
    var theirs = { desktop: { today: { v: { board: false }, at: 80 }, lists: { v: { open: ['B'] }, at: 90 } },
                   phone: { today: { v: { board: true }, at: 10 } } };
    var m = Merge.layouts(mine, theirs);
    ok('joining layouts: the later change wins', m.desktop.today.at === 80 && m.desktop.today.v.board === false);
    ok('...a tie keeps this device\'s', m.desktop.lists.v.open[0] === 'A');
    ok('...and a part only one side has is kept', !!m.phone && m.phone.today.at === 10);

    Store.addList('Unsent here');                              // this device has something waiting
    DB = fromOther(40, function (s) {
      s.lists[1].items[0].text = 'Edited while this was offline';
      s.settings.panels.board.presets = true;
      s.board = ['LC'];
      s.layouts.desktop.presets = { v: { board: true, canvas: false }, at: 1 };   // older than nothing: see below
    });
    DB.state.layouts.desktop.presets.at = Date.now() + 1000;     // the other computer opened Presets, later
    await Sync.pushNow();
    await wait(300);
    ok('a merge brings the other side\'s edit', Store.itemById('LB', 'NLB').text === 'Edited while this was offline');
    ok('...keeps the new list made here', S().lists.some(function (l) { return l.name === 'Unsent here'; }));
    eq('...keeps this computer\'s lists on the board', S().board, ['LA']);
    ok('...and takes a layout change the other computer made later', panel('presets'));
    document.getElementById('btn-panel-presets').click();     // tidy away

    /* ============================================================
       6. the phone shape has its own layout
       ============================================================ */
    Sync.stop();
    Store.mutate(function (s) { s.settings.layoutShare.phone.categories = true; }, null, { silent: true });
    var deskToday = JSON.stringify(L('desktop', 'today'));
    var deskCats = JSON.stringify(L('desktop', 'categories'));
    var phoneOpen = L('phone', 'lists').v.open.slice();
    shape('phone');
    await wait(400);
    ok('(the phone shape)', document.body.classList.contains('phone'));
    eq('turning into the phone puts the phone\'s lists on the board', S().board, phoneOpen);
    ok('...with its sheets down', !panel('lists') && !panel('today'));
    eq('...and that is not taken as the phone closing Do Today for the computer', JSON.stringify(L('desktop', 'today')), deskToday);
    eq('...nor Categories, though Categories is shared', JSON.stringify(L('desktop', 'categories')), deskCats);

    document.getElementById('btn-panel-lists').click();
    ok('opening Categories on the phone, shared, is written for the computer', L('desktop', 'categories').v.board === true &&
       L('desktop', 'categories').at > 0 && JSON.stringify(L('desktop', 'categories')) !== deskCats);
    var catsNow = JSON.stringify(L('desktop', 'categories'));
    document.getElementById('btn-panel-today').click();
    ok('opening Do Today on the phone swaps the sheets', panel('today') && !panel('lists'));
    eq('...and Categories going down to make room does not close it on the computer', JSON.stringify(L('desktop', 'categories')), catsNow);
    ok('...while Do Today, shared, is written for the computer', L('desktop', 'today').v.board === true && JSON.stringify(L('desktop', 'today')) !== deskToday);
    document.getElementById('btn-panel-today').click();
    ok('closing Do Today on the phone, shared, closes it for the computer', L('desktop', 'today').v.board === false);

    Store.openList('LB');
    ok('a list opened on the phone, not shared from the phone, stays off the computer\'s board', L('desktop', 'lists').v.open.indexOf('LB') === -1);

    document.getElementById('btn-panel-lists').click();
    Lists.reveal('LA', 'NLA');                                   // shuts the sheet to show the note
    ok('revealing a note shuts the phone\'s sheet', !panel('lists'));
    ok('...without closing Categories on the computer', L('desktop', 'categories').v.board === true);

    Themes.openDrawer();
    head = document.querySelector('#settings-body .layout-cross');
    ok('on the phone, Settings asks about changing the computer', !!head && /change the computer too/.test(head.textContent), head && head.textContent);
    ok('...showing the phone\'s own choices', document.querySelector('#settings-body [data-layout-part="today"] .switch').classList.contains('on') &&
       !document.querySelector('#settings-body [data-layout-part="lists"] .switch').classList.contains('on'));
    Themes.closeDrawer();

    /* ============================================================
       7. and back to the computer
       ============================================================ */
    shape('desktop');
    await wait(400);
    ok('turning back into the computer puts its own layout back', panel('lists') && !panel('today'));
    eq('...its own lists on the board', S().board, L('desktop', 'lists').v.open);
    ok('...without the list the phone opened', S().board.indexOf('LB') === -1);

    /* ============================================================
       8. a list deleted elsewhere is not a layout change
       ============================================================ */
    Store.openList('LC');
    await wait(1600);                                          // sent, so nothing is waiting
    Sync.setLocal('rev', 80);
    var phoneListsAt, deskListsAt;
    deskListsAt = L('desktop', 'lists').at;
    phoneListsAt = L('phone', 'lists').at;
    await Sync.adopt(fromOther(81, function (s) {
      s.lists = s.lists.filter(function (l) { return l.id !== 'LC'; });
      s.board = s.board.filter(function (id) { return id !== 'LC'; });
    }));
    await wait();
    ok('a list deleted on the other device leaves the board', S().board.indexOf('LC') === -1);
    ok('...without counting as a layout change here', L('desktop', 'lists').at === deskListsAt);
    ok('...or being passed on to the phone', L('phone', 'lists').at === phoneListsAt);
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'LAYOUT ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'layoutresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
