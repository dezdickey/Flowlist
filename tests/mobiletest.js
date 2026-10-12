var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var isPhone = function () { return document.body.classList.contains('phone'); };
var panels = function () { return Store.settings().panels[Store.get().view]; };
var openCount = function () {
  var p = panels();
  return ['lists', 'presets', 'canvas', 'today'].filter(function (k) { return p[k]; }).length;
};
function setLayout(v) {
  Store.mutate(function (s) { s.settings.layout = v; }, null, { silent: true });
  Mobile.apply();
}
function listW() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--list-w'));
}
function rowNames() {
  return [].slice.call(document.querySelectorAll('#settings-body .tr-name'))
    .map(function (r) { return r.textContent; });
}
function segRow(name) {
  return [].slice.call(document.querySelectorAll('#settings-body .tr-name')).filter(function (r) {
    return r.textContent === name;
  }).map(function (r) { return r.parentElement; })[0];
}

setTimeout(function () {
  try {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    var noAnim = document.createElement('style');
    noAnim.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
    document.head.appendChild(noAnim);
    document.body.classList.remove('booting');
    document.body.classList.add('loaded');
    Store.reset();

    /* the harness window is narrower than the turnover, so auto means phone here */
    ok('this window is on the narrow side of the turnover',
       window.innerWidth <= Mobile.NARROW, window.innerWidth + ' vs ' + Mobile.NARROW);

    /* ============================================================
       the three shapes
       ============================================================ */
    setLayout('auto');
    ok('auto follows the window', isPhone());
    setLayout('desktop');
    ok('asking for desktop holds the wide shape even here', !isPhone());
    setLayout('phone');
    ok('asking for phone gives the phone shape', isPhone());
    setLayout('auto');
    eq('...and it is remembered', Store.settings().layout, 'auto');

    /* ============================================================
       the rail becomes a bar along the bottom
       ============================================================ */
    setLayout('phone');
    var rail = document.getElementById('rail');
    var r = rail.getBoundingClientRect();
    eq('the rail is fixed to the bottom', getComputedStyle(rail).position, 'fixed');
    ok('...running across the window', Math.round(r.width) === window.innerWidth,
       Math.round(r.width) + ' of ' + window.innerWidth);
    ok('...sitting at the foot of it', Math.round(r.bottom) === window.innerHeight,
       Math.round(r.bottom) + ' of ' + window.innerHeight);
    eq('...laid out in a row', getComputedStyle(rail).flexDirection, 'row');
    var label = document.querySelector('.rail-btn span');
    ok('the buttons keep their labels', label.getBoundingClientRect().height > 8,
       label.getBoundingClientRect().height);
    ok('...and are big enough for a thumb',
       document.querySelector('.rail-btn').getBoundingClientRect().height >= 44,
       document.querySelector('.rail-btn').getBoundingClientRect().height);
    ok('nothing hides under the bar',
       parseFloat(getComputedStyle(document.getElementById('main')).paddingBottom) >= 56);

    setLayout('desktop');
    eq('back on the desktop the rail is a column again',
       getComputedStyle(document.getElementById('rail')).flexDirection, 'column');
    ok('...down the side', getComputedStyle(document.getElementById('rail')).position !== 'fixed');

    /* ============================================================
       columns fill the screen and are swiped
       ============================================================ */
    setLayout('desktop');
    eq('on the desktop a column is the width you set', listW(), Store.settings().listWidth);
    setLayout('phone');
    eq('on a phone it is the width of the screen, less the margins',
       listW(), Math.max(240, window.innerWidth - 26));
    ok('...and the board snaps to one at a time',
       getComputedStyle(document.getElementById('board')).scrollSnapType.indexOf('x') === 0,
       getComputedStyle(document.getElementById('board')).scrollSnapType);
    var col = document.querySelector('#board .list');
    if (col) {
      ok('...a column really is that wide', Math.abs(col.getBoundingClientRect().width - listW()) < 2,
         col.getBoundingClientRect().width + ' vs ' + listW());
    } else { ok('...a column really is that wide (none open to measure)', true); }

    /* the width slider still belongs to the desktop */
    Store.mutate(function (s) { s.settings.listWidth = 340; }, null, { silent: true });
    Mobile.syncWidth();
    eq('moving the width slider does not shrink a phone column',
       listW(), Math.max(240, window.innerWidth - 26));
    setLayout('desktop');
    Mobile.syncWidth();
    eq('...but it does on the desktop', listW(), 340);

    /* ============================================================
       panels become sheets, one at a time
       ============================================================ */
    setLayout('desktop');
    Store.mutate(function (s) {
      var p = s.settings.panels.board;
      p.lists = true; p.today = true;
    }, ['panels']);
    eq('two panels can be open side by side on the desktop', openCount(), 2);

    setLayout('phone');
    eq('arriving on a phone closes them and shows the board', openCount(), 0);

    document.getElementById('btn-panel-lists').click();
    eq('the rail opens one sheet', openCount(), 1);
    ok('...that one', panels().lists);
    var sheet = document.getElementById('panel-lists');
    eq('...as an overlay, not a column', getComputedStyle(sheet).position, 'fixed');
    ok('...across the whole width',
       Math.round(sheet.getBoundingClientRect().width) === window.innerWidth);

    document.getElementById('btn-panel-today').click();
    eq('opening another closes the first', openCount(), 1);
    ok('...leaving the new one up', panels().today && !panels().lists);
    document.getElementById('btn-panel-today').click();
    eq('and pressing it again puts it away', openCount(), 0);

    /* a restored backup with several open is straightened out */
    Store.mutate(function (s) {
      var p = s.settings.panels.board;
      p.lists = true; p.presets = true; p.today = true;
    }, ['panels']);
    eq('a saved layout with several sheets lands on the board instead', openCount(), 0);

    /* ============================================================
       the setting itself
       ============================================================ */
    Themes.openDrawer();
    var names = rowNames();
    ok('Layout is the first thing in Settings', names[0] === 'Shape', names.slice(0, 3).join(' | '));
    var seg = segRow('Shape').querySelectorAll('.seg');
    eq('...with three choices', seg.length, 3);
    eq('...auto first', seg[0].textContent, 'Auto');
    eq('...then phone', seg[1].textContent, 'Phone');
    eq('...then desktop', seg[2].textContent, 'Desktop');
    seg[2].click();
    ok('picking desktop takes the wide shape', !isPhone() && Store.settings().layout === 'desktop');
    seg[1].click();
    ok('picking phone takes the phone shape', isPhone() && Store.settings().layout === 'phone');
    seg[0].click();
    eq('and auto goes back to following the window', Store.settings().layout, 'auto');
    Themes.closeDrawer();

    /* saved, and old saves keep the wide shape they knew */
    Store.flush();
    eq('the choice is saved',
       JSON.parse(localStorage.getItem('flowlist.state.v1')).settings.layout, 'auto');
    var older = JSON.parse(Store.exportJSON());
    delete older.settings.layout;
    Store.importJSON(JSON.stringify(older));
    eq('a save from before this existed comes back on auto', Store.settings().layout, 'auto');

    /* ============================================================
       the old narrow-window rules keep out of the way
       ============================================================ */
    setLayout('phone');
    ok('the rail labels are not hidden by the old narrow rules',
       getComputedStyle(document.querySelector('.rail-btn span')).display !== 'none');
    setLayout('desktop');
    ok('...and the wide shape still has its own narrow behaviour',
       getComputedStyle(document.getElementById('rail')).position === 'static' ||
       getComputedStyle(document.getElementById('rail')).position === 'relative');
    setLayout('auto');
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }
  document.title = 'MOBILE ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre'); pre.id = 'mobresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
