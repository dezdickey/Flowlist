var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var scene = function () { return document.getElementById('fx-scene'); };
var pieces = function () { return scene().querySelectorAll('*').length; };
function moving() {
  /* the scene's own clock holds its animations paused and moves them itself */
  var clocked = Themes.sceneClock();
  return document.getAnimations().filter(function (a) {
    return (a.playState === 'running' || clocked.indexOf(a) !== -1) && !a.transitionProperty;
  });
}
function movingNames() {
  return moving().map(function (a) { return a.animationName || '?'; }).sort().join(', ') || 'none';
}
function setStill(v) {
  Store.mutate(function (s) { s.settings.sceneStill = v; }, null, { silent: true });
  Themes.buildScene();
}
function rowNames(box) {
  return [].slice.call(box.querySelectorAll('.tr-name')).map(function (r) { return r.textContent; });
}
function drawerRow(name) {
  return [].slice.call(document.querySelectorAll('.drawer-body .toggle-row')).filter(function (r) {
    var n = r.querySelector('.tr-name');
    return n && n.textContent === name;
  })[0];
}

setTimeout(function () {
  try {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting');
    document.body.classList.add('loaded');
    Store.reset();
    Store.mutate(function (s) {
      s.settings.snow = false;          // particles are their own switch
      s.settings.scene = true;
      s.settings.sceneStill = false;
    }, null, { silent: true });

    /* ============================================================
       the scene is all there, and completely still
       ============================================================ */
    ['winter', 'midnight', 'slate'].forEach(function (t) {
      Themes.apply(t);
      Themes.buildScene();
      setStill(false);
      var live = pieces();
      var wasMoving = moving().length;
      ok(t + ': the scene moves when it is meant to', wasMoving > 0, movingNames());

      setStill(true);
      eq(t + ': every piece of it is still there', pieces(), live);
      eq(t + ': ...and nothing in it moves', moving().filter(function (a) {
        return a.effect && a.effect.target && scene().contains(a.effect.target);
      }).length, 0, movingNames());
    });

    /* ============================================================
       the winter cat stands somewhere sensible
       ============================================================ */
    Themes.apply('winter');
    Store.mutate(function (s) { s.settings.cat = true; }, null, { silent: true });
    setStill(true);
    Themes.buildScene();
    var cat = document.querySelector('.cat-walk');
    ok('the cat is on the page', !!cat);
    eq('...standing, not mid-stride', getComputedStyle(cat).animationName, 'none');
    ok('...and not stuck at the very edge', getComputedStyle(cat).transform !== 'none',
       getComputedStyle(cat).transform);
    eq('...the snowman is still there too', document.querySelectorAll('.snowman').length, 1);

    /* ============================================================
       the switch, and what it hides
       ============================================================ */
    Themes.apply('winter');
    setStill(false);
    Themes.openDrawer();
    var row = drawerRow('Hold it still');
    ok('there is a switch for it under Scenery', !!row);
    ok('...inside the scenery rows', !!row.closest('.sub-rows'));
    var motion = document.querySelector('.drawer-body .motion-rows');
    ok('the motion-only rows are shown while it moves', !motion.classList.contains('is-hidden'));
    ok('...and the cat rows are among them', rowNames(motion).indexOf('Comes when called') !== -1,
       rowNames(motion).join(' | '));

    row.querySelector('.switch').click();
    ok('flipping it holds the scene', Store.settings().sceneStill === true);
    ok('...hides the rows that no longer apply', motion.classList.contains('is-hidden'));
    eq('...and stops everything', moving().length, 0, movingNames());
    row.querySelector('.switch').click();
    ok('flipping it back sets it going', Store.settings().sceneStill === false);
    ok('...and shows those rows again', !motion.classList.contains('is-hidden'));
    Themes.closeDrawer();

    /* it is remembered */
    setStill(true);
    Store.flush();
    ok('the choice is saved',
       JSON.parse(localStorage.getItem('flowlist.state.v1')).settings.sceneStill === true);
    var older = JSON.parse(Store.exportJSON());
    delete older.settings.sceneStill;
    Store.importJSON(JSON.stringify(older));
    eq('an older save keeps the scene moving, as it always did',
       Store.settings().sceneStill, false);
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }
  document.title = 'STILL ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre'); pre.id = 'stillresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
