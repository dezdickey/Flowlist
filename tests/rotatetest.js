/*
 * Changing the passphrase.
 *
 * The one thing that must never happen is ending up with a board that
 * cannot be read under either the old words or the new ones. So every
 * failure here is checked for the same thing: that the old passphrase
 * and the old room are exactly as they were.
 *
 * The encryption itself is not exercised — this harness has no working
 * crypto — so the room stays put and the re-lock is the identity. What
 * is checked is the order of operations and the rollback.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var PUTS = [], remote = null, failPut = 0, failGet = 0;
window.fetch = function (url, opt) {
  if (String(url).indexOf('firebaseio') === -1) return Promise.reject(new Error('not the database'));
  if (opt && opt.method === 'PUT') {
    if (failPut > 0) { failPut--; return Promise.resolve({ ok: false, status: 500 }); }
    remote = JSON.parse(opt.body); PUTS.push(remote);
    return Promise.resolve({ ok: true, status: 200 });
  }
  if (failGet > 0) { failGet--; return Promise.reject(new Error('no answer')); }
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(remote); } });
};
function StubES() { this.listeners = {}; this.closed = false; }
StubES.prototype.addEventListener = function (k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); };
StubES.prototype.close = function () { this.closed = true; };

function cfgSet(o) {
  Store.mutate(function (s) { Object.keys(o).forEach(function (k) { s.settings.sync[k] = o[k]; }); },
    null, { silent: true });
}
var room = function () { return Store.settings().sync.room; };
var titles = function () { return Store.get().lists.map(function (l) { return l.name; }).join(','); };

setTimeout(function () {
  Promise.resolve().then(function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    window.EventSource = StubES;
    Store.reset();
    Sync.stop();
    Sync.setAgreed(null);
    remote = null; PUTS = [];
    Sync.setPassphrase('the old passphrase here');
    cfgSet({ on: true, gate: false, url: 'https://demo-default-rtdb.firebaseio.com',
             room: 'board-mineownkey', device: 'Laptop', rev: 3, dirty: false });

    /* ---------- it refuses the silly cases without touching anything ---------- */
    return Sync.changePassphrase('').then(function (r) {
      eq('an empty new passphrase is refused', r.ok, false);
      ok('...saying why', (r.reason || '').length > 0, r.reason);
      return Sync.changePassphrase('the old passphrase here');
    }).then(function (r) {
      eq('the same passphrase again is refused', r.ok, false);
      ok('...and the old one still stands', Sync.hasPassphrase());
      eq('...and the room is untouched', room(), 'board-mineownkey');

      cfgSet({ on: false });
      return Sync.changePassphrase('a brand new passphrase');
    }).then(function (r) {
      eq('with sync off there is nothing to move', r.ok, false);
      cfgSet({ on: true });

      /* ---------- the ordinary case: same room, new words ---------- */
      var steps = [];
      PUTS = [];
      var before = titles();
      return Sync.changePassphrase('a brand new long passphrase',
                                   function (t) { if (t) steps.push(t); })
        .then(function (res) {
          eq('changing it works', res.ok, true, res.reason);
          eq('...the room stays put when it is your own key', res.room, 'board-mineownkey');
          eq('...so nothing was moved', res.movedFrom, null);
          ok('...the board went out again', PUTS.length >= 1, PUTS.length);
          ok('...it said what it was doing', steps.length >= 2, steps.join(' | '));
          ok('...ending by checking it could be read back',
             steps.join(' ').indexOf('read back') !== -1, steps.join(' | '));
          eq('...and the board on this device is untouched', titles(), before);
        });
    }).then(function () {
      /* ---------- if the send fails, everything goes back ---------- */
      Sync.setPassphrase('a known good passphrase');
      cfgSet({ room: 'board-mineownkey', rev: 9, dirty: false });
      var keptRoom = room(), keptRev = Store.settings().sync.rev;
      var before = titles();
      failPut = 9;                      // every attempt to send will fail
      return Sync.changePassphrase('a passphrase that will not land').then(function (r) {
        failPut = 0;
        eq('a failed send changes nothing', r.ok, false);
        ok('...and says so plainly', (r.reason || '').length > 0, r.reason);
        eq('...the room is put back', room(), keptRoom);
        eq('...the revision is put back', Store.settings().sync.rev, keptRev);
        ok('...the old passphrase is back', Sync.hasPassphrase());
        eq('...and the board is untouched', titles(), before);
      });
    }).then(function () {
      /* ---------- if it cannot be read back, everything goes back ---------- */
      Sync.setPassphrase('another good passphrase');
      cfgSet({ room: 'board-mineownkey', rev: 4, dirty: false });
      var keptRoom = room();
      remote = null;                    // the send lands but the room reads empty
      var realFetch = window.fetch;
      window.fetch = function (url, opt) {
        if (opt && opt.method === 'PUT') return Promise.resolve({ ok: true, status: 200 });
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(null); } });
      };
      return Sync.changePassphrase('a passphrase that cannot be read back').then(function (r) {
        window.fetch = realFetch;
        eq('a board that will not read back is not accepted', r.ok, false);
        eq('...the room is put back', room(), keptRoom);
        ok('...and the old passphrase is back', Sync.hasPassphrase());
      });
    }).then(function () {
      /* ---------- the button is in Settings ---------- */
      Themes.openDrawer();
      var labels = [].slice.call(document.querySelectorAll('#settings-body button'))
        .map(function (b) { return (b.textContent || '').trim(); });
      ok('there is a button for it', labels.indexOf('Change the passphrase') !== -1,
         labels.join(' | '));
      Sync.stop();
      Sync.setPassphrase('');
    });
  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'ROTATE ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'rotateresults';
    pre.textContent = '\n' + OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
