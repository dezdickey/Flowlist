/*
 * How long the splash stands between you and the board.
 *
 * Ctrl+Shift+F is meant to put a usable board in front of you. The board
 * itself is drawn in about a fifth of a second; the splash was holding it
 * back for two more. It holds for a fraction of that now, and the slider
 * in Settings still means exactly what it says.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 60); }); };

var booting = function () { return document.body.classList.contains('booting'); };
var loaded = function () { return document.body.classList.contains('loaded'); };
function begin() {
  document.body.classList.add('booting');
  document.body.classList.remove('loaded');
}
function hold(ms, on) {
  Store.mutate(function (s) { s.settings.splashDelay = ms; s.settings.splash = on !== false; }, null, { silent: true });
}
function settings(patch) {
  var st = JSON.parse(Store.exportJSON());
  Object.keys(patch).forEach(function (k) {
    if (patch[k] === undefined) delete st.settings[k]; else st.settings[k] = patch[k];
  });
  Store.importJSON(JSON.stringify(st));
}

setTimeout(function () {
  (async function () {
    ok('the splash is still in the DOM', !!document.getElementById('splash'));

    /* ---------- what the app ships with ---------- */
    settings({ splashDelay: undefined, splashQuickened: undefined });
    var shipped = Store.settings().splashDelay;
    ok('the hold it ships with is well under a second', shipped > 0 && shipped <= 700, shipped);

    /* a board saved under the old two-second hold is quickened, once */
    settings({ splashDelay: 2000, splashQuickened: undefined });
    ok('a board saved with the old two-second hold is quickened', Store.settings().splashDelay === 600,
       Store.settings().splashDelay);

    /* ...and a hold set on purpose is left exactly as it is */
    settings({ splashDelay: 2600, splashQuickened: true });
    ok('a hold set on purpose is left alone', Store.settings().splashDelay === 2600, Store.settings().splashDelay);
    settings({ splashDelay: 1500, splashQuickened: true });
    ok('...whatever it is', Store.settings().splashDelay === 1500, Store.settings().splashDelay);

    /* a brand new board, not one loaded and quickened */
    var keep = Store.exportJSON();
    Store.reset();
    ok('a board made from scratch holds for well under a second', Store.settings().splashDelay <= 700,
       Store.settings().splashDelay);
    Store.importJSON(keep);

    /* ---------- the hold is the hold ---------- */
    hold(400);
    begin();
    var at = Date.now();
    App.splash();
    ok('the splash is up while it holds', booting() && !loaded());
    await wait(150);
    ok('...still up part-way through', booting(), 'gone after ' + (Date.now() - at) + 'ms');
    await wait(400);
    ok('...and gone when the hold is up', loaded() && !booting(), 'after ' + (Date.now() - at) + 'ms');
    ok('...which is under a second', Date.now() - at < 1000, (Date.now() - at) + 'ms');

    /* ---------- no hold at all ---------- */
    hold(0);
    begin();
    App.splash();
    ok('a hold of nothing puts the board there at once', loaded() && !booting());

    /* ---------- switched off ---------- */
    hold(3000, false);
    begin();
    App.splash();
    ok('with the splash switched off, the board is there at once', loaded() && !booting());

    /* ---------- and the board underneath is ready either way ---------- */
    ok('the board is drawn behind it', document.querySelectorAll('#board .list').length === Store.get().board.length,
       document.querySelectorAll('#board .list').length + ' vs ' + Store.get().board.length);
    document.body.classList.remove('booting');
    document.body.classList.add('loaded');
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'BOOTSPLASH ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'bootsplashresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
