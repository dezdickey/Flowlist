/*
 * Rooms and their counts.
 *
 * The incident this guards against: a phone at revision 470 in one room was
 * pointed at the laptop's room, which stood at 380. The phone called the
 * laptop's board "older" and ignored it, and its next change would have gone
 * out at 471 — its own board over the laptop's — which the laptop would then
 * have taken as newer, losing its 42 notes. Only a mistyped password stopped
 * it. Every scenario below is some road to that same place.
 *
 * The browser's crypto is replaced with a stand-in that is instant and
 * deterministic, because this harness runs on a virtual clock that races
 * past the real thing. It keeps the one property that matters here: a board
 * sealed for one room under one password opens only for that room and that
 * password.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var URL_DB = 'https://demo-default-rtdb.firebaseio.com';

/* ---- a database with more than one room in it ---- */
var DB = {}, PUTS = [], hold = null, failPut = 0;
window.fetch = function (url, opt) {
  var m = String(url).match(/\/rooms\/([^.\/]+)\.json/);
  if (String(url).indexOf('firebaseio') === -1 || !m) return Promise.reject(new Error('not the database'));
  var room = decodeURIComponent(m[1]);
  var answer = function () {
    if (opt && opt.method === 'PUT') {
      if (failPut > 0) { failPut--; return { ok: false, status: 500 }; }
      var d = JSON.parse(opt.body);
      DB[room] = d;
      PUTS.push({ room: room, doc: d });
      return { ok: true, status: 200 };
    }
    var doc = DB[room] === undefined ? null : JSON.parse(JSON.stringify(DB[room]));
    return { ok: true, status: 200, json: function () { return Promise.resolve(doc); } };
  };
  if (hold) {
    var h = hold; hold = null;
    return new Promise(function (res) { h.release = function () { res(answer()); }; });
  }
  return Promise.resolve(answer());
};

var streams = [];
function StubES(url) { this.url = url; this.listeners = {}; this.closed = false; streams.push(this); }
StubES.prototype.addEventListener = function (k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); };
StubES.prototype.close = function () { this.closed = true; };
StubES.prototype.fire = function (k, data) {
  (this.listeners[k] || []).forEach(function (fn) { fn({ data: JSON.stringify(data) }); });
};
var lastStream = function () { return streams[streams.length - 1]; };

/* ---- crypto that keeps rooms and passwords apart, instantly ---- */
var enc = function (s) { return new TextEncoder().encode(s); };
var dec = function (b) { return new TextDecoder().decode(b instanceof ArrayBuffer ? new Uint8Array(b) : b); };
function binary(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return s;
}
var realCrypto = window.crypto;
var fakeSubtle = {
  importKey: function (fmt, raw) { return Promise.resolve({ pw: dec(raw) }); },
  deriveBits: function (p, base) {
    var seed = base.pw + '#' + dec(p.salt), out = new Uint8Array(16), h = 2166136261;
    for (var i = 0; i < 16; i++) {
      for (var j = 0; j < seed.length; j++) { h ^= seed.charCodeAt(j) + i; h = Math.imul(h, 16777619) >>> 0; }
      out[i] = h & 255;
    }
    return Promise.resolve(out.buffer);
  },
  digest: function (alg, data) { return Promise.resolve({ salt: dec(data) }); },
  deriveKey: function (p, base) { return Promise.resolve({ tag: base.pw + '|' + p.salt.salt }); },
  encrypt: function (p, key, data) {
    return Promise.resolve(enc(JSON.stringify({ k: key.tag, d: dec(data) })).buffer);
  },
  decrypt: function (p, key, data) {
    var box;
    try { box = JSON.parse(dec(data)); } catch (e) { return Promise.reject(new Error('garbage')); }
    if (box.k !== key.tag) return Promise.reject(new Error('wrong key'));
    return Promise.resolve(enc(box.d).buffer);
  }
};
function useFakeCrypto() {
  Object.defineProperty(window, 'crypto', {
    value: { subtle: fakeSubtle, getRandomValues: function (a) { return realCrypto.getRandomValues(a); } },
    configurable: true
  });
}
/** A board as another device would have sealed it for this room under these words. */
function sealFor(room, words, payload) {
  var bytes = enc(JSON.stringify({ k: words + '|flowlist:' + room, d: JSON.stringify(payload) }));
  return { v: 1, iv: 'AAAAAAAAAAAAAAAA', data: btoa(binary(bytes)) };
}

/* ---- boards ---- */
function board(spec) {
  var st = JSON.parse(Store.exportState());
  st.lists = []; st.board = []; st.today = []; st.closedOrder = [];
  Object.keys(spec).forEach(function (name) {
    var id = 'L' + name.replace(/\W/g, '');
    st.lists.push({ id: id, name: name, color: '#5cc8ff', collapsed: false,
      items: spec[name].map(function (t) {
        return { id: 'N' + t.replace(/\W/g, ''), text: t, detail: '', expanded: false, done: false, hour: null };
      }) });
    st.board.push(id);
  });
  return st;
}
var textsOf = function (st) {
  return [].concat.apply([], (st.lists || []).map(function (l) { return (l.items || []).map(function (i) { return i.text; }); }));
};
var notesHere = function () { return textsOf(Store.get()); };
var has = function (list, want) { return want.every(function (w) { return list.indexOf(w) !== -1; }); };
var cfg = function () { return Store.settings().sync; };

/* sync's own setter, so setting up a scenario never marks the board unsent */
function setup(o) {
  var keys = Object.keys(o);
  if (keys.indexOf('room') !== -1) Sync.setLocal('room', o.room);   // first: it resets the count
  keys.forEach(function (k) { if (k !== 'room') Sync.setLocal(k, o[k]); });
}
function fresh(st, o) {
  Sync.stop();
  Sync.setLocal('on', false);
  Store.importJSON(JSON.stringify(st));
  Sync.throwAside();
  Sync.setAgreed(null);
  Sync.setPassphrase('');
  setup(Object.assign({ url: URL_DB, device: 'Phone', warn: false, gate: false, remember: false, tries: 0 }, o));
  Sync.setLocal('dirty', false);
  Sync.setLocal('on', o.on === undefined ? true : o.on);
  PUTS = [];
}
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 80); }); };

var PC_BOARD = { 'PC work': ['PC note A', 'PC note B', 'PC note C'], 'PC home': ['PC note D'] };
var PC_NOTES = ['PC note A', 'PC note B', 'PC note C', 'PC note D'];

setTimeout(function () {
  (async function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    window.EventSource = StubES;
    useFakeCrypto();
    Sync.stop();

    /* ============================================================
       1. the incident: a device at 470 is pointed at a room at 380
       ============================================================ */
    fresh(board({ 'Phone list': ['Phone only one', 'Phone only two'] }), { room: 'board-phoneroom', rev: 470 });
    Sync.setAgreed(board({ 'Phone list': ['Phone only one', 'Phone only two'] }));
    DB['board-pcroom'] = { rev: 380, at: Date.now(), from: 'Desktop', state: board(PC_BOARD) };

    Sync.connect();
    var oldStream = lastStream();
    Sync.setLocal('room', 'board-pcroom');
    eq('a new room starts the count again', cfg().rev, 0);
    eq('...owes the new room nothing', cfg().dirty, false);
    eq('...and forgets the copy agreed with the old room', Sync.lastAgreed(), null);
    ok('...and stops listening to the old room', oldStream.closed);

    /* a message already on its way from the old room */
    oldStream.fire('put', { path: '/', data: { rev: 471, from: 'Phone', state: board({ Stale: ['From the old room'] }) } });
    await wait();
    ok('late news from the old room is not taken', notesHere().indexOf('From the old room') === -1, notesHere().join(','));
    eq('...and does not set the count', cfg().rev, 0);

    Sync.connect();
    ok('the stream now listens to the new room', lastStream().url.indexOf('board-pcroom') !== -1, lastStream().url);
    lastStream().fire('put', { path: '/', data: DB['board-pcroom'] });
    await wait();
    ok('the laptop board is taken, all of it', has(notesHere(), PC_NOTES), notesHere().join(','));
    eq('...at the room\'s revision', cfg().rev, 380);
    eq('...sending nothing', PUTS.length, 0);
    eq('...so the room is still the laptop\'s', DB['board-pcroom'].rev, 380);
    var kept = Sync.aside();
    ok('what the phone had is kept aside', !!kept && kept.notes === 2, JSON.stringify(kept));

    Store.addList('Added on the phone');
    await wait(1600);
    eq('a change afterwards goes out once', PUTS.length, 1);
    ok('...to the laptop\'s room', PUTS.length === 1 && PUTS[0].room === 'board-pcroom');
    ok('...one past the laptop, not past the phone\'s old count', PUTS.length === 1 && PUTS[0].doc.rev === 381,
       PUTS.length && PUTS[0].doc.rev);
    ok('...carrying every laptop note', PUTS.length === 1 && has(textsOf(PUTS[0].doc.state), PC_NOTES));

    /* ---- bringing back what was kept ---- */
    Themes.openDrawer();
    var backBtn = [].slice.call(document.querySelectorAll('#settings-body button'))
      .filter(function (b) { return /^Bring back those 2 notes/.test(b.textContent); })[0];
    ok('Settings offers to bring them back', !!backBtn);
    PUTS = [];
    if (backBtn) backBtn.click();
    Themes.closeDrawer();
    ok('bringing back adds the phone notes', has(notesHere(), ['Phone only one', 'Phone only two']), notesHere().join(','));
    ok('...without losing any laptop note', has(notesHere(), PC_NOTES));
    eq('...and the kept copy is gone', Sync.aside(), null);
    await wait(1600);
    ok('...and it goes out like any change', PUTS.length === 1 && PUTS[0].doc.rev === 382 &&
       has(textsOf(PUTS[0].doc.state), PC_NOTES.concat(['Phone only one'])), PUTS.length);

    /* ============================================================
       2. a change made before the room's board has arrived
       ============================================================ */
    fresh(board({ 'Laptop list': ['Laptop thought'] }), { room: 'board-laptopold', rev: 55 });
    DB['board-shared'] = { rev: 200, at: Date.now(), from: 'Desktop', state: board(PC_BOARD) };
    Sync.setLocal('room', 'board-shared');
    Store.addList('Typed before anything arrived');
    await wait(1600);
    eq('the first send to a room looks first, and sends once', PUTS.length, 1);
    ok('...on top of the room, not at revision 1', PUTS.length === 1 && PUTS[0].doc.rev === 201,
       PUTS.length && PUTS[0].doc.rev);
    ok('...keeping every note already in the room', PUTS.length === 1 && has(textsOf(PUTS[0].doc.state), PC_NOTES),
       PUTS.length && textsOf(PUTS[0].doc.state).join(','));
    ok('...and this device\'s own', PUTS.length === 1 && has(textsOf(PUTS[0].doc.state), ['Laptop thought']));
    ok('this device now has the room\'s notes too', has(notesHere(), PC_NOTES));

    /* an empty room still just gets this board */
    fresh(board({ Mine: ['First ever'] }), { room: 'board-brandnew', rev: 0 });
    Store.addList('Something');
    await wait(1600);
    ok('an empty room gets this board at revision 1', PUTS.length === 1 && PUTS[0].doc.rev === 1 &&
       has(textsOf(PUTS[0].doc.state), ['First ever']), PUTS.length);

    /* ============================================================
       3. a slow read from the old room lands after the switch
       ============================================================ */
    fresh(board({ Mine: ['Here'] }), { room: 'board-one', rev: 4 });
    DB['board-one'] = { rev: 9, at: Date.now(), from: 'X', state: board({ 'Old room': ['From room one'] }) };
    hold = {};
    var h = hold;
    Sync.pull();
    Sync.setLocal('room', 'board-two');
    h.release();
    await wait();
    ok('a read from the room this device just left is dropped', notesHere().indexOf('From room one') === -1,
       notesHere().join(','));
    eq('...and the new room\'s count is untouched', cfg().rev, 0);

    /* ============================================================
       4. a board these words cannot open is never written over
       ============================================================ */
    fresh(board({ Mine: ['Private one'] }), { room: 'board-a', rev: 10 });
    Sync.setPassphrase('words for this device');
    DB['board-locked'] = { rev: 90, at: Date.now(),
      enc: sealFor('board-locked', 'other words entirely', { from: 'Desktop', state: board(PC_BOARD) }) };
    Sync.setLocal('room', 'board-locked');
    Store.addList('Edited here');
    await wait(1600);
    eq('an edit does not go over a board this device cannot open', PUTS.length, 0);
    ok('...and says why', Sync.status().error.length > 0, Sync.status().error);
    Sync.pushNow();
    await wait();
    eq('...nor does the send button', PUTS.length, 0);
    Sync.setLocal('rev', 95);                      // even with a history in the room
    Sync.pushNow();
    await wait();
    eq('...nor does a device that has sent there before', PUTS.length, 0);
    eq('the room is exactly as it was', DB['board-locked'].rev, 90);

    /* ============================================================
       5. a room that is behind this device
       ============================================================ */
    fresh(board({ Mine: ['Kept here one', 'Kept here two'] }), { room: 'board-behind', rev: 99 });
    Sync.setAgreed(board({ Mine: ['Kept here one', 'Kept here two'] }));
    DB['board-behind'] = { rev: 12, at: Date.now(), from: 'Old tablet', state: board({ Tablet: ['Tablet note'] }) };
    Sync.connect();
    lastStream().fire('put', { path: '/', data: DB['board-behind'] });
    await wait(200);
    ok('a room that is really behind is not ignored: both boards are kept here',
       has(notesHere(), ['Kept here one', 'Kept here two', 'Tablet note']), notesHere().join(','));
    ok('...and the room gets both, one past this device', PUTS.length === 1 && PUTS[0].doc.rev === 100 &&
       has(textsOf(PUTS[0].doc.state), ['Kept here one', 'Tablet note']), PUTS.length && PUTS[0].doc.rev);

    PUTS = [];
    lastStream().fire('put', { path: '/', data: { rev: 50, at: Date.now(), from: 'X', state: board({ Late: ['Late news'] }) } });
    await wait(200);
    eq('late news, when the room has already moved on, changes nothing', PUTS.length, 0);
    ok('...and is not taken', notesHere().indexOf('Late news') === -1);

    /* ============================================================
       6. logging in finds the board the device is set to
       ============================================================ */
    var P = 'the password the laptop uses', Q = 'some other password';
    var dP = await Sync.roomFor(P), dQ = await Sync.roomFor(Q);
    ok('the stand-in crypto gives different words different rooms', dP !== dQ && /^board-/.test(dP), dP + ' ' + dQ);
    DB['board-laptop'] = { rev: 380, at: Date.now(),
      enc: sealFor('board-laptop', P, { from: 'Desktop', state: board(PC_BOARD) }) };

    fresh(board({ 'Phone list': ['Phone only one'] }), { room: 'board-laptop', rev: 0, on: false });
    var r = await Sync.unlockWith(P);
    ok('a room typed in by hand is kept when the password opens it', r.ok && r.found && r.room === 'board-laptop',
       JSON.stringify(r));
    eq('...and the device stays in it', cfg().room, 'board-laptop');
    ok('...holding the password', Sync.hasPassphrase());

    fresh(board({ 'Phone list': ['Phone only one'] }), { room: 'board-laptop', rev: 0, on: false });
    r = await Sync.unlockWith('not the right one');
    ok('a wrong password on a room with a board says so', r.ok === false && r.found === true && r.room === 'board-laptop',
       JSON.stringify(r));
    eq('...the device is still set to that room', cfg().room, 'board-laptop');
    ok('...holding no password', !Sync.hasPassphrase());
    eq('...and sync is not switched on', cfg().on, false);

    DB[dQ] = { rev: 5, at: Date.now(), enc: sealFor(dQ, Q, { from: 'Tablet', state: board({ Tablet: ['Tablet note'] }) }) };
    fresh(board({}), { room: 'board-emptyroom', rev: 0, on: false });
    r = await Sync.unlockWith(Q);
    ok('an empty room set here gives way to the one the password opens', r.ok && r.found && r.room === dQ && !r.skipped,
       JSON.stringify(r));

    fresh(board({}), { room: 'board-laptop', rev: 0, on: false });
    r = await Sync.unlockWith(Q);
    ok('a room these words do not open gives way to one they do', r.ok && r.found && r.room === dQ,
       JSON.stringify(r));
    eq('...and says which room it passed over', r.skipped, 'board-laptop');

    fresh(board({}), { room: 'board-emptyroom', rev: 0, on: false });
    var never = 'never used anywhere';
    r = await Sync.unlockWith(never);
    ok('nothing anywhere: no board found, in the password\'s own room',
       r.ok && r.found === false && r.room === (await Sync.roomFor(never)), JSON.stringify(r));

    /* ---- the same through the password screen ---- */
    fresh(board({ 'Phone list': ['Phone only one'] }), { room: 'board-laptop', rev: 0, on: false, gate: true });
    Lock.open();
    Lock.resetTries();
    Lock.submit('not the right one');
    await wait(300);
    ok('the screen does not offer a new board over a board that is there',
       !document.querySelector('#lockscreen .lk-ask'));
    var note = (document.querySelector('#lk-note') || {}).textContent || '';
    ok('...it says the password does not open it', note.indexOf('does not open') !== -1, note);
    ok('...naming the room by its ending', note.indexOf('ptop') !== -1, note);
    ok('...and stays up', Lock.isShowing());
    Lock.submit(P);
    await wait(400);
    ok('the right password opens it', !Lock.isShowing());
    eq('...in the room the device was set to', cfg().room, 'board-laptop');
    ok('...with the laptop board on screen', has(notesHere(), PC_NOTES), notesHere().join(','));
    eq('...at the laptop\'s revision', cfg().rev, 380);
    eq('...having sent nothing', PUTS.length, 0);

    /* ============================================================
       7. changing the password: a failure puts the old room back as it was
       ============================================================ */
    Sync.stop();
    var agreedBefore = JSON.stringify(Sync.lastAgreed());
    ok('(set up: there is an agreed copy to lose)', agreedBefore !== 'null');
    failPut = 1;
    r = await Sync.changePassphrase('brand new words here');
    await wait();
    ok('a failed move says so', r.ok === false, JSON.stringify(r));
    eq('...the device is back in the old room', cfg().room, 'board-laptop');
    eq('...at the old room\'s revision', cfg().rev, 380);
    eq('...with the agreed copy it had', JSON.stringify(Sync.lastAgreed()), agreedBefore);
    eq('...and the old password', Sync.heldPassphrase(), P);
    eq('...and the old room untouched', DB['board-laptop'].rev, 380);

    failPut = 0;
    var newRoom = await Sync.roomFor('brand new words here');
    r = await Sync.changePassphrase('brand new words here');
    await wait();
    ok('a move that works lands in the new room', r.ok && cfg().room === newRoom, JSON.stringify(r));
    eq('...counting from the start there', cfg().rev, 1);
    ok('...and listens to it', !!lastStream() && !lastStream().closed && lastStream().url.indexOf(newRoom) !== -1);

    /* ============================================================
       8. a board of nothing but the examples keeps nothing aside
       ============================================================ */
    Sync.stop();
    Sync.setLocal('on', false);
    Store.reset();
    Sync.throwAside();
    setup({ room: 'board-example', rev: 7, url: URL_DB });
    Sync.setPassphrase('');
    Sync.setLocal('on', true);
    DB['board-pcroom'] = { rev: 390, at: Date.now(), from: 'Desktop', state: board(PC_BOARD) };
    Sync.setLocal('room', 'board-pcroom');
    await Sync.pull();
    await wait();
    ok('joining takes the room board', has(notesHere(), PC_NOTES), notesHere().join(','));
    eq('...and keeps no copy of the example notes', Sync.aside(), null);
    Sync.stop();
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'ROOM ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'roomresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
