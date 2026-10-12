/* the six interactive extras */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function ambientGroup() {
  var gs = document.querySelectorAll('#settings-body .set-group');
  for (var i = 0; i < gs.length; i++) if (gs[i].querySelector('.set-label').textContent === 'Ambient') return gs[i];
  return null;
}
function rowNames() {
  return Array.prototype.map.call(ambientGroup().querySelectorAll('.toggle-row .tr-name'),
    function (n) { return n.textContent; });
}
function rowByName(n) {
  var f = null;
  ambientGroup().querySelectorAll('.toggle-row').forEach(function (r) {
    if (r.querySelector('.tr-name').textContent === n) f = r;
  });
  return f;
}
function visible(el) { return !!el && el.offsetParent !== null; }
function cursorAt(x, y) {
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
}
var T = 0;
function cat(frames) { for (var i = 0; i < frames; i++) { T += 1 / 60; Themes.catStep(1 / 60); } }

setTimeout(function () {
  try {
    var style = document.createElement('style');
    style.textContent = '#splash{display:none !important}';
    document.head.appendChild(style);
    Store.reset();
    Themes.openDrawer();

    /* ============================================================
       where each toggle shows up
       ============================================================ */
    Themes.apply('winter');
    var w = rowNames();
    ok('Winter offers cursor wind', w.indexOf('Cursor wind') !== -1, w.join('|'));
    ok('Winter offers settling snow', w.indexOf('Settling snow') !== -1, w.join('|'));
    ok('Winter offers the chasing cat', w.indexOf('Comes when called') !== -1, w.join('|'));

    ok('cursor wind is nested under the particle row',
       rowByName('Cursor wind').parentNode.classList.contains('sub-rows'));
    ok('the chasing cat is nested under the cat row',
       rowByName('Comes when called').parentNode.classList.contains('sub-rows'));

    /* confetti is the universal one */
    ['winter', 'amethyst', 'midnight', 'paper', 'slate', 'valley', 'dunes']
      .forEach(function (k) {
        Themes.apply(k);
        if (rowNames().indexOf('Confetti') === -1) ok('Confetti shows on ' + k, false, rowNames().join('|'));
      });
    ok('Confetti shows on every theme', true);
    Themes.apply('midnight');
    ok('a theme with no particles or scenery shows only the universal rows',
       rowNames().join('|') === 'Confetti|Loading splash', rowNames().join('|'));

    /* the nested rows hide with their parent */
    Themes.apply('winter');
    var snowSwitch = rowByName('Snowfall').querySelector('.switch');
    snowSwitch.click();
    ok('turning snowfall off hides wind and settling',
       !visible(rowByName('Cursor wind')) && !visible(rowByName('Settling snow')));
    snowSwitch.click();
    ok('...and back on shows them', visible(rowByName('Cursor wind')));

    var catSwitch = rowByName('Walking cat').querySelector('.switch');
    catSwitch.click();
    ok('turning the cat off hides its chase row', !visible(rowByName('Comes when called')));
    catSwitch.click();
    ok('...and back on shows it', visible(rowByName('Comes when called')));

    /* ============================================================
       the cat
       ============================================================ */
    Themes.apply('winter');
    ok('the cat is under physics control', !!Themes.catState());
    ok('...and the CSS patrol steps aside',
       getComputedStyle(document.querySelector('.cat-walk')).animationName === 'none',
       getComputedStyle(document.querySelector('.cat-walk')).animationName);

    var H = window.innerHeight, W = window.innerWidth;
    cursorAt(-500, -500); cursorAt(-500, -500);
    var startX = Themes.catState().x;
    cat(120);
    ok('left alone, it patrols', Math.abs(Themes.catState().x - startX) > 20,
       startX.toFixed(0) + ' -> ' + Themes.catState().x.toFixed(0));
    ok('...staying on screen', Themes.catState().x > 0 && Themes.catState().x < W);

    /* a cursor up in the board is ignored */
    var beforeHigh = Themes.catState().x;
    cursorAt(W * 0.2, 120);
    cat(60);
    ok('a cursor up in the board does not interest it',
       !Themes.catState().el.classList.contains('pawing'));

    /* down at its level, it comes over */
    var far = W * 0.75;
    cursorAt(far, H - 60);
    cat(240);
    var s = Themes.catState();
    ok('a cursor near the floor brings it over',
       Math.abs((s.x + 31) - far) < 45, (s.x + 31).toFixed(0) + ' vs ' + far.toFixed(0));
    ok('...and it paws at it', s.el.classList.contains('pawing'));
    ok('...facing the way it travelled', s.facing === 1 || s.facing === -1, s.facing);

    /* it turns round to follow the other way */
    cursorAt(W * 0.12, H - 60);
    cat(30);
    ok('it turns to follow', Themes.catState().facing === -1, Themes.catState().facing);
    cat(240);
    ok('...and gets there', Math.abs((Themes.catState().x + 31) - W * 0.12) < 50,
       (Themes.catState().x + 31).toFixed(0));

    /* switch the chase off and it goes back to patrolling past the cursor */
    rowByName('Comes when called').querySelector('.switch').click();
    ok('turning the chase off is remembered', Store.settings().catChase === false);
    ok('...the cat is still there', !!document.querySelector('.cat-walk'));
    ok('...back on the CSS patrol',
       !document.querySelector('.cat-walk').classList.contains('live') &&
       getComputedStyle(document.querySelector('.cat-walk')).animationName === 'cat-path',
       getComputedStyle(document.querySelector('.cat-walk')).animationName);
    ok('...and nothing left under physics', Themes.catState() === null);
    rowByName('Comes when called').querySelector('.switch').click();
    ok('turning it back on restarts it', !!Themes.catState());

    /* it stops with the cat, and with the scenery */
    rowByName('Walking cat').querySelector('.switch').click();
    ok('no cat, no physics', Themes.catState() === null && !document.querySelector('.cat-walk'));
    rowByName('Walking cat').querySelector('.switch').click();
    Themes.apply('midnight');
    ok('leaving Winter drops the cat', Themes.catState() === null);


    /* ============================================================
       confetti
       ============================================================ */
    Themes.apply('winter');
    Store.reset();
    ok('the confetti canvas exists', !!document.getElementById('fx-confetti'));
    ok('it sits above the board',
       parseInt(getComputedStyle(document.getElementById('fx-confetti')).zIndex, 10) > 100,
       getComputedStyle(document.getElementById('fx-confetti')).zIndex);
    ok('nothing running to begin with', !Confetti.isRunning());

    var L = Store.get().lists;
    var a = L[1], b = L[2];
    Store.addToToday(a.id, a.items[0].id);
    Store.addToToday(b.id, b.items[0].id);
    ok('two things planned', Store.get().today.length === 2);

    Store.mutate(function () { a.items[0].done = true; }, ['today', 'board', 'lists']);
    ok('ticking off the first does not celebrate', !Confetti.isRunning());

    Store.mutate(function () { b.items[0].done = true; }, ['today', 'board', 'lists']);
    ok('ticking off the last one does', Confetti.isRunning());
    ok('...with a decent burst', Confetti.count() > 40, Confetti.count());
    ok('...on its own canvas', document.getElementById('fx-confetti').classList.contains('on'));
    Confetti.stop();
    ok('it can be stopped', !Confetti.isRunning() &&
       !document.getElementById('fx-confetti').classList.contains('on'));

    /* it does not fire twice for the same finish */
    Store.mutate(function () {}, ['today']);
    ok('it does not re-fire while everything stays done', !Confetti.isRunning());

    /* un-tick then re-tick and it fires again */
    Store.mutate(function () { b.items[0].done = false; }, ['today', 'board', 'lists']);
    Store.mutate(function () { b.items[0].done = true; }, ['today', 'board', 'lists']);
    ok('finishing again celebrates again', Confetti.isRunning());
    Confetti.stop();

    /* the toggle silences it */
    rowByName('Confetti').querySelector('.switch').click();
    ok('turning confetti off is remembered', Store.settings().fxConfetti === false);
    Store.mutate(function () { b.items[0].done = false; }, ['today', 'board', 'lists']);
    Store.mutate(function () { b.items[0].done = true; }, ['today', 'board', 'lists']);
    ok('...and it stays quiet', !Confetti.isRunning());
    rowByName('Confetti').querySelector('.switch').click();

    /* an empty Today never celebrates */
    Store.reset();
    Store.mutate(function () {}, ['today']);
    ok('an empty Today is not a finished Today', !Confetti.isRunning());

    /* ============================================================
       persistence
       ============================================================ */
    Store.flush();
    var saved = JSON.parse(localStorage.getItem('flowlist.state.v1')).settings;
    ok('all four settings are saved',
       saved.fxWind === true && saved.catChase === true &&
       saved.snowSettle === true && saved.fxConfetti === true,
       JSON.stringify({ w: saved.fxWind, c: saved.catChase,
                        s: saved.snowSettle, f: saved.fxConfetti }));

    var legacy = JSON.parse(Store.exportJSON());
    ['fxWind', 'catChase', 'snowSettle', 'fxConfetti']
      .forEach(function (k) { delete legacy.settings[k]; });
    Store.importJSON(JSON.stringify(legacy));
    var now = Store.settings();
    ok('an older save defaults all four on',
       now.fxWind && now.catChase && now.snowSettle && now.fxConfetti);

    Themes.apply('winter');
    Themes.closeDrawer();
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }

  document.title = 'FX ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre');
  pre.id = 'fxresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
