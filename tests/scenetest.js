var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var scene = function () { return document.getElementById('fx-scene'); };
var count = function (sel) { return document.querySelectorAll('#fx-scene ' + sel).length; };
function endless() {
  /* the scene's own clock holds its animations paused and moves them itself */
  var clocked = Themes.sceneClock();
  return document.getAnimations().filter(function (a) {
    return (a.playState === 'running' || clocked.indexOf(a) !== -1) && !a.transitionProperty && a.effect &&
           a.effect.getComputedTiming().iterations === Infinity;
  });
}
function endlessNames() {
  return endless().map(function (a) { return a.animationName || '?'; }).sort().join(', ') || 'none';
}
function rowNames() {
  return [].slice.call(document.querySelectorAll('#settings-body .tr-name'))
    .map(function (r) { return r.textContent; });
}
function show(theme) {
  /* a scene that ships switched off is still worth drawing, so turn the one
     being looked at on before building it */
  Store.mutate(function (s) { s.settings.newScene[theme] = true; }, null, { silent: true });
  Themes.apply(theme);
  Themes.buildScene();
}

setTimeout(function () {
  try {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting');
    document.body.classList.add('loaded');
    Store.reset();
    Store.mutate(function (s) {
      s.settings.snow = false;
      s.settings.scene = true;
      s.settings.sceneStill = false;
    }, null, { silent: true });

    /* ============================================================
       every theme has something behind it now
       ============================================================ */
    var without = Themes.THEMES.filter(function (t) { return !t.scene; });
    eq('no theme is left with a bare background', without.length, 0,
       without.map(function (t) { return t.key; }).join(', '));

    /* Amethyst is the one theme whose scene ships switched off, so the
       theme is quiet until it is asked for */
    eq('Amethyst ships with its graph off', Store.settings().newScene.amethyst, false);

    /* ============================================================
       each new one draws what it should
       ============================================================ */
    show('midnight');
    ok('Midnight raises a skyline', count('.mn-city svg path') === 1);
    ok('...under a moon', count('.mn-moon') === 1);
    ok('...with windows lit', count('.mn-win') > 20, count('.mn-win'));
    ok('...coming on at different times',
       document.querySelectorAll('#fx-scene .mn-win')[0].style.animationDelay !==
       document.querySelectorAll('#fx-scene .mn-win')[5].style.animationDelay);

    show('amethyst');
    ok('Amethyst draws its graph', count('.ob-graph') === 1);
    ok('...with nine notes in it', count('.ob-node') === 9, count('.ob-node'));
    ok('...and the links between them', count('.ob-graph line') === 10, count('.ob-graph line'));

    show('slate');
    ok('Slate lays out two ridges', count('.sl-ridge') === 2);
    ok('...with fog across them', count('.sl-fog') === 3);
    ok('...drifting at different speeds',
       document.querySelectorAll('#fx-scene .sl-fog')[0].style.animationDuration !==
       document.querySelectorAll('#fx-scene .sl-fog')[2].style.animationDuration);

    show('paper');
    ok('Paper sends up a plane', count('.pp-plane svg') === 1);
    ok('...with clouds to pass', count('.pp-cloud') === 3);
    ok('...already in the air when you arrive',
       getComputedStyle(document.querySelector('.pp-plane')).animationDelay !== '0s',
       getComputedStyle(document.querySelector('.pp-plane')).animationDelay);

    /* ============================================================
       the old scenes are untouched
       ============================================================ */
    show('winter');
    ok('Winter still has its snowman', count('.snowman') === 1);

    /* ============================================================
       every one of them answers to the two switches
       ============================================================ */
    var fresh = ['city', 'graph', 'fog', 'plane'];
    Themes.THEMES.filter(function (t) { return fresh.indexOf(t.scene) !== -1; })
      .forEach(function (t) {
        Store.mutate(function (s) { s.settings.scene = true; s.settings.sceneStill = false; }, null, { silent: true });
        show(t.key);
        var built = scene().children.length;
        ok(t.key + ': the scene is built', built > 0, built);

        Store.mutate(function (s) { s.settings.scene = false; }, null, { silent: true });
        Themes.buildScene();
        eq(t.key + ': ...Scenery off clears it away', scene().children.length, 0);

        Store.mutate(function (s) { s.settings.scene = true; s.settings.sceneStill = true; }, null, { silent: true });
        Themes.buildScene();
        eq(t.key + ': ...held still it is all still there', scene().children.length, built);
        ok(t.key + ': ...and nothing in it runs for ever',
           endless().filter(function (a) {
             return a.effect && a.effect.target && scene().contains(a.effect.target);
           }).length === 0, endlessNames());
        Store.mutate(function (s) { s.settings.sceneStill = false; }, null, { silent: true });
      });

    /* ============================================================
       and each has its own name in Ambient
       ============================================================ */
    Themes.openDrawer();
    [['midnight', 'City at night'], ['amethyst', 'The graph'],
     ['slate', 'Fog on the ridge'],
     ['paper', 'Paper plane']].forEach(function (pair) {
      Themes.apply(pair[0]);
      Themes.renderSettings();
      ok(pair[0] + ' calls its scenery "' + pair[1] + '"',
         rowNames().indexOf(pair[1]) !== -1, rowNames().join(' | '));
      ok(pair[0] + ' ...and offers to hold it still',
         rowNames().indexOf('Hold it still') !== -1);
    });
    Themes.closeDrawer();
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }
  document.title = 'SCENES ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre'); pre.id = 'sceneresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
