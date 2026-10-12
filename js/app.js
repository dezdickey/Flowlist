/* ============================================================
   Flowlist — bootstrap
   Splash, panel toggles, keyboard shortcuts, wiring it together.
   ============================================================ */
(function () {

  /* ============================================================
     SPLASH
     ============================================================ */
  const PHRASES = [
    'Stacking the day into neat little columns…',
    'Waking the snowman…',
    'Teaching the cat to walk in a straight line…',
    'Sorting yesterday out of the way…',
    'Warming up the drag handles…',
    'Counting what is left to do…',
    'Shaking the snow globe…',
    'Lining the hours up…',
    'Putting the important things on top…',
    'Brewing something to get started on…',
    'Folding the lists into place…',
    'Checking nothing fell behind the sofa…',
    'Sharpening the pencils…',
    'Letting the widgets stretch their legs…'
  ];

  const randomPhrase = () => PHRASES[Math.floor(Math.random() * PHRASES.length)];

  /** Match the progress bar to however long the splash is set to hold. */
  function timeSplashBar(ms) {
    const bar = document.querySelector('.splash-bar i');
    if (bar) bar.style.animationDuration = Math.max(280, ms - 120) + 'ms';
  }

  /* The board is drawn in about a fifth of a second. The splash then held
     it back for two more, which is most of what Ctrl+Shift+F felt like: not
     a slow app, a slow curtain. It holds for a fraction of that now, and
     the slider in Settings still means exactly what it says. */
  const SPLASH_MS = 600;      // the hold, unless Settings says otherwise

  function splash() {
    const el = document.getElementById('splash');
    const phrase = document.getElementById('splash-phrase');
    const s = Store.settings();
    const delay = Math.max(0, s.splashDelay === undefined ? SPLASH_MS : s.splashDelay);
    let over = false;

    const done = () => {
      if (over) return;
      over = true;
      document.body.classList.remove('booting');
      document.body.classList.add('loaded');
    };

    // the element stays in the DOM (hidden) so the preview button can replay it
    if (!s.splash || delay === 0) { done(); return; }

    phrase.textContent = randomPhrase();
    timeSplashBar(delay);
    setTimeout(done, delay);
  }

  /** Replay the splash over the running app, for tuning the delay. */
  function previewSplash() {
    const el = document.getElementById('splash');
    if (!el) return;
    const delay = Math.max(200, Store.settings().splashDelay || 2000);
    const phrase = document.getElementById('splash-phrase');
    if (phrase) phrase.textContent = randomPhrase();

    const bar = el.querySelector('.splash-bar i');
    if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    timeSplashBar(delay);

    document.body.classList.add('splash-show');
    clearTimeout(previewSplash.timer);
    previewSplash.timer = setTimeout(() => document.body.classList.remove('splash-show'), delay);
  }

  window.App = {
    previewSplash, randomPhrase, undo, paintUndo,
    /* the boot splash, so its early-out can be tested without a reload */
    splash,
    toggleFocus: () => toggleFocus(),
    refreshZen: () => refreshZen(),
    inZen: () => zen
  };

  /* ============================================================
     PANELS
     ============================================================ */
  const panels = {
    lists:   { el: document.getElementById('panel-lists'),   btn: document.getElementById('btn-panel-lists') },
    presets: { el: document.getElementById('panel-presets'), btn: document.getElementById('btn-panel-presets') },
    canvas:  { el: document.getElementById('panel-canvas'),  btn: document.getElementById('btn-panel-canvas') },
    today:   { el: document.getElementById('panel-today'),   btn: document.getElementById('btn-panel-today') }
  };

  /* ============================================================
     BRINGING BACK WHAT WAS DELETED

     One button, next to the others, and Ctrl+Z. It says what it would
     bring back rather than just "Undo", because a board is a place where
     you delete a note and then wonder, a minute later, which one it was.
     See the trash in js/store.js — deletions only, twenty deep.
     ============================================================ */
  const undoBtn = document.getElementById('btn-undo');

  function paintUndo() {
    if (!undoBtn) return;
    const last = Store.undoPeek();
    undoBtn.disabled = !last;
    undoBtn.title = last ? 'Bring back ' + last.name : 'Nothing to bring back';
  }

  function undo() {
    const back = Store.undoLast();
    paintUndo();
    if (!back) { UI.toast('Nothing to bring back.'); return; }
    UI.toast(back.name.charAt(0).toUpperCase() + back.name.slice(1) + ' is back.');
  }

  const boardBtn = document.getElementById('btn-view-board');
  const fullBtn = document.getElementById('btn-fullscreen');

  /** The panel set belonging to whichever surface is showing. */
  const panelsFor = view => {
    const p = Store.settings().panels || {};
    if (typeof p.lists === 'boolean') return p;      // a stray pre-split set
    return p[view] || p.board || {};
  };
  const currentPanels = () => panelsFor(Store.get().view);

  /* ---- which surface is showing ----
     Three of them now: the board, the canvas and the calendar. Each owns
     the middle of the window outright, so exactly one is on and the other
     two are put away. */
  const calBtn = document.getElementById('btn-view-calendar');
  const SURFACES = {
    board:    document.getElementById('board-wrap'),
    canvas:   document.getElementById('canvas-wrap'),
    calendar: document.getElementById('calendar-wrap')
  };

  function syncView() {
    const view = Store.get().view;
    const onCanvas = view === 'canvas';
    const onCal = view === 'calendar';
    Object.keys(SURFACES).forEach(k => {
      if (SURFACES[k]) SURFACES[k].style.display = (k === view || (k === 'board' && !SURFACES[view])) ? '' : 'none';
    });
    panels.canvas.btn.classList.toggle('view-on', onCanvas);
    if (calBtn) calBtn.classList.toggle('view-on', onCal);
    boardBtn.classList.toggle('view-on', !onCanvas && !onCal);
    // the canvas and the calendar have their own room; the board's control is theirs alone
    fullBtn.style.display = (onCanvas || onCal) ? 'none' : '';
    if ((onCanvas || onCal) && zen) setZen(false);   // never strand a surface hidden
    syncPanels();                       // each surface has its own layout
    if (onCanvas) {
      Canvas.render();
      Canvas.applyTransform();
    } else if (onCal) {
      Calendar.render();
    } else {
      Lists.syncGrabline();
      Presets.renderBands();
    }
  }

  function syncPanels() {
    const p = currentPanels();
    /* the list of canvases belongs to the canvas alone - on the board and on
       the calendar it is no use, so it never opens there */
    const onCanvas = Store.get().view === 'canvas';
    /* On a phone a panel is a sheet over the whole board, so two of them open
       at once is not a layout — it is one hiding the other. Whatever put the
       state that way (a reset, a restored backup, a window pulled narrow),
       this is where it gets straightened out. Opening one from the rail always
       shuts the others first, so more than one up can only have come from
       somewhere else — and the right answer to that is the board itself. */
    if (Mobile.isPhone()) {
      const up = Object.keys(panels).filter(k => p[k]);
      if (up.length > 1) {
        Layouts.quietly(() => Store.mutate(() => { up.forEach(k => { p[k] = false; }); }, null, { silent: true }));
      }
    }
    Object.keys(panels).forEach(k => {
      const open = !!p[k] && !(!onCanvas && k === 'canvas');
      panels[k].el.classList.toggle('open', open);
      panels[k].btn.classList.toggle('on', open);
    });
    /* Do Today is a day in a column, and so is the calendar's own day
       panel; both at once leaves the month too thin to read, so the
       calendar gives its one up while the dock is open. */
    if (SURFACES.calendar) SURFACES.calendar.classList.toggle('tight', !!p.today);
    // widths changed — the board's overflow maths needs a beat to settle
    setTimeout(() => {
      Lists.syncGrabline();
      Presets.renderBands();
      Canvas.applyTransform();
    }, 330);
  }

  function togglePanel(key) {
    // the rail stays clickable in the lighter full screen; using it steps out
    if (zen) setZen(false);
    const s0 = Store.get();
    const p0 = s0.settings.panels[s0.view] || s0.settings.panels.board;
    const opening = !p0[key];
    /* on a phone a panel is a sheet over the whole board, so only one of
       them can be up at a time — and the others going down to make room is
       not you closing them, so it is done quietly (js/layouts.js) */
    if (opening && Mobile.isPhone()) {
      Layouts.quietly(() => Store.mutate(s => {
        const p = s.settings.panels[s.view] || s.settings.panels.board;
        Object.keys(p).forEach(k => { if (k !== key) p[k] = false; });
      }, null, { silent: true }));
    }
    Store.mutate(s => {
      const p = s.settings.panels[s.view] || s.settings.panels.board;
      p[key] = opening;
    }, null, { silent: true });
    syncPanels();
  }

  /* ---- full screen: nothing but the backdrop ----
     Deliberately not saved. It is a way of looking at the app for a moment,
     not a preference, and reloading into an apparently empty page would be a
     poor surprise. */
  const zenExit = document.getElementById('zen-exit');
  let zen = false;

  const hideAll = () => Store.settings().zenHideAll === true;

  /** Re-apply the classes for the current mode — the setting can change live. */
  function refreshZen() {
    const all = hideAll();
    document.body.classList.toggle('zen', zen);
    document.body.classList.toggle('zen-all', zen && all);
    // the corner button is only needed when the top bar has gone with everything else
    zenExit.classList.toggle('show', zen && all);
    fullBtn.classList.toggle('on', zen);
  }

  function setZen(on) {
    zen = on;
    if (on) Themes.closeDrawer();
    refreshZen();
  }
  const toggleZen = () => setZen(!zen);

  /**
   * Clear the side panels away from whichever surface is showing, and put them
   * back the way they were. The canvas toolbar's button runs through here.
   */
  function toggleFocus() {
    const view = Store.get().view;
    const p = currentPanels();
    const anyOpen = p.lists || p.presets || p.canvas || p.today;
    Store.mutate(s => {
      if (anyOpen) {
        s.settings.panelsBeforeFocus[view] = Object.assign({}, p);
        s.settings.panels[view] = { lists: false, presets: false, canvas: false, today: false };
      } else {
        s.settings.panels[view] = s.settings.panelsBeforeFocus[view] ||
          { lists: true, presets: false, canvas: view === 'canvas', today: view !== 'canvas' };
      }
    }, null, { silent: true });
    syncPanels();
    UI.toast(anyOpen ? 'Panels hidden — the rail on the left still switches views.' : 'Panels back.');
  }

  /**
   * Lists / Presets / Today are plain panel toggles.
   *
   * Canvas is the one that switches surface: the first press opens the canvas
   * with the Categories column beside it, and every press after that just
   * shows or hides the list of canvases. Categories is left alone from then
   * on — it closes only when you close it.
   */
  function railClick(key) {
    if (zen) setZen(false);
    if (key !== 'canvas') { togglePanel(key); return; }

    // Arriving restores the canvas's own layout — including whether you had
    // the list of canvases open when you last left it. Once here, the button
    // just shows or hides that list.
    if (Store.get().view !== 'canvas') Store.setView('canvas');
    else togglePanel('canvas');
  }

  /* ============================================================
     KEYBOARD
     ============================================================ */
  function keys(e) {
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);

    /* Ctrl+Z, wherever you are — except in a box you are typing in, where
       the browser's own undo is the one you mean */
    if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && Keys.on('undo')) {
      e.preventDefault();
      undo();
      return;
    }

    if (e.key === 'Escape' && !typing && Keys.on('close')) {
      if (zen) { setZen(false); return; }
      Themes.closeDrawer();
      document.getElementById('widget-tray').classList.remove('show');
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    // with the whole frame gone there is nothing to see change, so stay put
    if (zen && hideAll()) return;

    // the canvas owns v/p/a/e/f while it is showing
    if (Store.get().view === 'canvas' && 'vpaefs'.indexOf(e.key.toLowerCase()) !== -1) return;

    /* each one only if it is switched on - Settings, Shortcuts; see js/shortcuts.js */
    const id = { '[': 'lists', ']': 'todayBracket', p: 'presets', t: 'todayT', c: 'canvas',
                 b: 'board', n: 'newNote', ',': 'settings' }[e.key.toLowerCase()];
    if (id && !Keys.on(id)) return;

    switch (e.key.toLowerCase()) {
      case '[': togglePanel('lists'); break;
      case ']': togglePanel('today'); break;
      case 'p': togglePanel('presets'); break;
      case 't': togglePanel('today'); break;
      case 'c': railClick('canvas'); break;
      case 'b': Store.setView('board'); break;
      case 'n': {
        const first = Store.get().board.find(id => { const l = Store.listById(id); return l && !l.collapsed; });
        if (first) { e.preventDefault(); document.querySelector('[data-list-id="' + first + '"] .act-add').click(); }
        break;
      }
      case ',': Themes.openDrawer(); break;
      default: break;
    }
  }

  /* ============================================================
     GO
     ============================================================ */
  function boot() {
    // panel close chevrons
    document.querySelectorAll('.panel-close').forEach(b => {
      b.onclick = () => togglePanel(b.dataset.close);
    });
    boardBtn.onclick = () => { if (zen) setZen(false); Store.setView('board'); };
    /* The calendar is a surface, so its rail button switches to it and a
       second press comes back - there is no panel of its own to toggle. */
    if (calBtn) calBtn.onclick = () => {
      if (zen) setZen(false);
      const going = Store.get().view !== 'calendar';
      Store.setView(going ? 'calendar' : 'board');
      /* On a desktop Do Today sits beside the calendar and is what you drag
         from. On a phone a panel is a sheet over the whole window, so the
         same setting means tapping Calendar shows the dock and not the
         calendar at all. Arriving clears it - opening it again is one tap,
         and quietly, so the phone doing this does not close the dock on the
         desktop through sync. */
      if (going && Mobile.isPhone()) {
        Layouts.quietly(() => Store.mutate(s => {
          const p = s.settings.panels.calendar;
          if (p) Object.keys(p).forEach(k => { p[k] = false; });
        }, null, { silent: true }));
        syncPanels();
      }
    };
    fullBtn.onclick = toggleZen;
    zenExit.onclick = function () { setZen(false); };
    panels.lists.btn.onclick = () => railClick('lists');
    panels.presets.btn.onclick = () => railClick('presets');
    panels.canvas.btn.onclick = () => railClick('canvas');
    panels.today.btn.onclick = () => railClick('today');

    Lists.init();
    Today.init();
    Presets.init();
    Remove.init();
    Canvas.init();
    Calendar.init();
    /* after the store is up: it decides whether this board is shut */
    Unlock.init();
    Widgets.init();
    Themes.init();
    Confetti.init();
    Mobile.init();
    Layouts.init();            // after Mobile, which decides which shape this is
    Sync.init();
    Ntfy.init();
    Lock.init();

    /* keep a copy on the device, so a launch needs no network — js/offline.js */
    Offline.start();

    /* one touch from now, the browser bars go away — see js/fullscreen.js */
    Fullscreen.arm();

    Store.on('view', syncView);
    Store.on('panels', syncPanels);
    Store.on('*', () => { syncView(); syncPanels(); });

    syncPanels();
    syncView();
    window.addEventListener('keydown', keys);
    if (undoBtn) undoBtn.onclick = undo;
    /* the button has to know when something has been deleted, or come back */
    Store.onPersist(paintUndo);
    paintUndo();

    // keep the board maths honest after any layout shift
    window.addEventListener('resize', () => { Lists.syncGrabline(); Presets.renderBands(); });

    splash();

    // a note left mid-edit must survive the tab going away: the save is
    // debounced, so force it out before the page is torn down
    const flush = () => {
      const a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) a.blur();
      Store.flush();
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
