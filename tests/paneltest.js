/* per-surface panel memory + the board's full-screen button */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function open(k) { return document.getElementById('panel-' + k).classList.contains('open'); }
function snap() { return ['lists', 'presets', 'canvas', 'today'].map(function (k) { return k + (open(k) ? '1' : '0'); }).join(' '); }
function P(k) { return Store.settings().panels[Store.get().view][k]; }
function full() { return document.getElementById('btn-fullscreen'); }
function rail(k) { return document.getElementById('btn-panel-' + k); }
function board() { return document.getElementById('btn-view-board'); }
function shown(el) { return getComputedStyle(el).display !== 'none'; }

setTimeout(function () {
  try {
    var noAnim = document.createElement('style');
    noAnim.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}' +
                         '#splash{display:none !important}';
    document.head.appendChild(noAnim);
    Store.reset();

    /* ============================================================
       the full-screen button
       ============================================================ */
    ok('there is a full-screen button', !!full());
    var actions = document.querySelectorAll('.topbar-actions .icon-btn');
    ok('undo comes first, then full screen',
       actions[0] && actions[0].id === 'btn-undo' && actions[1] === full(),
       [].map.call(actions, function (b) { return b.id; }).join(','));
    ok('...and there are five buttons up there', actions.length === 5, actions.length);
    ok('it uses the canvas corner icon',
       full().querySelector('svg path').getAttribute('d').indexOf('M3 8V4h4') === 0,
       full().querySelector('svg path').getAttribute('d'));

    ok('it shows on the board', shown(full()));
    Store.setView('canvas');
    ok('...and hides on the canvas, which has its own', !shown(full()));
    Store.setView('board');
    ok('...and comes back on the board', shown(full()));

    /* it clears the panels away and puts them back */
    ok('panels start open', open('lists') && open('today'), snap());
    full().click();
    ok('pressing it clears the panels', !open('lists') && !open('presets') && !open('today'), snap());
    ok('...the rail stays', document.getElementById('rail').offsetWidth > 0);
    ok('...and the board is still there', shown(document.getElementById('board-wrap')));
    ok('...the button marks itself as active', full().classList.contains('on'));
    full().click();
    ok('pressing it again puts them back', open('lists') && open('today'), snap());
    ok('...and unmarks itself', !full().classList.contains('on'));

    /* focus is remembered per surface */
    full().click();                       // board hidden
    Store.setView('canvas');
    ok('hiding on the board does not hide the canvas panels', open('lists'), snap());
    Store.setView('board');
    ok('...and the board is still hidden', !open('lists'), snap());
    full().click();

    /* ============================================================
       the canvases column never belongs on the board
       ============================================================ */
    Store.reset();
    ok('the board starts without it', !open('canvas'), snap());
    rail('canvas').click();
    ok('pressing Canvas goes to the canvas', Store.get().view === 'canvas');
    ok('...and brings the column with it', open('canvas'), snap());
    board().click();
    ok('going back to the board takes it away', !open('canvas'), snap());
    ok('...even though the canvas still wants it',
       Store.settings().panels.canvas.canvas === true);
    rail('canvas').click();
    ok('returning to the canvas brings it back', open('canvas'), snap());

    /* unless you closed it yourself */
    document.querySelector('#panel-canvas .panel-close').click();
    ok('closing it on the canvas is remembered', !open('canvas') && P('canvas') === false);
    board().click();
    rail('canvas').click();
    ok('...so it stays closed when you come back', !open('canvas'), snap());
    ok('...and pressing Canvas again opens it', (rail('canvas').click(), open('canvas')), snap());

    /* forcing it true for the board still does not show it */
    Store.mutate(function (s) { s.settings.panels.board.canvas = true; }, ['panels']);
    board().click();
    ok('the board refuses to show it even if asked', !open('canvas'), snap());

    /* ============================================================
       Categories is remembered per surface
       ============================================================ */
    Store.reset();
    ok('open on both to begin with', open('lists'));
    document.querySelector('#panel-lists .panel-close').click();
    ok('closed on the board', !open('lists'), snap());

    rail('canvas').click();
    ok('...but still open on the canvas', open('lists'), snap());
    board().click();
    ok('...and still closed back on the board', !open('lists'), snap());
    rail('canvas').click();
    ok('...and still open on the canvas', open('lists'), snap());

    /* now the other way round */
    document.querySelector('#panel-lists .panel-close').click();
    ok('closed on the canvas too', !open('lists'), snap());
    board().click();
    ok('the board is still closed', !open('lists'));
    rail('lists').click();
    ok('reopening on the board works', open('lists'));
    rail('canvas').click();
    ok('...and leaves the canvas closed', !open('lists'), snap());
    rail('lists').click();
    ok('reopening on the canvas works too', open('lists'));
    board().click();
    ok('...and the board keeps its own answer', open('lists'));

    /* Presets and Today are per-surface as well */
    Store.reset();
    rail('presets').click();
    ok('Presets opened on the board', open('presets'));
    rail('canvas').click();
    ok('...and is closed on the canvas', !open('presets'), snap());
    board().click();
    ok('...still open on the board', open('presets'));

    Store.reset();
    ok('Today is open on the board', open('today'));
    rail('canvas').click();
    ok('...and closed on the canvas', !open('today'), snap());
    rail('today').click();
    ok('opening it on the canvas works', open('today'));
    board().click();
    ok('...and the board is unchanged', open('today'));

    /* ============================================================
       an older save is split in two
       ============================================================ */
    var legacy = JSON.parse(Store.exportJSON());
    legacy.settings.panels = { lists: false, presets: true, canvas: true, today: false };
    delete legacy.settings.panelsBeforeFocus;
    Store.importJSON(JSON.stringify(legacy));
    var p = Store.settings().panels;
    ok('a pre-split save becomes two sets',
       !!p.board && !!p.canvas && typeof p.lists !== 'boolean', JSON.stringify(p));
    ok('...carrying the old answers across', p.board.lists === false && p.board.presets === true &&
       p.canvas.lists === false && p.canvas.presets === true, JSON.stringify(p));
    ok('...but never the canvases column on the board', p.board.canvas === false);
    ok('...while the canvas keeps it', p.canvas.canvas === true);
    ok('...and it still renders', !open('lists') && open('presets'), snap());

    /* ============================================================
       persistence
       ============================================================ */
    Store.reset();
    document.querySelector('#panel-lists .panel-close').click();   // close on the board only
    Store.flush();
    var saved = JSON.parse(localStorage.getItem('flowlist.state.v1')).settings.panels;
    ok('both sets are saved', !!saved.board && !!saved.canvas, JSON.stringify(saved));
    ok('...with the board closed', saved.board.lists === false);
    ok('...and the canvas untouched', saved.canvas.lists === true);

    board().click();
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }

  document.title = 'PANEL ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre');
  pre.id = 'panelresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
