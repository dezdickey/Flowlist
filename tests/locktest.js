/*
 * The safety net around encryption — everything that must hold whether or not
 * the browser will actually encrypt for us.
 *
 * The encryption itself (PBKDF2 + AES-GCM) is not exercised here: this harness
 * runs on a virtual clock, which races straight past the browser's crypto
 * before it can answer. Those parts are checked in a real browser instead.
 * What is checked here is the part that matters most — that the app never
 * quietly sends readable notes when it has been told to lock them.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var PUTS = [], remote = null;
window.fetch = function (url, opt) {
  if (String(url).indexOf('firebaseio') === -1) return Promise.reject(new Error('not the database'));
  if (opt && opt.method === 'PUT') { remote = JSON.parse(opt.body); PUTS.push(remote); return Promise.resolve({ ok: true, status: 200 }); }
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(remote); } });
};
function StubES() { this.listeners = {}; this.closed = false; }
StubES.prototype.addEventListener = function (k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); };
StubES.prototype.close = function () { this.closed = true; };

function settle() {
  return Promise.resolve().then(function () {}).then(function () {}).then(function () {})
    .then(function () {}).then(function () {}).then(function () {});
}
function cfgSet(o) {
  Store.mutate(function (s) { Object.keys(o).forEach(function (k) { s.settings.sync[k] = o[k]; }); },
    null, { silent: true });
}
var titles = function () { return Store.get().lists.map(function (l) { return l.name; }).join(','); };

setTimeout(function () {
  Promise.resolve().then(function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    window.EventSource = StubES;

    /* ============================================================
       A BIG BOARD STILL GOES OUT

       Turning the encrypted bytes into base64 was one
       String.fromCharCode.apply(null, bytes), which hands every byte over
       as a separate argument. Stacks take a few tens of thousands of those
       and no more, so once a real board passed about a hundred kilobytes
       locked, every send threw "Maximum call stack size exceeded" and went
       on throwing, because boards do not shrink. Decoding was always a
       loop, so notes still arrived - which is what it looked like from the
       outside: 0 sent, 5 received.

       No crypto here on purpose: this is the byte-to-text step alone, so
       it runs at full speed on the virtual clock.
       ============================================================ */
    var big = new Uint8Array(400000);
    for (var bi = 0; bi < big.length; bi++) big[bi] = bi % 256;
    var encoded = null, threw = '';
    try { encoded = Sync.b64(big.buffer); } catch (e) { threw = (e && e.message) || String(e); }
    ok('a board far bigger than the stack allows still encodes', threw === '', threw);
    ok('...and is valid base64', typeof encoded === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded || ''));

    var back = threw ? new Uint8Array(0) : Sync.unb64(encoded);
    eq('...and comes back the same length', back.length, big.length);
    var same = back.length === big.length;
    for (var ci = 0; same && ci < back.length; ci += 997) same = back[ci] === big[ci];
    ok('...byte for byte', same);

    /* the chunk edge is where a loop like this goes wrong, so land on it exactly */
    [0x8000 - 1, 0x8000, 0x8000 + 1, 0x10000].forEach(function (n) {
      var a = new Uint8Array(n);
      for (var i = 0; i < n; i++) a[i] = (i * 7) % 256;
      var r = Sync.unb64(Sync.b64(a.buffer));
      var okk = r.length === n;
      for (var j = 0; okk && j < n; j += 13) okk = r[j] === a[j];
      ok('...and exactly on the chunk edge (' + n + ' bytes)', okk);
    });

    var empty = Sync.unb64(Sync.b64(new Uint8Array(0).buffer));
    eq('...an empty one is still empty', empty.length, 0);

    Store.reset();
    Sync.stop();
    Sync.setPassphrase('');
    Sync.setAgreed(null);
    cfgSet({ on: true, url: 'https://demo-default-rtdb.firebaseio.com', room: 'board-lockroom',
             device: 'Laptop', rev: 0, dirty: false, warn: false });

    ok('it starts unlocked', !Sync.hasPassphrase());
    ok('and it knows whether this page can lock at all', typeof Sync.canLock() === 'boolean');

    /* ============================================================
       the passphrase takes hold at once, storage or no storage
       ============================================================ */
    Sync.setPassphrase('correct horse battery staple');
    ok('setting it locks straight away', Sync.hasPassphrase());

    /* even if the browser refuses to remember it */
    var realSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function () { throw new Error('storage full'); };
    var remembered = Sync.setPassphrase('another passphrase entirely');
    localStorage.setItem = realSet;
    eq('...and says when it could not be remembered', remembered, false);
    ok('...but it is still locked for this session', Sync.hasPassphrase(),
       'this is the one that must never fail: a lock that silently does nothing');

    /* ============================================================
       the passphrase never travels
       ============================================================ */
    Sync.setPassphrase('correct horse battery staple');
    ok('it is not in the settings that sync',
       JSON.stringify(Store.settings().sync).indexOf('correct horse') === -1,
       JSON.stringify(Store.settings().sync));
    ok('...nor anywhere else in the state', Store.exportState().indexOf('correct horse') === -1);
    ok('...nor in a backup file', Store.exportJSON().indexOf('correct horse') === -1);
    ok('...it sits in its own place, on this device',
       (localStorage.getItem('flowlist.syncpass.v1') || '').indexOf('correct horse') !== -1);

    /* ============================================================
       with no crypto to lock with, nothing readable goes out
       ============================================================ */
    var realCrypto = window.crypto;
    try {
      Object.defineProperty(window, 'crypto', { value: { subtle: undefined }, configurable: true });
    } catch (e) { /* some browsers will not let us; the check below still holds */ }
    ok('the app can tell there is nothing to lock with', !Sync.canLock());

    PUTS = [];
    return Sync.push().then(function () { return settle(); }).then(function () {
      eq('a locked board is NOT sent in the clear when it cannot be locked', PUTS.length, 0,
         'sending plain text here would be the worst thing this app could do');
      ok('...and it says why', Sync.status().error.length > 0, Sync.status().error);

      try {
        Object.defineProperty(window, 'crypto', { value: realCrypto, configurable: true });
      } catch (e) { /* ignore */ }

      /* ============================================================
         the two ends must agree about locking
         ============================================================ */
      Sync.setPassphrase('correct horse battery staple');
      var plainDoc = { rev: 999, at: Date.now(), from: 'Other device',
                       state: JSON.parse(Store.exportState()) };
      var before = titles();
      return Sync.unwrap(plainDoc).then(function (got) {
        eq('a plain copy is refused while this device is locked', got, null);
        ok('...naming the problem', Sync.status().error.indexOf('unlocked') !== -1,
           Sync.status().error);

        return Sync.adopt(plainDoc).then(function (took) {
          eq('...and nothing is adopted from it', took, false);
          eq('...so the board is untouched', titles(), before);

          /* the other way round: a locked room, no passphrase here */
          Sync.setPassphrase('');
          var lockedDoc = { rev: 1000, at: Date.now(), enc: { v: 1, iv: 'AAAA', data: 'BBBB' } };
          return Sync.unwrap(lockedDoc).then(function (got2) {
            eq('a locked room is not read without the passphrase', got2, null);
            ok('...and it asks for one', Sync.status().error.indexOf('locked') !== -1,
               Sync.status().error);
            return Sync.adopt(lockedDoc).then(function (took2) {
              eq('...adopting nothing', took2, false);
              eq('...and leaving the board alone', titles(), before);

              /* ============================================================
                 unlocked, everything behaves as it always did
                 ============================================================ */
              Sync.setPassphrase('');
              PUTS = [];
              return Sync.push().then(function () { return settle(); }).then(function () {
                eq('with no passphrase it sends as before', PUTS.length, 1);
                ok('...in the clear', !!PUTS[0].state && PUTS[0].enc === undefined);
                ok('...which is exactly what the warning in Settings says',
                   PUTS[0].state.lists.length > 0);
                Sync.stop();
              });
            });
          });
        });
      });
    });
  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'LOCK ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'lockresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
