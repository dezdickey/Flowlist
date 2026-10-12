/*
 * When sync says something was brought together.
 *
 * The banner is for when the OTHER device changed things. A device working
 * on its own can still merge - coming back to a room it has no agreed copy
 * of, its own board is merged against its own last copy out there, and
 * everything in it counts as "kept". That is not news, and announcing it
 * as a merge with itself is worse than not announcing it.
 *
 * The log keeps all of it either way.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 80); }); };

var DB = null;
window.fetch = function (url, opt) {
  if (String(url).indexOf('firebaseio') === -1) return Promise.reject(new Error('not the database'));
  if (opt && opt.method === 'PUT') { DB = JSON.parse(opt.body); return Promise.resolve({ ok: true, status: 200 }); }
  var doc = DB ? JSON.parse(JSON.stringify(DB)) : null;
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(doc); } });
};
function StubES() { this.listeners = {}; this.closed = false; }
StubES.prototype.addEventListener = function (k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); };
StubES.prototype.close = function () { this.closed = true; };

var banner = function () {
  var el = document.getElementById('sync-note');
  return el && el.classList.contains('show') && el.classList.contains('merged')
    ? el.querySelector('.sn-title').textContent + ' / ' + el.querySelector('.sn-sub').textContent : '';
};
var mk = function (id, text) { return { id: id, text: text, detail: '', expanded: false, done: false, hour: null }; };
function boardOf(texts) {
  var st = JSON.parse(Store.exportState());
  st.lists = [{ id: 'Lwork', name: 'Work', color: '#5cc8ff', collapsed: false,
                items: texts.map(function (t, i) { return mk('N' + t.replace(/\W/g, ''), t); }) }];
  st.board = ['Lwork']; st.closedOrder = []; st.today = [];
  return st;
}
/* what is out there, as the named device left it */
function outThere(rev, from, texts) {
  return { rev: rev, at: Date.now(), from: from, state: boardOf(texts) };
}

setTimeout(function () {
  (async function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    window.EventSource = StubES;
    Sync.stop();

    Store.importJSON(JSON.stringify(boardOf(['Mine one', 'Mine two', 'Mine three'])));
    Sync.setPassphrase('');
    Sync.setAgreed(null);
    ['url', 'room', 'device', 'rev', 'dirty', 'warn'].forEach(function (k) {
      Sync.setLocal(k, { url: 'https://demo-default-rtdb.firebaseio.com', room: 'board-note', device: 'Laptop',
                         rev: 0, dirty: false, warn: true }[k]);
    });
    Sync.setLocal('on', true);
    Sync.clearLog();
    await wait(200);

    /* ---------- a device working on its own ---------- */
    DB = outThere(4, 'Laptop', ['Mine one', 'Mine two']);      // its own older copy out there
    Sync.hideNote();
    await Sync.pushNow();
    await wait(200);
    eq('a merge with this device\'s own copy says nothing', banner(), '');
    ok('...though the log has it', Sync.log().length === 1, JSON.stringify(Sync.log().length));
    ok('...and the board still has everything', Store.listById('Lwork').items.length === 3);

    /* ---------- the other device has nothing new ---------- */
    Sync.setAgreed(null);
    Sync.setLocal('rev', 0);
    DB = outThere(9, 'Phone', ['Mine one']);                   // only notes this device already has
    Sync.hideNote();
    await Sync.pushNow();
    await wait(200);
    eq('a merge that only kept this device\'s own notes says nothing either', banner(), '');

    /* ---------- the other device brought something ---------- */
    Sync.setAgreed(null);
    Sync.setLocal('rev', 0);
    DB = outThere(14, 'Phone', ['Mine one', 'From the phone']);
    Sync.hideNote();
    await Sync.pushNow();
    await wait(200);
    ok('a note that came from the phone is announced', /Brought together with Phone/.test(banner()), banner());
    ok('...and it says what came', /in from Phone/.test(banner()), banner());
    ok('...and the note is here', Store.listById('Lwork').items.some(function (i) { return i.text === 'From the phone'; }));

    /* ---------- the other device took something away ---------- */
    var agreed = JSON.parse(Store.exportState());
    Sync.setAgreed(agreed);
    Sync.setLocal('rev', 20);
    var theirs = JSON.parse(JSON.stringify(agreed));
    theirs.lists[0].items = theirs.lists[0].items.filter(function (i) { return i.text !== 'Mine two'; });
    DB = { rev: 21, at: Date.now(), from: 'Phone', state: theirs };
    Sync.hideNote();
    await Sync.pushNow();
    await wait(200);
    ok('a note the phone deleted is announced too', /Brought together with Phone/.test(banner()), banner());
    ok('...and it is gone from here', !Store.listById('Lwork').items.some(function (i) { return i.text === 'Mine two'; }));

    /* ---------- with the warning switched off ---------- */
    Sync.setLocal('warn', false);
    Sync.setAgreed(null);
    Sync.setLocal('rev', 0);
    DB = outThere(30, 'Phone', ['Mine one', 'Another from the phone']);
    Sync.hideNote();
    await Sync.pushNow();
    await wait(200);
    eq('with the notice switched off, nothing is shown at all', banner(), '');
    ok('...but the board still took it', Store.listById('Lwork').items.some(function (i) { return i.text === 'Another from the phone'; }));
    Sync.stop();
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'MERGENOTE ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'mergenoteresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
