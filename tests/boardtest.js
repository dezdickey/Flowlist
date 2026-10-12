/* the Board rail button + the catchphrase size setting */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function drawerRow(name) { return document.querySelector('[data-slider="' + name + '"]'); }
function shown(id) { return getComputedStyle(document.getElementById(id)).display !== 'none'; }

setTimeout(function () {
  try {
    var noAnim = document.createElement('style');
    noAnim.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
    document.head.appendChild(noAnim);

    /* ============================================================
       the Board button
       ============================================================ */
    var board = document.getElementById('btn-view-board');
    ok('there is a Board button', !!board);
    ok('it is labelled Board', board.querySelector('span').textContent === 'Board',
       board.querySelector('span').textContent);

    var rail = document.getElementById('rail');
    var btns = rail.querySelectorAll('.rail-btn');
    ok('it sits above the other rail buttons', btns[0] === board,
       btns[0] ? btns[0].id : 'none');
    ok('the rest follow it', btns[1].id === 'btn-panel-lists', btns[1].id);
    ok('it is separated from them',
       board.nextElementSibling && board.nextElementSibling.classList.contains('rail-sep'));

    /* on the board to start with */
    Store.reset();
    ok('starts on the board', Store.get().view === 'board');
    ok('the Board button is marked as the live view', board.classList.contains('view-on'));
    ok('the Canvas button is not', !document.getElementById('btn-panel-canvas').classList.contains('view-on'));

    /* go to the canvas, then come back with the button */
    document.getElementById('btn-panel-canvas').click();
    ok('the canvas takes over', Store.get().view === 'canvas' && shown('canvas-wrap'));
    ok('the board is put away', !shown('board-wrap'));
    ok('the Board button is no longer marked', !board.classList.contains('view-on'));
    ok('the Canvas button is', document.getElementById('btn-panel-canvas').classList.contains('view-on'));

    board.click();
    ok('Board brings the board back', Store.get().view === 'board');
    ok('...it is actually on screen', shown('board-wrap'), 'hidden');
    ok('...the canvas is put away', !shown('canvas-wrap'));
    ok('...and the marker moved back', board.classList.contains('view-on') &&
       !document.getElementById('btn-panel-canvas').classList.contains('view-on'));
    ok('...with the columns drawn', document.querySelectorAll('#board .list').length === Store.get().board.length,
       document.querySelectorAll('#board .list').length);

    /* it leaves the panels exactly as they were */
    Store.mutate(function (s) { s.settings.panels = { lists: false, presets: true, canvas: false, today: true }; }, ['panels']);
    document.getElementById('btn-panel-canvas').click();
    var before = JSON.stringify(Store.settings().panels);
    board.click();
    ok('Board does not disturb the panels', JSON.stringify(Store.settings().panels) === before,
       JSON.stringify(Store.settings().panels));

    /* works from focus mode, where every panel is shut */
    Store.setView('canvas');
    Store.mutate(function (s) { s.settings.panels = { lists: false, presets: false, canvas: false, today: false }; }, ['panels']);
    board.click();
    ok('Board works with every panel closed', Store.get().view === 'board' && shown('board-wrap'));

    /* pressing it while already on the board is harmless */
    var listsNow = document.querySelectorAll('#board .list').length;
    board.click();
    ok('pressing it again changes nothing', Store.get().view === 'board' &&
       document.querySelectorAll('#board .list').length === listsNow);

    /* ============================================================
       catchphrase size
       ============================================================ */
    Store.reset();
    ok('there is a default size', Store.settings().splashPhraseSize === 14, Store.settings().splashPhraseSize);
    ok('it is applied to the page',
       document.documentElement.style.getPropertyValue('--splash-phrase') === '14px',
       document.documentElement.style.getPropertyValue('--splash-phrase'));
    ok('the phrase actually renders at it',
       getComputedStyle(document.getElementById('splash-phrase')).fontSize === '14px',
       getComputedStyle(document.getElementById('splash-phrase')).fontSize);

    Themes.openDrawer();
    var row = drawerRow('Catchphrase size');
    ok('the drawer offers a size slider', !!row);
    ok('it runs from 10', row.querySelector('input').min === '10');
    ok('...up to 32', row.querySelector('input').max === '32');
    ok('it steps by 1', row.querySelector('input').step === '1');
    ok('the readout shows px', row.querySelector('.num-val').textContent === '14px',
       row.querySelector('.num-val').textContent);

    var inp = row.querySelector('input');
    inp.value = 24;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    ok('moving it stores the size', Store.settings().splashPhraseSize === 24, Store.settings().splashPhraseSize);
    ok('...and the phrase grows straight away',
       getComputedStyle(document.getElementById('splash-phrase')).fontSize === '24px',
       getComputedStyle(document.getElementById('splash-phrase')).fontSize);
    ok('...and the readout follows', row.querySelector('.num-val').textContent === '24px',
       row.querySelector('.num-val').textContent);

    inp.value = 10;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    ok('it goes small too', getComputedStyle(document.getElementById('splash-phrase')).fontSize === '10px',
       getComputedStyle(document.getElementById('splash-phrase')).fontSize);

    /* a long phrase wraps rather than running off the edge */
    inp.value = 30;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('splash-phrase').textContent =
      'Checking nothing fell behind the sofa and putting the important things on top';
    var pw = document.getElementById('splash-phrase').getBoundingClientRect().width;
    ok('a long phrase stays inside the window', pw < window.innerWidth, Math.round(pw));

    /* it hides with the splash toggle, like the delay does */
    var t = null;
    document.querySelectorAll('#settings-body .toggle-row').forEach(function (r) {
      if (r.textContent.indexOf('Loading splash') !== -1) t = r;
    });
    t.querySelector('.switch').click();
    ok('turning the splash off hides the size slider', !drawerRow('Catchphrase size'));
    var t2 = null;
    document.querySelectorAll('#settings-body .toggle-row').forEach(function (r) {
      if (r.textContent.indexOf('Loading splash') !== -1) t2 = r;
    });
    t2.querySelector('.switch').click();
    ok('and back on brings it back', !!drawerRow('Catchphrase size'));

    /* the preview uses the chosen size */
    App.previewSplash();
    ok('preview shows the phrase at the chosen size',
       getComputedStyle(document.getElementById('splash-phrase')).fontSize === '30px',
       getComputedStyle(document.getElementById('splash-phrase')).fontSize);
    document.body.classList.remove('splash-show');

    /* ---------- persistence ---------- */
    Store.mutate(function (s) { s.settings.splashPhraseSize = 19; }, null, { silent: true });
    Store.flush();
    var saved = JSON.parse(localStorage.getItem('flowlist.state.v1'));
    ok('the size is saved', saved.settings.splashPhraseSize === 19, saved.settings.splashPhraseSize);

    var legacy = JSON.parse(Store.exportJSON());
    delete legacy.settings.splashPhraseSize;
    Store.importJSON(JSON.stringify(legacy));
    ok('an older save gets the default size', Store.settings().splashPhraseSize === 14,
       Store.settings().splashPhraseSize);

    Themes.closeDrawer();
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }

  document.title = 'BOARD ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre');
  pre.id = 'boardresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
