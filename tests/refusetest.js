/*
 * What the app says when the database turns a board away.
 *
 * The rules this app hands out refuse anything that is not encrypted, so
 * "401" is the everyday answer to syncing without a passphrase. Reported
 * as a bare number it reads like a broken key, and the one thing that
 * would fix it goes unsaid.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }

var answer = 401;   // not "status": that is window.status, which turns numbers into strings
window.fetch = function (url, opt) {
  if (String(url).indexOf('firebaseio') === -1) return Promise.reject(new Error('not the database'));
  if (opt && opt.method === 'PUT') return Promise.resolve({ ok: false, status: answer });
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(null); } });
};
function StubES() { this.listeners = {}; this.closed = false; }
StubES.prototype.addEventListener = function () {};
StubES.prototype.close = function () { this.closed = true; };

function cfgSet(o) {
  Store.mutate(function (s) { Object.keys(o).forEach(function (k) { s.settings.sync[k] = o[k]; }); },
    null, { silent: true });
}
function settle() {
  var p = Promise.resolve();
  for (var i = 0; i < 8; i++) p = p.then(function () {});
  return p;
}
var said = function () { return Sync.status().error || ''; };

setTimeout(function () {
  Promise.resolve().then(function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    window.EventSource = StubES;
    Store.reset();
    Sync.stop();
    Sync.setPassphrase('');
    cfgSet({ on: true, gate: false, url: 'https://demo-default-rtdb.firebaseio.com',
             room: 'board-refused', device: 'Laptop', rev: 0, dirty: false });

    /* ---------- turned away while sending in the clear ---------- */
    answer = 401;
    return Sync.push().then(settle).then(function () {
      ok('a plain board turned away says to set a passphrase',
         said().indexOf('passphrase') !== -1, said());
      ok('...naming where to set it', said().indexOf('Sync') !== -1, said());
      ok('...and not leaving a bare number as the whole explanation',
         said() !== 'the database answered 401', said());

      /* All of the above is about Sync.status(), which nobody reads. The
         reason has to reach the screen as well: the note used to announce
         "Cannot reach the database" whatever the trouble was, which is a
         different claim and a false one when the database answered at once
         with a refusal - and it sends you off to check your internet when
         what is wanted is a passphrase. */
      var title = function () { return document.querySelector('#sync-note .sn-title').textContent; };
      var sub = function () { return document.querySelector('#sync-note .sn-sub').textContent; };
      ok('the note is up', document.getElementById('sync-note').classList.contains('show'));
      ok('...and does not blame the connection when the database answered',
         title().indexOf('Cannot reach') === -1, title());
      ok('...saying the change has not gone out', title().indexOf('not gone out') !== -1, title());
      ok('...with the reason where it can actually be read',
         sub().indexOf('passphrase') !== -1, sub());
      ok('...and still saying the change is safe on this device',
         sub().indexOf('saved on this device') !== -1, sub());

      /* ---------- turned away while locked is a different problem ---------- */
      Sync.setPassphrase('a long enough passphrase');
      return Sync.push().then(settle);
    }).then(function () {
      ok('a locked board turned away points at the rules instead',
         said().indexOf('rules') !== -1, said());
      ok('...and does not wrongly ask for a passphrase that is already set',
         said().indexOf('set a passphrase') === -1, said());

      /* ---------- 403 is the same story ---------- */
      answer = 403;
      Sync.setPassphrase('');
      return Sync.push().then(settle);
    }).then(function () {
      ok('403 is treated the same as 401', said().indexOf('passphrase') !== -1, said());

      /* ---------- anything else is reported as it comes ---------- */
      answer = 500;
      return Sync.push().then(settle);
    }).then(function () {
      ok('other answers are passed through plainly', said().indexOf('500') !== -1, said());
      ok('...without inventing a passphrase problem',
         said().indexOf('passphrase') === -1, said());

      /* ---------- and none of it touches the board ---------- */
      ok('the board is still here', Store.get().lists.length > 0);
      ok('...and still has its notes',
         Store.get().lists.some(function (l) { return (l.items || []).length > 0; }));
      Sync.stop();
      Sync.setPassphrase('');
    });
  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'REFUSE ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'refuseresults';
    pre.textContent = '\n' + OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
