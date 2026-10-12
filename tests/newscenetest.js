var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var scene = function () { return document.getElementById('fx-scene'); };
var count = function (sel) { return document.querySelectorAll('#fx-scene ' + sel).length; };
function rowNames() {
  return [].slice.call(document.querySelectorAll('#settings-body .tr-name'))
    .map(function (r) { return r.textContent; });
}
function row(name) {
  return [].slice.call(document.querySelectorAll('#settings-body .toggle-row')).filter(function (r) {
    var n = r.querySelector('.tr-name');
    return n && n.textContent === name;
  })[0];
}
function sliderRow(name) { return document.querySelector('#settings-body [data-slider="' + name + '"]'); }
function slide(name, v) {
  var r = sliderRow(name);
  r.querySelector('input').value = v;
  r.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }));
}
function show(theme) { Themes.apply(theme); Themes.buildScene(); Themes.renderSettings(); }

/* the themes that were given a scene after the fact */
var FRESH = ['amethyst', 'midnight', 'paper', 'slate'];
/* and the ones that always had one */
var OLD = ['winter', 'valley', 'dunes'];

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
    Themes.openDrawer();

    /* ============================================================
       the way back to how each theme was
       ============================================================ */
    FRESH.forEach(function (k) {
    Store.mutate(function (s) { s.settings.newScene[k] = true; }, null, { silent: true });
      show(k);
      var names = rowNames();
      ok(k + ': offers the New scene switch', names.indexOf('New scene') !== -1, names.join(' | '));
      eq(k + ': ...at the very top', names[0], 'New scene');
      ok(k + ': ...above Polish', names.indexOf('New scene') < names.indexOf('Polish'));
      var built = scene().children.length;
      ok(k + ': ...with the scene up', built > 0);

      row('New scene').querySelector('.switch').click();
      eq(k + ': turning it off empties the scene', scene().children.length, 0);
      var off = rowNames();
      ok(k + ': ...and takes its scenery rows away',
         off.indexOf('Hold it still') === -1, off.join(' | '));
      ok(k + ': ...leaving the theme as it was', off.indexOf('Polish') !== -1 &&
         off.indexOf('Confetti') !== -1 && off.indexOf('Loading splash') !== -1, off.join(' | '));
      ok(k + ': ...and the switch is still there to come back',
         off.indexOf('New scene') !== -1);

      row('New scene').querySelector('.switch').click();
      ok(k + ': turning it back on rebuilds it', scene().children.length === built);
      ok(k + ': ...and the scenery rows return', rowNames().indexOf('Hold it still') !== -1);
    });

    /* ============================================================
       one theme at a time
       ============================================================ */
    show('paper');
    row('New scene').querySelector('.switch').click();
    eq('Paper is put back', scene().children.length, 0);
    show('midnight');
    ok('...and Midnight is untouched by that', scene().children.length > 0);
    eq('...each theme keeps its own answer', Store.settings().newScene.paper, false);
    ok('...and the others keep theirs',
       Store.settings().newScene.midnight !== false);
    show('paper');
    eq('...and Paper is still off when you come back', scene().children.length, 0);
    row('New scene').querySelector('.switch').click();

    /* ============================================================
       the themes that always had a scene do not offer it
       ============================================================ */
    OLD.forEach(function (k) {
      show(k);
      ok(k + ': has no New scene switch, having always had one',
         rowNames().indexOf('New scene') === -1, rowNames().join(' | '));
      ok(k + ': ...and still draws its scene', scene().children.length > 0);
    });

    /* ============================================================
       remembered
       ============================================================ */
    Store.mutate(function (s) { s.settings.newScene.paper = false; }, null, { silent: true });
    Store.flush();
    var saved = JSON.parse(localStorage.getItem('flowlist.state.v1'));
    eq('the choice is saved', saved.settings.newScene.paper, false);
    var older = JSON.parse(Store.exportJSON());
    delete older.settings.newScene;
    Store.importJSON(JSON.stringify(older));
    ok('an older save gets the new scenes, as it did before this switch existed',
       Store.settings().newScene && Store.settings().newScene.amethyst === false &&
       Object.keys(Store.settings().newScene).length === 1);
    Themes.apply('paper');
    Themes.buildScene();
    ok('...and draws them', scene().children.length > 0);
    Themes.closeDrawer();
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }
  document.title = 'NEWSCENE ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre'); pre.id = 'nsresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
