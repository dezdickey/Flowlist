/* new themes, theme-aware ambient rows, and the toggle behaviour */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function ambientGroup() {
  var groups = document.querySelectorAll('#settings-body .set-group');
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].querySelector('.set-label').textContent === 'Ambient') return groups[i];
  }
  return null;
}
function rowNames() {
  return Array.prototype.map.call(ambientGroup().querySelectorAll('.toggle-row .tr-name'),
    function (n) { return n.textContent; });
}
function rowByName(name) {
  var found = null;
  ambientGroup().querySelectorAll('.toggle-row').forEach(function (r) {
    if (r.querySelector('.tr-name').textContent === name) found = r;
  });
  return found;
}
function visible(el) { return !!el && el.offsetParent !== null; }

setTimeout(function () {
  try {
    var noAnim = document.createElement('style');
    noAnim.textContent = '#splash{display:none !important}';
    document.head.appendChild(noAnim);
    Store.reset();
    Themes.openDrawer();

    /* ============================================================
       the new themes exist and apply
       ============================================================ */
    var keys = Themes.THEMES.map(function (t) { return t.key; });
    ok('Amethyst is there', keys.indexOf('amethyst') !== -1);
    ok('Dunes is there', keys.indexOf('dunes') !== -1);
    ok('The Valley is there', keys.indexOf('valley') !== -1);
    ok('every theme has a card', document.querySelectorAll('.theme-card').length === Themes.THEMES.length,
       document.querySelectorAll('.theme-card').length);
    ok('every card shows its colours',
       document.querySelectorAll('.theme-card .theme-swatch i').length === Themes.THEMES.length * 3,
       document.querySelectorAll('.theme-card .theme-swatch i').length);

    Themes.THEMES.forEach(function (t) {
      Themes.apply(t.key);
      var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      ok(t.name + ' applies', document.documentElement.getAttribute('data-theme') === t.key &&
         document.body.getAttribute('data-bg') === t.key && bg.length > 0, bg);
    });

    /* ============================================================
       winter keeps its own extras
       ============================================================ */
    Themes.apply('winter');
    var wn = rowNames();
    ok('Winter offers snowfall', wn.indexOf('Snowfall') !== -1, wn.join('|'));
    ok('Winter offers scenery', wn.indexOf('Scenery') !== -1, wn.join('|'));
    ok('Winter offers the cat', wn.indexOf('Walking cat') !== -1, wn.join('|'));
    ok('the cat is nested under scenery',
       rowByName('Walking cat').parentNode.classList.contains('sub-rows'));
    ok('Winter has a snowman', document.querySelectorAll('#fx-scene .snowman').length === 1);

    /* turning scenery off hides the cat without rebuilding the drawer */
    var sceneSwitch = rowByName('Scenery').querySelector('.switch');
    var catRow = rowByName('Walking cat');
    sceneSwitch.click();
    ok('scenery off hides the cat row', !visible(catRow), 'still visible');
    ok('...the same switch element is still there', sceneSwitch.isConnected);
    ok('...and it shows as off', !sceneSwitch.classList.contains('on'));
    sceneSwitch.click();
    ok('scenery back on shows the cat again', visible(rowByName('Walking cat')));

    /* ============================================================
       themes with no particles offer no particle rows
       ============================================================ */
    ['amethyst', 'midnight', 'paper', 'slate'].forEach(function (k) {
      Store.mutate(function (s) { s.settings.newScene[k] = true; }, null, { silent: true });
      Themes.apply(k);
      var n = rowNames();
      ok(k + ' offers no snowfall row', n.indexOf('Snowfall') === -1, n.join('|'));
      ok(k + ' ...nor the cat', n.indexOf('Walking cat') === -1, n.join('|'));
      ok(k + ' runs no particles', !document.getElementById('fx-snow').classList.contains('on'));
      ok(k + ' ...but still draws its own scenery',
         document.getElementById('fx-scene').children.length > 0);
    });
    ok('no ambient row is left greyed out',
       document.querySelectorAll('#settings-body .toggle-row[style*="opacity"]').length === 0);

    /* ============================================================
       the switch itself
       ============================================================ */
    Themes.apply('winter');
    var sw = rowByName('Loading splash').querySelector('.switch');
    ok('the splash switch starts on', sw.classList.contains('on'));
    /* Transitions do not tick under the virtual clock, so a colour read
       straight after a click would still be the one it is moving away from.
       With them off the computed style is the settled value. */
    var noTrans = document.createElement('style');
    noTrans.textContent = '*, *::before, *::after { transition: none !important; }';
    document.head.appendChild(noTrans);
    var onBg = getComputedStyle(sw).backgroundColor;

    sw.click();
    ok('clicking it turns it off in place', !sw.classList.contains('on'));
    ok('...without replacing the element', sw.isConnected);
    ok('...and the colour actually changes', getComputedStyle(sw).backgroundColor !== onBg,
       getComputedStyle(sw).backgroundColor + ' vs ' + onBg);
    ok('...to something that is not the accent',
       getComputedStyle(sw).backgroundColor !== 'rgb(92, 200, 255)',
       getComputedStyle(sw).backgroundColor);
    ok('...the knob slides back', getComputedStyle(sw, '::after').transform === 'none' ||
       getComputedStyle(sw, '::after').transform.indexOf('matrix(1, 0, 0, 1, 0, 0)') !== -1,
       getComputedStyle(sw, '::after').transform);
    ok('...aria follows', sw.getAttribute('aria-checked') === 'false');
    ok('...the setting followed', Store.settings().splash === false);
    ok('...and the splash settings hid', !visible(document.querySelector('[data-slider="How long it holds"]')));

    sw.click();
    ok('clicking again turns it back on', sw.classList.contains('on'));
    ok('...restoring the colour', getComputedStyle(sw).backgroundColor === onBg);
    ok('...and the splash settings came back',
       visible(document.querySelector('[data-slider="How long it holds"]')));
    noTrans.remove();

    /* ---------- persistence ---------- */
    Themes.apply('amethyst');
    Store.mutate(function (s) { s.settings.polish.amethyst = false; }, null, { silent: true });
    Store.flush();
    var saved = JSON.parse(localStorage.getItem('flowlist.state.v1'));
    ok('the polish setting is saved', !!saved.settings.polish);
    ok('the theme is saved', saved.settings.theme === 'amethyst', saved.settings.theme);

    var legacy = JSON.parse(Store.exportJSON());
    delete legacy.settings.polish;
    delete legacy.settings.newScene;
    Store.importJSON(JSON.stringify(legacy));
    ok('an older save gets the graph back off, the way Amethyst ships',
       Store.settings().newScene && Store.settings().newScene.amethyst === false);

    Themes.apply('winter');
    Themes.closeDrawer();
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }

  document.title = 'THEME ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre');
  pre.id = 'themeresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
