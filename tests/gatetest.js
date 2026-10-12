/*
 * One password instead of three fields.
 *
 * The derivation itself needs real crypto and real time, neither of which
 * this harness has — it is checked in a live browser instead. What is
 * checked here is everything around it: that the screen appears only when
 * asked for, that it refuses a weak password before anything leaves the
 * machine, that a wrong password never quietly starts a second board, and
 * that the board on this device is never harmed by any of it.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

function cfgSet(o) {
  Store.mutate(function (s) { Object.keys(o).forEach(function (k) { s.settings.sync[k] = o[k]; }); },
    null, { silent: true });
}
var note = function () { var n = document.querySelector('#lk-note'); return n ? n.textContent : ''; };
var titles = function () { return Store.get().lists.map(function (l) { return l.name; }).join(','); };

setTimeout(function () {
  try {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    Store.reset();
    Sync.stop();
    Sync.setPassphrase('');

    /* ---------- it keeps out of the way unless asked for ---------- */
    cfgSet({ gate: false, on: false, url: '', room: '' });
    Lock.init();
    ok('with the gate off, no password screen', !Lock.isShowing());

    /* ---------- and appears when it is asked for ---------- */
    cfgSet({ gate: true, on: false, url: '', room: '' });
    Sync.setPassphrase('');
    Lock.init();
    ok('with the gate on and nothing held, it asks', Lock.isShowing());
    ok('...and it covers the page', document.body.classList.contains('locked-out'));
    ok('...with somewhere to type', !!document.querySelector('#lk-pass'));

    /* ---------- a short password is refused before anything is sent ---------- */
    var room0 = Store.settings().sync.room;
    Lock.submit('short');
    ok('a short password is refused', note().indexOf('under 12') !== -1, note());
    ok('...and nothing was worked out from it', Store.settings().sync.room === room0);
    ok('...and it is still asking', Lock.isShowing());

    Lock.submit('');
    ok('an empty box is refused too', note().length > 0, note());

    /* ---------- the strength read is honest about length ---------- */
    eq('one short word scores nothing', Lock.judge('cabbage').score, 0);
    ok('a long-enough one gets by', Lock.judge('cabbagecabbage').score >= 1);
    ok('...four words do better', Lock.judge('cabbage lantern rope kettle').score >= 2,
       Lock.judge('cabbage lantern rope kettle').score);
    eq('...and are counted as words', Lock.judge('cabbage lantern rope kettle').words, 4);
    ok('a long mixed one also does well', Lock.judge('Qx7!vbnm-2201-zzt').score >= 1);

    /* ---------- the board is never touched by the screen ---------- */
    var before = titles();
    Lock.submit('short');
    eq('a refused password leaves the board alone', titles(), before);

    /* ---------- opening and closing by hand ---------- */
    Lock.close();
    ok('closing it puts the page back', !Lock.isShowing());
    ok('...and lets the page scroll again', !document.body.classList.contains('locked-out'));
    Lock.open();
    ok('it can be brought back', Lock.isShowing());
    Lock.close();

    /* ---------- forgetting the password shuts the room, not the board ---------- */
    Sync.setPassphrase('a long enough password');
    cfgSet({ gate: true, on: true, url: 'https://demo-default-rtdb.firebaseio.com',
             room: 'board-something', device: 'Test' });
    var lists = titles();
    Lock.relock();
    ok('forgetting it asks again', Lock.isShowing());
    ok('...the passphrase is gone', !Sync.hasPassphrase());
    ok('...sync is switched off', !Sync.isOn());
    eq('...and the board is untouched', titles(), lists);
    Lock.close();

    /* ---------- an already-unlocked device is not asked twice ---------- */
    Sync.setPassphrase('a long enough password');
    cfgSet({ gate: true, on: true, url: 'https://demo-default-rtdb.firebaseio.com',
             room: 'board-something' });
    Lock.init();
    ok('a device that already knows the password is not asked again', !Lock.isShowing());
    Sync.stop();
    Sync.setPassphrase('');

    /* ---------- the settings switch is there ---------- */
    Themes.openDrawer();
    var names = [].slice.call(document.querySelectorAll('#settings-body .tr-name'))
      .map(function (r) { return r.textContent; });
    ok('there is a switch for it in Settings',
       names.indexOf('Ask for one password when this opens') !== -1, names.join(' | '));

    /* ---------- and the password never lands in the board or a backup ---------- */
    Sync.setPassphrase('a long enough password');
    ok('the password is not in the board', Store.exportState().indexOf('a long enough password') === -1);
    ok('...nor in a backup', Store.exportJSON().indexOf('a long enough password') === -1);
    Sync.setPassphrase('');
  } catch (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }
  document.title = 'GATE ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre'); pre.id = 'gateresults';
  pre.textContent = '\n' + OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
