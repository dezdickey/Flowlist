/*
 * Batch C: Settings across the screen, dressed for each theme; a switch for
 * every shortcut; and Valley Old.
 *
 *  - Settings is a sheet over most of the window: the sections down the
 *    side, each a button that takes you to it and lights up as you pass,
 *    and a box across the top that narrows the page to what matches.
 *  - Settings and the right-click menus wear the theme they are in, unless
 *    "Themed menus" is switched off. Every theme has its own, and every
 *    picture in them has to actually draw.
 *  - Every key Flowlist answers to has a switch, and a key switched off is
 *    ignored while the rest go on working.
 *  - Valley Old is the Valley as the password screen shows it: the same
 *    picture, with nothing laid over the board.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 60); }); };

var sheet = function () { return document.getElementById('settings'); };
var body = function () { return document.getElementById('settings-body'); };
var box = function () { return document.getElementById('settings-search'); };
var navBtns = function () { return [].slice.call(document.querySelectorAll('#settings-nav .nav-item')); };
var groups = function () { return [].slice.call(document.querySelectorAll('#settings-body > .set-group')); };
var shown = function (el) { return !!el && getComputedStyle(el).display !== 'none'; };
var shownGroups = function () { return groups().filter(shown).map(function (g) { return g.dataset.group; }); };
var lit = function () { var b = document.querySelector('#settings-nav .nav-item.on'); return b && b.dataset.group; };
var groupOf = function (slug) { return document.querySelector('#settings-body > .set-group[data-group="' + slug + '"]'); };
var keyRow = function (id) { return document.querySelector('#settings-body .key-row[data-key="' + id + '"]'); };
var panels = function () { var s = Store.get(); return JSON.parse(JSON.stringify(s.settings.panels[s.view] || s.settings.panels.board)); };
function search(q) { box().value = q; box().dispatchEvent(new Event('input', { bubbles: true })); }
function press(k, opts, target) {
  var e = new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, opts || {}));
  (target || window).dispatchEvent(e);
  return e;
}
function rowNamed(re) {
  return [].slice.call(document.querySelectorAll('#settings-body .toggle-row')).filter(function (r) {
    var n = r.querySelector('.tr-name'); return n && re.test(n.textContent);
  })[0];
}
function cssVar(el, name) { return getComputedStyle(el).getPropertyValue(name).trim(); }
function svgUrls(v) {
  var out = [], re = /url\("(data:image\/svg\+xml,[^"]*)"\)/g, m;
  while ((m = re.exec(v))) out.push(m[1]);
  return out;
}
function draws(url) {
  return new Promise(function (r) {
    var i = new Image();
    i.onload = function () { r(i.naturalWidth > 0 || i.width > 0); };
    i.onerror = function () { r(false); };
    i.src = url;
  });
}
function board() {
  var st = JSON.parse(Store.exportState());
  var mk = function (id, text) { return { id: id, text: text, detail: '', expanded: false, done: false, hour: null }; };
  st.lists = [
    { id: 'Lwork', name: 'Work', color: '#5cc8ff', collapsed: false, items: [mk('N1', 'First'), mk('N2', 'Second')] },
    { id: 'Lhome', name: 'Home', color: '#6ee7a0', collapsed: false, items: [mk('H1', 'At home')] }
  ];
  st.board = ['Lwork', 'Lhome']; st.closedOrder = [];
  st.today = [];
  st.settings.layout = 'desktop';
  st.settings.theme = 'winter';
  delete st.settings.keysOff;
  delete st.settings.menuSkin;
  return st;
}

setTimeout(function () {
  (async function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    Store.importJSON(JSON.stringify(board()));
    Mobile.apply();
    Themes.apply('winter');
    await wait(300);

    Themes.apply('valley');
    await wait(200);
    var wrap = document.getElementById('board-wrap');
    var valleyTint = getComputedStyle(wrap).backgroundColor;
    var valleyScene = document.getElementById('fx-scene').innerHTML.length;
    ok('the Valley lays a tint over the whole board', valleyTint !== 'rgba(0, 0, 0, 0)' && valleyTint !== 'transparent', valleyTint);

    /* ================================================================ THE SHEET */
    Themes.apply('winter');
    await wait(150);
    Themes.openDrawer();
    sheet().style.transition = 'none';           /* opened all the way: the test clock makes no frames to grow it in */
    await wait(150);
    var r = sheet().getBoundingClientRect();
    ok('Settings opens as a sheet across the screen', sheet().classList.contains('show') && r.width > innerWidth * 0.6,
       Math.round(r.width) + ' of ' + innerWidth);
    ok('...not a strip down the edge: it is centred', Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 4,
       r.left + '..' + r.right);
    ok('...and tall', r.height > innerHeight * 0.6, Math.round(r.height));
    ok('...with the finder across the top', !!box() && box().closest('.drawer-head') !== null);

    var gs = groups();
    ok('it has its sections', gs.length >= 8, gs.length);
    eq('...a button down the side for each, in the same order',
       navBtns().map(function (b) { return b.dataset.group; }), gs.map(function (g) { return g.dataset.group; }));
    eq('...named the same', navBtns().map(function (b) { return b.textContent.trim(); }),
       gs.map(function (g) { return g.dataset.label; }));
    ok('...each section with its heading and its icon', gs.every(function (g) {
      return g.querySelector('.set-label .ic') && g.querySelector('.set-label span').textContent === g.dataset.label;
    }));
    ok('...and the headings still read as just their names', groupOf('shortcuts').querySelector('.set-label').textContent === 'Shortcuts');
    eq('the first section is lit to start', lit(), gs[0].dataset.group);
    var nb = navBtns()[1];
    var onB = document.querySelector('#settings-nav .nav-item.on');
    ok('its marker and icon change only colour - never size or see-through-ness, which re-sorts every layer on the page',
       getComputedStyle(onB, '::before').transform === 'none' && getComputedStyle(nb, '::before').transform === 'none' &&
       getComputedStyle(onB.querySelector('.ic')).opacity === getComputedStyle(nb.querySelector('.ic')).opacity &&
       getComputedStyle(onB, '::before').backgroundColor !== getComputedStyle(nb, '::before').backgroundColor);
    var hoverRule = null;
    [].forEach.call(document.styleSheets, function (sh) { try { [].forEach.call(sh.cssRules, function (r) { if (r.selectorText === '.theme-card:hover') hoverRule = r; }); } catch (e) {} });
    ok('a theme card under the pointer lights up without moving', hoverRule && !hoverRule.style.transform, hoverRule && hoverRule.style.transform);
    ok('...and at once, not easing, so a scroll past it does not repaint it frame after frame',
       getComputedStyle(document.querySelector('.theme-card')).transitionDuration.split(',').every(function (d) { return parseFloat(d) === 0; }));
    ok('the lit section changes at once, not with a fade - a fade of colour repaints the page every frame of a scroll',
       getComputedStyle(nb).transitionDuration.split(',').every(function (d) { return parseFloat(d) === 0; }) &&
       getComputedStyle(nb, '::before').transitionDuration.split(',').every(function (d) { return parseFloat(d) === 0; }),
       getComputedStyle(nb).transitionDuration + ' / ' + getComputedStyle(nb, '::before').transitionDuration);

    /* the buttons down the side */
    var sc = navBtns().filter(function (b) { return b.dataset.group === 'shortcuts'; })[0];
    /* the page glides there; the test clock has no frames to glide on, so it jumps */
    var aimed = null;
    body().scrollTo = function (o) { aimed = o; body().scrollTop = o.top; };
    sc.click();
    ok('(it asked to glide)', aimed && aimed.behavior === 'smooth', JSON.stringify(aimed));
    eq('its button lights the section at once', lit(), 'shortcuts');
    await wait(1600);
    var gap = groupOf('shortcuts').getBoundingClientRect().top - body().getBoundingClientRect().top;
    var atEnd = body().scrollTop + body().clientHeight >= body().scrollHeight - 2;
    ok('...and takes the page to it - or as near as the end of the page lets it', gap > -4 && (gap < 40 || atEnd), Math.round(gap) + (atEnd ? ' at the end' : ''));
    eq('...which stays lit once it gets there', lit(), 'shortcuts');
    ok('...with a moment of light round it', groupOf('shortcuts').classList.contains('flash'));
    delete body().scrollTo;

    body().scrollTop = 0;
    body().dispatchEvent(new Event('scroll'));
    await wait(200);
    eq('scrolling back to the top lights the first again', lit(), gs[0].dataset.group);
    var data = groupOf('data');
    body().scrollTop = data.getBoundingClientRect().top - body().getBoundingClientRect().top + body().scrollTop - 4;
    body().dispatchEvent(new Event('scroll'));
    ok('it does not measure the page on every scroll event - each one restyles the whole page mid-scroll',
       lit() !== 'data', lit());
    await wait(200);
    eq('...and scrolling to a section lights that one', lit(), 'data');
    if (lit() !== 'data') OUT.push('      data at ' + Math.round(data.getBoundingClientRect().top - body().getBoundingClientRect().top) + ', scrollTop ' + body().scrollTop + ' of ' + body().scrollHeight + '-' + body().clientHeight);
    /* a last section too short to reach the top of the page still lights at the very end */
    var tail = [].slice.call(groupOf('shortcuts').children).filter(function (c) { return !c.classList.contains('set-label'); });
    tail.forEach(function (c) { c.style.display = 'none'; });
    body().scrollTop = body().scrollHeight;
    body().dispatchEvent(new Event('scroll'));
    await wait(200);
    eq('...and at the very end, the last one, however short', lit(), 'shortcuts');
    tail.forEach(function (c) { c.style.display = ''; });

    /* the finder */
    body().scrollTop = 0;
    search('fill the screen');
    await wait(50);
    eq('finding a setting leaves only its section', shownGroups(), ['layout']);
    ok('...and in it, only what matches', shown(rowNamed(/^Fill the screen$/)) &&
       !shown(rowNamed(/^Categories panel$/)), '');
    ok('...the other sections leave the side as well', navBtns().filter(shown).length === 1);
    search('SYNC');
    await wait(50);
    ok('it does not mind capitals', shownGroups().indexOf('sync') !== -1, shownGroups().join(','));
    search('shortcuts');
    await wait(50);
    var kr = groupOf('shortcuts').querySelectorAll('.key-row');
    ok('a section found by its own name shows all of itself', shown(groupOf('shortcuts')) &&
       [].every.call(kr, shown), kr.length);
    search('backspace');
    await wait(50);
    ok('a shortcut can be found by its key', shown(keyRow('noteBackspace')) && !shown(keyRow('undo')));
    search('zzqqxx');
    await wait(50);
    eq('something that matches nothing leaves no sections', shownGroups(), []);
    var none = body().querySelector('.set-none');
    ok('...and says so', shown(none) && /zzqqxx/.test(none.textContent), none && none.textContent);
    press('Escape', {}, box());
    await wait(50);
    eq('Escape in the finder empties it first', box().value, '');
    eq('...and everything is back', shownGroups().length, gs.length);
    ok('...without closing Settings', sheet().classList.contains('show'));
    ok('...and the nothing-matches line is gone', !body().querySelector('.set-none'));
    box().focus();
    press('Escape', {}, box());
    await wait(50);
    ok('Escape in the empty finder closes Settings', !sheet().classList.contains('show'));

    Themes.openDrawer();
    search('sync');
    document.getElementById('settings-close').click();
    Themes.openDrawer();
    await wait(50);
    eq('closing forgets what was being found', box().value, '');
    eq('...so it opens on everything', shownGroups().length, gs.length);
    Themes.closeDrawer();
    sheet().style.transition = 'none';           /* the fade needs frames the test clock does not make */
    ok('closed, it cannot be clicked or seen', getComputedStyle(sheet()).visibility === 'hidden' && getComputedStyle(sheet()).opacity === '0');
    sheet().style.transition = '';

    /* ================================================================ THEMED MENUS */
    ok('the menus are dressed to start with', document.body.classList.contains('menu-skin'));
    Themes.openDrawer();
    var skinRow = rowNamed(/^Themed menus$/);
    ok('the switch is in Settings', !!skinRow);
    ok('...in the Theme section', skinRow && skinRow.closest('.set-group') === groupOf('theme'));
    ok('...and on', skinRow && skinRow.querySelector('.switch').classList.contains('on'));

    /* every theme: its own look, on and off, with every picture drawing */
    var ctx = document.getElementById('ctx');
    var looks = {}, broken = [], same = [], plainArt = [], menusSame = [], unsolid = [];
    var solid = function () {
      var cs = getComputedStyle(body()), m = cs.backgroundColor.match(/rgba?\(([^)]*)\)/);
      var p = m ? m[1].split(',').map(parseFloat) : [0, 0, 0, 0];
      return (p.length < 4 || p[3] === 1) && /local/.test(cs.backgroundAttachment);
    };
    var drawerLook = function () {
      return ['--sk-bg', '--sk-head', '--sk-head-art', '--sk-card', '--sk-mark', '--sk-nav']
        .map(function (n) { return cssVar(sheet(), n); }).join(' | ');
    };
    var menuLook = function () {
      var cs = getComputedStyle(ctx), b = getComputedStyle(ctx, '::before');
      return [cs.backgroundColor, cs.backgroundImage, cs.borderTopColor, cs.borderTopLeftRadius, cs.boxShadow, b.backgroundImage, b.backgroundColor].join(' | ');
    };
    for (var i = 0; i < Themes.THEMES.length; i++) {
      var key = Themes.THEMES[i].key;
      Themes.apply(key);
      document.body.classList.add('menu-skin');
      var on = drawerLook(), mOn = menuLook();
      if (!solid()) unsolid.push(key);
      var urls = svgUrls(on);
      for (var u = 0; u < urls.length; u++) { if (!(await draws(urls[u]))) broken.push(key + ' #' + u); }
      document.body.classList.remove('menu-skin');
      var off = drawerLook(), mOff = menuLook();
      if (!solid()) unsolid.push(key + ' plain');
      if (on === off) same.push(key);
      if (mOn === mOff) menusSame.push(key);
      if (cssVar(sheet(), '--sk-head-art') !== 'none') plainArt.push(key);
      looks[key] = on;
      document.body.classList.add('menu-skin');
    }
    eq('every theme dresses Settings its own way', same, []);
    eq('...and its right-click menus', menusSame, []);
    eq('every picture in them draws', broken, []);
    eq('in every theme the page scrolls over something solid, dressed or plain', unsolid, []);
    eq('switched off, none of them has a picture', plainArt, []);
    var distinct = {};
    Object.keys(looks).forEach(function (k) { distinct[looks[k]] = (distinct[looks[k]] || []).concat(k); });
    var shared = Object.keys(distinct).map(function (k) { return distinct[k]; }).filter(function (ks) { return ks.length > 1; });
    eq('no two themes look the same', shared.map(function (s) { return s.sort().join('+'); }),
       []);

    Themes.apply('midnight');
    Themes.openDrawer();
    var head = getComputedStyle(document.querySelector('#settings .drawer-head')).backgroundImage;
    ok('dressed, the top of Settings carries the theme\'s picture', /data:image\/svg/.test(head), head.slice(0, 60));
    skinRow = rowNamed(/^Themed menus$/);
    skinRow.querySelector('.switch').click();
    await wait(60);
    ok('switching it off undresses them', !document.body.classList.contains('menu-skin'));
    eq('...remembered with the board', Store.settings().menuSkin, false);
    head = getComputedStyle(document.querySelector('#settings .drawer-head')).backgroundImage;
    ok('...and the picture is gone', !/data:image\/svg/.test(head), head.slice(0, 60));
    Themes.apply('slate');
    ok('...and stays off through a change of theme', !document.body.classList.contains('menu-skin'));
    Themes.openDrawer();
    rowNamed(/^Themed menus$/).querySelector('.switch').click();
    await wait(60);
    ok('switching it back on dresses them again', document.body.classList.contains('menu-skin') && Store.settings().menuSkin === true);
    Themes.closeDrawer();

    /* none of it moves or blurs: it sits over a scene that is moving */
    var still = [];
    [].forEach.call(document.styleSheets, function (s) {
      var rules; try { rules = s.cssRules; } catch (e) { return; }
      [].forEach.call(rules, function (rule) {
        if (!rule.selectorText || !/menu-skin/.test(rule.selectorText)) return;
        var st = rule.style;
        if ((st.animationName && st.animationName !== 'none') || st.animation || st.backdropFilter || st.filter) still.push(rule.selectorText.slice(0, 60));
      });
    });
    eq('nothing in the dressed menus animates or blurs', still, []);

    /* ================================================================ SHORTCUTS */
    Themes.apply('winter');
    Themes.openDrawer();
    ok('every shortcut has a row in Settings', Keys.LIST.every(function (k) { return !!keyRow(k.id); }),
       Keys.LIST.filter(function (k) { return !keyRow(k.id); }).map(function (k) { return k.id; }).join(','));
    ok('...showing its key', Keys.LIST.every(function (k) { return keyRow(k.id).querySelector('.keycap').textContent === k.keys; }));
    ok('...and what it does', Keys.LIST.every(function (k) { return keyRow(k.id).textContent.indexOf(k.what) !== -1; }));
    ok('...all switched on to start', Keys.LIST.every(function (k) { return keyRow(k.id).querySelector('.switch').classList.contains('on'); }));
    ok('...grouped by where they work', groupOf('shortcuts').querySelectorAll('.key-where').length >= 3);
    Themes.closeDrawer();
    document.activeElement && document.activeElement.blur && document.activeElement.blur();

    /* [ shows and hides Categories */
    var before = panels().lists;
    press('[');
    await wait(60);
    ok('[ shows or hides Categories', panels().lists === !before);
    press('[');
    await wait(60);
    Themes.openDrawer();
    keyRow('lists').querySelector('.switch').click();
    Themes.closeDrawer();
    await wait(60);
    eq('switching [ off is remembered with the board', Store.settings().keysOff, { lists: true });
    ok('...and it is off', !Keys.on('lists'));
    before = panels().lists;
    press('[');
    await wait(60);
    eq('...so [ does nothing', panels().lists, before);
    var tb = panels().today;
    press(']');
    await wait(60);
    ok('...while ] still works', panels().today === !tb);
    press(']');
    await wait(60);
    Themes.openDrawer();
    ok('...and its row shows it off', !keyRow('lists').querySelector('.switch').classList.contains('on'));
    keyRow('lists').querySelector('.switch').click();
    Themes.closeDrawer();
    await wait(60);
    press('[');
    await wait(60);
    ok('switched back on, [ works again', panels().lists === !before);
    press('[');
    await wait(60);
    ok('...and nothing is left switched off', !Object.keys(Store.settings().keysOff || {}).length, JSON.stringify(Store.settings().keysOff));

    /* , opens Settings; Escape closes it */
    press(',');
    await wait(60);
    ok(', opens Settings', sheet().classList.contains('show'));
    Keys.set('close', false);
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    press('Escape');
    await wait(60);
    ok('with Escape off, Escape leaves it open', sheet().classList.contains('show'));
    box().focus();
    press('Escape', {}, box());
    await wait(60);
    ok('...even from the finder', sheet().classList.contains('show'));
    box().blur();
    Keys.set('close', true);
    press('Escape');
    await wait(60);
    ok('with it on, Escape closes it', !sheet().classList.contains('show'));
    Keys.set('settings', false);
    press(',');
    await wait(60);
    ok('with , off, , does not open it', !sheet().classList.contains('show'));
    Keys.set('settings', true);

    /* Ctrl+Z */
    Store.undoClear();
    Store.deleteNote('Lhome', 'H1');
    await wait(60);
    Keys.set('undo', false);
    press('z', { ctrlKey: true });
    await wait(80);
    ok('with Ctrl+Z off, it brings nothing back', !Store.listById('Lhome').items.length);
    Keys.set('undo', true);
    press('z', { ctrlKey: true });
    await wait(80);
    ok('with it on, it does', Store.listById('Lhome').items.length === 1);

    /* Backspace in an empty note */
    var made = Store.addNote('Lwork', 0, '');
    await wait(120);
    var madeId = made && made.id ? made.id : Store.listById('Lwork').items[0].id;
    var ta = function () { return document.querySelector('[data-list-id="Lwork"] [data-item-id="' + madeId + '"] .note-text'); };
    ok('(an empty note to try it on)', !!ta());
    Keys.set('noteBackspace', false);
    ta().focus();
    press('Backspace', {}, ta());
    await wait(80);
    ok('with Backspace off, an empty note is not deleted by it', !!Store.listById('Lwork').items.filter(function (i) { return i.id === madeId; })[0]);
    Keys.set('noteBackspace', true);
    ta().focus();
    press('Backspace', {}, ta());
    await wait(80);
    ok('with it on, it is', !Store.listById('Lwork').items.filter(function (i) { return i.id === madeId; })[0]);
    document.activeElement && document.activeElement.blur && document.activeElement.blur();

    /* Enter in a note */
    var n1 = function () { return document.querySelector('[data-list-id="Lwork"] [data-item-id="N1"] .note-text'); };
    var count = Store.listById('Lwork').items.length;
    Keys.set('noteEnter', false);
    n1().focus();
    press('Enter', {}, n1());
    await wait(80);
    eq('with Enter off, it does not start a new note', Store.listById('Lwork').items.length, count);
    Keys.set('noteEnter', true);
    document.activeElement.blur();

    /* the canvas keys */
    Store.setView('canvas');
    await wait(150);
    var vp = document.getElementById('canvas-viewport');
    press('v');
    await wait(40);
    var tool0 = vp && vp.dataset.tool;
    Keys.set('canvasPen', false);
    press('p');
    await wait(40);
    eq('on the canvas, with P off, the pen is not picked up', vp && vp.dataset.tool, tool0);
    Keys.set('canvasPen', true);
    press('p');
    await wait(40);
    eq('...with it on, it is', vp && vp.dataset.tool, 'pen');
    press('v');
    Store.setView('board');
    await wait(100);

    /* all at once */
    Themes.openDrawer();
    var allBtns = [].slice.call(groupOf('shortcuts').querySelectorAll('.key-all .set-mini'));
    allBtns.filter(function (b) { return /off/.test(b.textContent); })[0].click();
    await wait(60);
    ok('"Switch them all off" switches every one off', Keys.LIST.every(function (k) { return !Keys.on(k.id); }));
    ok('...and every row shows it', Keys.LIST.every(function (k) { return !keyRow(k.id).querySelector('.switch').classList.contains('on'); }));
    Themes.closeDrawer();
    before = panels().lists;
    press('[');
    await wait(60);
    eq('...so none of them answers', panels().lists, before);
    ok('...and the setting travels with the board', /"keysOff"/.test(Store.exportState()));
    Themes.openDrawer();
    [].slice.call(groupOf('shortcuts').querySelectorAll('.key-all .set-mini')).filter(function (b) { return /on/.test(b.textContent); })[0].click();
    await wait(60);
    ok('"Switch them all on" brings every one back', Keys.LIST.every(function (k) { return Keys.on(k.id); }));
    Themes.closeDrawer();
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'MENU ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'menuresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
