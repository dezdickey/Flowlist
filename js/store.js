/* ============================================================
   Flowlist — Store
   Single source of truth + persistence + pub/sub.

   Everything the UI knows goes through here. Swapping localStorage
   for a real backend means replacing load()/persist() only:
   keep the same shape, make persist() POST, make load() await a GET.
   ============================================================ */
const Store = (function () {
  /* Where the board lives. Routed through Profiles so a second profile keeps
     its own, while the first keeps the original name and never moves. */
  const KEY = () => Profiles.key('state.v1');

  const PALETTE = [
    '#5cc8ff', '#7c8dff', '#b78bff', '#ff6fae', '#f4586a',
    '#ff9d4d', '#f2c94c', '#6ee7a0', '#12a594', '#8fb7ff',
    '#c2683a', '#9aa4b2', '#e0629a', '#37e6ff'
  ];

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* the Completed category's id — the same on every device; see setDone */
  const COMPLETED_ID = 'completed';

  /* ---------- default seed ---------- */
  function seed() {
    /* the same shape a category has after a load, so a fresh board and a saved
       one are never subtly different */
    const mk = (name, color, items, extra) => Object.assign({
      id: uid(), name, color, collapsed: false, items: (items || []).map(t => note(t))
    }, extra || {});

    const uncategorized = mk('Uncategorized', PALETTE[9], []);
    const work = mk('Work', PALETTE[0], [
      'Review the Q3 numbers',
      'Reply to the vendor thread',
      'Draft the sprint plan'
    ]);
    const home = mk('Home', PALETTE[7], [
      'Water the plants',
      'Fix the closet door'
    ]);
    const errands = mk('Errands', PALETTE[5], [
      'Pick up prescription',
      'Return the package'
    ]);

    work.items[0].detail = 'Right-click any note for its menu. Click the little arrow to open this detail box — it grows as you type and scrolls once it hits its limit.';

    const scratch = canvas('Scratch', PALETTE[2]);

    return {
      v: 2,
      view: 'board',                      // 'board' | 'canvas'
      settings: {
        theme: 'winter',
        snow: true,
        scene: true,
        /* the scene painted once and then left alone: the whole picture, none of
           the per-frame work. See #fx-scene.still in themes.css */
        sceneStill: false,
        cat: true,
        /* per theme: off strips the gradients, glows and backdrop wash for a
           flat look. Absent means on. Keyed by theme so each remembers. */
        polish: {},
        /* per theme: off puts a theme back the way it was before it was given
           a scene of its own. Absent means on - Amethyst's graph is the one
           that ships off, so the theme is quiet until you ask for it. */
        newScene: { amethyst: false },
        fxWind: true,                   // particles swerve around the pointer
        catChase: true,                 // Winter: the cat comes over to your cursor
        snowSettle: true,               // Winter: snow piles up, and you can sweep it
        fxConfetti: true,               // any theme: a burst when Today is cleared
        splash: true,
        splashDelay: 600,               // how long the splash holds, in ms
        splashPhraseSize: 14,           // catchphrase type size, in px
        /* auto | phone | desktop — auto picks by the width of the window */
        layout: 'auto',
        maxOpen: 10,
        listWidth: 296,
        /* each surface remembers its own layout — closing Categories on the
           board must not close it on the canvas, and vice versa */
        panels: {
          board:  { lists: true, presets: false, canvas: false, today: true },
          canvas: { lists: true, presets: false, canvas: true,  today: false },
          /* Do Today opens with the calendar because it is what you drag
             from: the board is put away on that surface, so without it
             there would be nothing on screen to put on a day. */
          calendar: { lists: false, presets: false, canvas: false, today: true }
        },
        panelsBeforeFocus: { board: null, canvas: null, calendar: null },
        /* full screen: off keeps the top bar and the rail, on takes those too */
        zenHideAll: false,
        todayTimeline: false,
        /* which layout changes cross from one shape to the other — see
           js/layouts.js. Keyed by the shape the change is made on. All off:
           the computer and the phone are laid out on their own. */
        layoutShare: {
          desktop: { categories: false, presets: false, canvases: false, today: false, lists: false },
          phone:   { categories: false, presets: false, canvases: false, today: false, lists: false }
        },
        widgetEdit: false,
        canvasScale: 1,
        canvasGrid: true,
        pasteScale: 100,                // how big a pasted picture lands, as a share of its own pixels
        canvasListOverflow: 'scroll',   // 'scroll' | 'count'
        canvasListRows: 8,              // rows shown before scrolling / counting
        weather: { lat: 40.7128, lon: -74.006, label: 'New York' },
        /* live sync through a Firebase Realtime Database — see js/sync.js.
           The room key is the whole of the security, so it is generated. */
        sync: {
          on: false,
          url: '',            // https://something.firebaseio.com
          room: '',           // the long random word the board lives under
          device: '',         // what this machine calls itself in the status line
          rev: 0,             // the revision we last saw or sent
          dirty: false,       // a change here has not reached the database yet
          warn: true,         // say so on screen when a change cannot go out
          /* ask for one password when the app opens, and work the room key and
             the encryption out from it. The hosted copy ships with this on. */
          gate: false,
          /* which picture the password screen shows */
          scene: 'valley',
          /* Keep the passphrase on this device, so it is asked for once and
             not again. On by default — a board you have to unlock every
             time you glance at it is a board you stop using.

             Turn it off and it is held for the session only, which is
             worth doing on anything that leaves the house: a phone that
             remembers is a phone that whoever picks it up can read. */
          remember: true,
          /* how many wrong tries the password screen allows before it shuts and
             wants a reload. Nothing but friction — anyone attacking the
             database never sees this screen — so it is off unless asked for. */
          tries: 0
        },
        /* phone notifications through ntfy — see js/ntfy.js. The topic word is
           generated the first time this is switched on: it works like a
           password, so it is not something to sit and make up. */
        ntfy: {
          on: false,
          server: 'https://ntfy.sh',
          topic: '',
          lead: 30,                 // minutes before the hour, main alert
          alert2: false,            // a second, earlier heads-up
          lead2: 50,
          timeFormat: 'compact',    // compact 10pm | spaced 10 PM | clock 10:00 PM | 24 22:00
          heading: 'left',          // left "In 30 min" | app | time | none
          priority: 'normal',       // low | normal | high | urgent
          skipDone: true,           // stay quiet about anything already ticked off
          ahead: false,             // hand them to ntfy early, so the app can be shut
          sender: '',               // with sync on, the one device that sends them
          sent: {}                  // key → the hour it belonged to, pruned after a day
        }
      },
      lists: [uncategorized, work, home, errands],
      board: [uncategorized.id],          // ids currently on the board, left→right
      closedOrder: [],                    // ids most-recently-closed first
      presets: [],
      today: [],                          // [{ listId, itemId }]
      canvases: [scratch],
      activeCanvas: scratch.id,
      widgets: [
        { id: uid(), type: 'clock' },
        { id: uid(), type: 'weather' },
        { id: uid(), type: 'progress' }
      ]
    };
  }

  function canvas(name, color) {
    return {
      id: uid(), name: name || 'Untitled', color: color || PALETTE[2],
      nodes: [],      // { id, kind:'note'|'ref'|'list', x, y, w, h, text?, color?, listId?, itemId? }
      edges: [],      // { id, from:{node|x,y}, to:{node|x,y}, color, width, arrow }
      strokes: [],    // { id, color, width, pts:[x,y,x,y,…] }
      pan: { x: 0, y: 0 },
      zoom: 1
    };
  }

  function note(text) {
    return { id: uid(), text: text || '', detail: '', expanded: false, done: false, hour: null, made: Date.now() };
  }

  /* Declared before the first load, because load() sets `sealed` and a
     `let` assigned before its declaration is a ReferenceError, not a
     warning. See the sealed-board note further down for what they do. */
  let sealed = false;      // this profile's board is kept encrypted
  let dataKey = null;      // ...and this opens it, once it has been handed over
  let readyCipher = null;  // the most recent sealed copy, ready for flush()

  /* ---------- load / persist ---------- */
  let state = load();
  let saveTimer = null;
  let frozen = false;   // suppress renders mid-drag

  function load() {
    try {
      const raw = localStorage.getItem(KEY());
      if (!raw) return withCompleted(seed());
      /* A sealed board cannot be opened here: the key is on a stick and
         reading it is asynchronous. Stand an empty board up so the app can
         boot and ask, and remember that what is on disk is the real one so
         `flush()` refuses to write over it in the meantime. */
      if (looksSealed(raw)) {
        sealed = true;
        return withCompleted(blank());
      }
      const s = JSON.parse(raw);
      return withCompleted(migrate(s));
    } catch (e) {
      console.warn('[Flowlist] could not read saved state, starting fresh.', e);
      return seed();
    }
  }

  /**
   * Is what is saved there a sealed board rather than a plain one?
   *
   * Deliberately decided here, from the shape of the thing, rather than by
   * asking KeyFile. A sealed board is valid JSON, so a store that does not
   * recognise it parses it as a board, finds nothing it knows, and writes
   * a fresh one straight over the top. That happened: keyfile.js was
   * loaded after store.js, `typeof KeyFile` was 'undefined' at load time,
   * and the board was destroyed on the next save. The script order is
   * fixed too, but nothing about keeping a board should depend on it.
   */
  function looksSealed(raw) {
    if (!raw) return false;
    try { const o = JSON.parse(raw); return !!(o && o.enc === 1 && o.iv && o.data); }
    catch (e) { return false; }
  }

  /** A board with nothing in it — not the sample one, which would look like data. */
  function blank() {
    const s = seed();
    s.lists = [];
    s.board = [];
    s.today = [];
    s.presets = [];
    return s;
  }

  /**
   * Read the board again from wherever it now lives, and tell everyone.
   *
   * Switching profiles changes which name `KEY()` answers with, and the
   * board already in memory belongs to the profile being left. Without
   * this, the next save would write the old board over the new profile's
   * own — so a switch must either reload the page or call this. Reloading
   * is what the app does, because every other module caches things too;
   * this exists so a switch is coherent even when it does not.
   */
  function reload() {
    /* Everything below belongs to the profile being left, and none of it
       carries over. Leaving `sealed` set is the dangerous one: the store
       would think the new board is encrypted, and `flush()` — which
       refuses to write a sealed board it has no key for — would quietly
       stop saving. The page reload in a normal switch hides this; the
       quiet switch does not, and `reload()` is public besides. */
    sealed = false;
    dataKey = null;
    readyCipher = null;
    trash = null;
    state = load();          // sets `sealed` again if the new board is one
    emit('*');
    return state;
  }

  /* Completed arrives once on every board, when the app opens. Not in
     migrate: that also reads every board that comes in by sync or from a
     backup, and a board from a device without Completed would grow one
     each time it arrived. Deleted after that, it is made again only by
     ticking something off. */
  function withCompleted(s) {
    if (!s.settings.completedMade) completedIn(s);
    return s;
  }

  function migrate(s) {
    const base = seed();
    s.v = s.v || 1;
    s.settings = Object.assign({}, base.settings, s.settings || {});
    /* panels used to be one flat set shared by both surfaces; split it in two */
    const oldPanels = s.settings.panels;
    if (oldPanels && typeof oldPanels.lists === 'boolean') {
      s.settings.panels = {
        board:  { lists: !!oldPanels.lists, presets: !!oldPanels.presets, canvas: false, today: !!oldPanels.today },
        canvas: { lists: !!oldPanels.lists, presets: !!oldPanels.presets, canvas: true,  today: !!oldPanels.today }
      };
    } else {
      s.settings.panels = Object.assign({}, base.settings.panels, oldPanels || {});
      ['board', 'canvas'].forEach(v => {
        s.settings.panels[v] = Object.assign({}, base.settings.panels[v], s.settings.panels[v] || {});
      });
    }
    s.settings.panels.board.canvas = false;      // never wanted on the board

    /* Polish is keyed by theme, so each one remembers its own setting */
    s.settings.polish = (s.settings.polish && typeof s.settings.polish === 'object' &&
      typeof s.settings.polish.length !== 'number') ? s.settings.polish : {};
    /* Amethyst's graph stays off unless this board has said otherwise, the
       same shape as panelsBeforeFocus below: the default survives a board
       saved before the key existed. */
    s.settings.newScene = Object.assign({ amethyst: false },
      (s.settings.newScene && typeof s.settings.newScene === 'object' &&
       typeof s.settings.newScene.length !== 'number') ? s.settings.newScene : {});
    s.settings.panelsBeforeFocus = Object.assign({ board: null, canvas: null },
      (s.settings.panelsBeforeFocus && typeof s.settings.panelsBeforeFocus.board !== 'boolean')
        ? s.settings.panelsBeforeFocus : {});
    /* two seconds of splash on a board that is ready in a fifth of one; a
       board saved under the old default is quickened once, and left alone
       after — it is a setting, and setting it back to two is allowed */
    if (!s.settings.splashQuickened) {
      if (s.settings.splashDelay === 2000) s.settings.splashDelay = 600;
      s.settings.splashQuickened = true;
    }
    /* the cap used to be five columns, for no reason anyone could name; a
       board saved under the old one is raised once, and left alone after */
    if (!s.settings.maxOpenRaised) {
      s.settings.maxOpen = Math.max(s.settings.maxOpen || 0, 10);
      s.settings.maxOpenRaised = true;
    }
    /* The calendar arrived after the panel sets were split per surface, so a
       board saved before it has none of its own. Without one, opening a panel
       there would quietly rearrange the board's instead — togglePanel falls
       back to the board when a surface has no set. */
    if (s.settings.panels && typeof s.settings.panels.lists !== 'boolean' && !s.settings.panels.calendar) {
      s.settings.panels.calendar = Object.assign({}, base.settings.panels.calendar);
    }
    if (s.settings.panelsBeforeFocus && s.settings.panelsBeforeFocus.calendar === undefined) {
      s.settings.panelsBeforeFocus.calendar = null;
    }
    s.settings.weather = Object.assign({}, base.settings.weather, s.settings.weather || {});
    s.settings.ntfy = Object.assign({}, base.settings.ntfy, s.settings.ntfy || {});
    s.settings.sync = Object.assign({}, base.settings.sync, s.settings.sync || {});
    /* the log of what has already been sent, so a reload does not buzz twice */
    if (!s.settings.ntfy.sent || typeof s.settings.ntfy.sent !== 'object') s.settings.ntfy.sent = {};
    s.lists = Array.isArray(s.lists) ? s.lists : base.lists;
    s.lists.forEach(l => {
      l.items = Array.isArray(l.items) ? l.items : [];
      l.items.forEach(i => {
        if (i.detail === undefined) i.detail = '';
        if (i.hour === undefined) i.hour = null;
        if (i.expanded === undefined) i.expanded = false;
        if (i.done === undefined) i.done = false;
      });
      if (l.collapsed === undefined) l.collapsed = false;
    });
    s.board = (s.board || []).filter(id => s.lists.some(l => l.id === id));
    s.closedOrder = (s.closedOrder || []).filter(id => s.lists.some(l => l.id === id));
    s.presets = (s.presets || []).map(p => ({
      id: p.id || uid(), name: p.name || 'Untitled',
      color: p.color || PALETTE[2], listIds: (p.listIds || []).filter(id => s.lists.some(l => l.id === id)),
      open: !!p.open
    }));
    s.today = (s.today || []).filter(t => {
      const l = s.lists.find(x => x.id === t.listId);
      return l && l.items.some(i => i.id === t.itemId);
    });
    s.widgets = s.widgets || base.widgets;

    /* ---- canvases (added in v2) ---- */
    s.view = s.view === 'canvas' ? 'canvas' : 'board';
    s.canvases = (s.canvases || []).map(c => ({
      id: c.id || uid(),
      name: c.name || 'Untitled',
      color: c.color || PALETTE[2],
      nodes: (c.nodes || []).map(n => Object.assign({ w: 210, h: 120 }, n)),
      edges: c.edges || [],
      strokes: c.strokes || [],
      pan: c.pan || { x: 0, y: 0 },
      zoom: c.zoom || 1
    }));
    if (!s.canvases.length) s.canvases = [canvas('Scratch', PALETTE[2])];
    if (!s.canvases.some(c => c.id === s.activeCanvas)) s.activeCanvas = s.canvases[0].id;
    s.v = 2;
    return s;
  }

  /* Anything that wants to know the board changed hangs off here — it is the
     one place every change passes through. Sync uses it to send. */
  const persistHooks = [];
  function onPersist(fn) { persistHooks.push(fn); }

  /* ---------- a board kept sealed ----------
     A profile whose key lives on a stick (js/keyfile.js) is written to
     disk encrypted. Two things make that awkward and both are handled
     here rather than left to the caller:

     Sealing is asynchronous and `flush()` is not — it has to finish inside
     `pagehide`, where there is no awaiting anything. So a fresh sealed
     copy is made after every change and kept ready, and `flush()` writes
     whichever one is ready. The gap that leaves is the millisecond or two
     between a change and its sealing finishing, and only if the window is
     closed inside it.

     And a sealed board must never be written over while still locked. If
     the key has not arrived yet, `state` is an empty placeholder, and
     saving that would destroy the real board. `flush()` refuses instead. */

  /** Is this profile's board kept sealed, and is it still shut? */
  const isSealed = () => sealed;
  const isShut = () => sealed && !dataKey;

  /**
   * Open a sealed board with the key that came off the stick (or out of the
   * backup passphrase), and let the app see it.
   * @returns {Promise<Boolean>} false if that key does not open it
   */
  async function unlockWith(key) {
    if (!sealed) return true;
    let raw = null;
    try { raw = localStorage.getItem(KEY()); } catch (e) { raw = null; }
    if (!raw) { dataKey = key; reseal(); return true; }   // nothing saved yet
    let opened = null;
    try { opened = await KeyFile.openBoard(key, raw); } catch (e) { return false; }
    if (!opened) return false;
    dataKey = key;
    state = withCompleted(migrate(opened));
    reseal();
    emit('*');
    return true;
  }

  /**
   * Start keeping this board sealed from now on, under this key. Used when
   * a profile is first protected: the board in memory is already the real
   * one, so it only has to be written back sealed.
   */
  function sealFrom(key) {
    sealed = true;
    dataKey = key;
    /* This board was plain until a moment ago, and the things that keep
       copies of it had no reason not to write them down: the trash holds
       whole deleted notes, and sync's "last agreed" holds the lot. Sealing
       the board and leaving those behind would be sealing the front door
       and leaving the copies on the step. They go now, and from here on
       neither is written for a sealed board at all.

       Removing them is not erasing them — the browser appends rather than
       overwrites, as everything else here keeps saying. What it does mean
       is that nothing is still *keeping* a readable copy. */
    [TRASH_KEY(), Profiles.key('syncbase.v1'), Profiles.key('beforejoin.v1')].forEach(name => {
      try { localStorage.removeItem(name); } catch (e) { /* already gone */ }
    });
    trash = [];
    reseal();
    return true;
  }

  /** Put it away again — switching off, or the stick pulled out. */
  function shut() {
    if (!sealed) return;
    dataKey = null;
    readyCipher = null;
    state = withCompleted(blank());
    emit('*');
  }

  function reseal() {
    if (!sealed || !dataKey) return;
    const at = state;
    KeyFile.sealBoard(dataKey, at)
      .then(txt => { if (state === at || true) readyCipher = txt; })
      .catch(e => console.warn('[Flowlist] could not seal the board', e));
  }

  function persist() {
    clearTimeout(saveTimer);
    reseal();
    saveTimer = setTimeout(flush, 140);
    persistHooks.forEach(fn => {
      try { fn(); } catch (e) { console.warn('[Flowlist] a save hook threw', e); }
    });
  }

  /**
   * Write immediately — used when the tab is going away, and after anything
   * big enough to be worth knowing about straight away.
   * @returns {Boolean} false when the browser refused it, which in practice
   *   means the roughly 5 MB it allows per site is full.
   */
  function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (sealed) {
      /* locked and not yet opened: what is in `state` is a placeholder, and
         writing it would be writing over the real board with nothing */
      if (!dataKey || !readyCipher) return false;
      try { localStorage.setItem(KEY(), readyCipher); return true; }
      catch (e) { console.warn('[Flowlist] save failed', e); return false; }
    }
    try { localStorage.setItem(KEY(), JSON.stringify(state)); return true; }
    catch (e) { console.warn('[Flowlist] save failed', e); return false; }
  }

  /* ---------- pub/sub ---------- */
  /* Wholesale replacements (reset, import) have to announce everything —
     leaving 'view' or 'panels' out strands the UI on the wrong surface. */
  const ALL_CHANNELS = ['lists', 'board', 'today', 'presets', 'canvases', 'canvas',
                        'view', 'panels', 'widgets', 'settings'];
  const subs = {};
  function on(channel, fn) { (subs[channel] = subs[channel] || []).push(fn); }
  /* Each listener once per change, however many of its channels the
     change names. Ticking a note names the board, Do Today and the lists,
     and the board was being built from scratch once for each of them. */
  function emit(channels) {
    if (frozen) return;
    const done = new Set();
    (Array.isArray(channels) ? channels : [channels]).forEach(ch => {
      (subs[ch] || []).forEach(fn => {
        if (done.has(fn)) return;
        done.add(fn);
        fn();
      });
    });
  }
  function freeze(v) { frozen = v; }

  /**
   * The only way to change state.
   * @param {Function} fn      receives the mutable state
   * @param {String|Array} ch  channel(s) to re-render: lists|board|today|presets|widgets|settings
   * @param {Object} opts      { silent:true } saves without re-rendering (used while typing)
   */
  function mutate(fn, ch, opts) {
    fn(state);
    persist();
    if (!(opts && opts.silent)) emit(ch || '*');
  }

  /* ---------- selectors ---------- */
  const get = () => state;
  const settings = () => state.settings;
  const listById = id => state.lists.find(l => l.id === id) || null;
  const itemById = (listId, itemId) => {
    const l = listById(listId);
    return l ? (l.items.find(i => i.id === itemId) || null) : null;
  };
  const presetById = id => state.presets.find(p => p.id === id) || null;
  const isOpen = id => state.board.indexOf(id) !== -1;
  const expandedCount = () =>
    state.board.filter(id => { const l = listById(id); return l && !l.collapsed; }).length;
  const atCapacity = () => expandedCount() >= state.settings.maxOpen;

  /* ---------- list operations ---------- */
  function openList(id, opts) {
    const l = listById(id);
    if (!l || isOpen(id)) return { ok: false, reason: 'already-open' };
    const collapsed = atCapacity();
    mutate(s => {
      l.collapsed = collapsed;
      l.presetId = (opts && opts.presetId) || null;
      if (opts && typeof opts.index === 'number') s.board.splice(opts.index, 0, id);
      else s.board.push(id);
      s.closedOrder = s.closedOrder.filter(x => x !== id);
    }, ['board', 'lists']);
    return { ok: true, collapsed };
  }

  function closeList(id) {
    mutate(s => {
      s.board = s.board.filter(x => x !== id);
      s.closedOrder = [id].concat(s.closedOrder.filter(x => x !== id));
      const l = listById(id);
      if (l) { l.collapsed = false; l.presetId = null; }
    }, ['board', 'lists']);
  }

  /** @returns {boolean} false when blocked by the open-list cap */
  function toggleCollapse(id) {
    const l = listById(id);
    if (!l) return false;
    if (l.collapsed && atCapacity()) return false;   // no room to expand
    mutate(() => { l.collapsed = !l.collapsed; }, ['board', 'lists']);
    return true;
  }

  function addList(name, color) {
    const l = { id: uid(), name: name || 'New category', color: color || pickColor(), items: [], collapsed: false };
    mutate(s => { s.lists.push(l); }, ['lists']);
    return l;
  }

  function deleteList(id) {
    const l0 = listById(id);
    if (l0) {
      remember({
        kind: 'list', name: String(l0.name || 'the category').trim() || 'the category',
        list: JSON.parse(JSON.stringify(l0)),
        listIndex: state.lists.indexOf(l0),
        boardIndex: state.board.indexOf(id),
        closedIndex: state.closedOrder.indexOf(id),
        today: state.today.map((t, i) => ({ listId: t.listId, itemId: t.itemId, index: i }))
          .filter(t => t.listId === id),
        presets: state.presets.map(p => ({ presetId: p.id, index: p.listIds.indexOf(id) }))
          .filter(p => p.index !== -1),
        cards: (state.canvases || []).map(c => {
          const nodes = (c.nodes || []).filter(n => n.listId === id);
          const ids = nodes.map(n => n.id);
          return { canvasId: c.id, nodes: JSON.parse(JSON.stringify(nodes)),
                   edges: JSON.parse(JSON.stringify((c.edges || []).filter(e =>
                     ids.indexOf(e.from.node) !== -1 || ids.indexOf(e.to.node) !== -1))) };
        }).filter(c => c.nodes.length)
      });
    }
    mutate(s => {
      s.lists = s.lists.filter(l => l.id !== id);
      s.board = s.board.filter(x => x !== id);
      s.closedOrder = s.closedOrder.filter(x => x !== id);
      s.today = s.today.filter(t => t.listId !== id);
      s.presets.forEach(p => { p.listIds = p.listIds.filter(x => x !== id); });
      s.canvases.forEach(c => {
        const gone = c.nodes.filter(n => n.listId === id).map(n => n.id);
        c.nodes = c.nodes.filter(n => n.listId !== id);
        c.edges = c.edges.filter(e => gone.indexOf(e.from.node) === -1 && gone.indexOf(e.to.node) === -1);
      });
    }, ['lists', 'board', 'today', 'presets', 'canvas']);
  }

  function pickColor() {
    const used = state.lists.map(l => l.color).concat(state.presets.map(p => p.color));
    return PALETTE.find(c => used.indexOf(c) === -1) || PALETTE[Math.floor(Math.random() * PALETTE.length)];
  }

  function moveListOnBoard(id, toIndex) {
    mutate(s => {
      const from = s.board.indexOf(id);
      if (from === -1) return;
      s.board.splice(from, 1);
      s.board.splice(toIndex, 0, id);
    }, ['board']);
  }

  /* ---------- note operations ---------- */
  function addNote(listId, index, text) {
    const l = listById(listId);
    if (!l) return null;
    const n = note(text);
    mutate(() => { l.items.splice(typeof index === 'number' ? index : 0, 0, n); }, ['board']);
    return n;
  }

  function deleteNote(listId, itemId) {
    const l0 = listById(listId);
    const gone = l0 ? l0.items.find(i => i.id === itemId) : null;
    if (gone) {
      const todayAt = state.today.findIndex(t => t.listId === listId && t.itemId === itemId);
      remember({
        kind: 'note', name: nameOfNote(gone), listId: listId,
        index: l0.items.indexOf(gone), item: JSON.parse(JSON.stringify(gone)),
        today: todayAt === -1 ? [] : [{ listId: listId, itemId: itemId, index: todayAt }]
      });
    }
    mutate(s => {
      const l = listById(listId);
      if (l) l.items = l.items.filter(i => i.id !== itemId);
      s.today = s.today.filter(t => !(t.listId === listId && t.itemId === itemId));
      s.canvases.forEach(c => {
        const gone = c.nodes.filter(n => n.itemId === itemId).map(n => n.id);
        c.nodes = c.nodes.filter(n => n.itemId !== itemId);
        c.edges = c.edges.filter(e => gone.indexOf(e.from.node) === -1 && gone.indexOf(e.to.node) === -1);
      });
    }, ['board', 'today', 'canvas']);
  }

  /* Reorder helpers all take toIndex as the item's FINAL position, i.e. the
     index in the array once the item has been lifted out of it. That is
     exactly what DND's placeholder computes (it skips the dragged element),
     so no off-by-one correction belongs here. */
  function moveNote(fromListId, itemId, toListId, toIndex) {
    mutate(() => {
      const from = listById(fromListId), to = listById(toListId);
      if (!from || !to) return;
      const idx = from.items.findIndex(i => i.id === itemId);
      if (idx === -1) return;
      const [n] = from.items.splice(idx, 1);
      to.items.splice(Math.max(0, Math.min(toIndex, to.items.length)), 0, n);

      /* Do Today and the canvases point at a note by list AND id. Moving it
         to another list without telling them left both pointing at a list
         the note had left: it dropped out of Do Today without a word, and
         its canvas card turned into "Note deleted". */
      if (fromListId !== toListId) {
        const moved = r => r.listId === fromListId && r.itemId === itemId;
        state.today.forEach(t => { if (moved(t)) t.listId = toListId; });
        (state.canvases || []).forEach(c => (c.nodes || []).forEach(nd => {
          if (nd.kind === 'ref' && moved(nd)) nd.listId = toListId;
        }));
      }
    }, ['board', 'today', 'canvas']);
  }

  /* ---------- completed ----------

     Ticking a note off puts a copy of it in Completed, and leaves the note
     itself where it is, ticked. The copy is a record of what got done:

       · on Do Today when it was ticked — the copy keeps its time and the
         Do Today mark, so the day can be read back afterwards
       · not on Do Today — just the note, no time and no mark

     Completed is an ordinary category with a fixed id, so two devices that
     each make one make the same one, and sync never ends up with two.
     Ticking something that is already in Completed makes no further copy.

     Unticking by mistake is common — a tap on the wrong row — so unticking
     the same day takes back the copy that tick made. A copy from an earlier
     day stays: a task ticked every day keeps each day's record. */
  function completedIn(s) {
    let box = s.lists.find(l => l.id === COMPLETED_ID);
    if (!box) {
      box = { id: COMPLETED_ID, name: 'Completed', color: PALETTE[8], items: [], collapsed: false };
      s.lists.push(box);
    }
    s.settings.completedMade = true;
    return box;
  }

  /**
   * Where a copy in Completed came from, as it should be shown: the list as
   * it is now — renamed, recoloured — while it still exists, and as it was
   * when the note was ticked once it does not. A copy made before this was
   * written down is traced back through the note it is a copy of.
   * @returns {Object|null} { name, color }
   */
  function sourceOf(copy) {
    if (!copy || !copy.copyOf) return null;
    const f = copy.from;
    const live = f && f.listId && f.listId !== COMPLETED_ID ? listById(f.listId) : null;
    if (live) return { name: live.name, color: live.color };
    if (f && f.name) return { name: f.name, color: f.color || PALETTE[11] };
    const home = state.lists.find(l => l.id !== COMPLETED_ID && (l.items || []).some(i => i.id === copy.copyOf));
    return home ? { name: home.name, color: home.color } : null;
  }

  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

  /**
   * Tick a note off, or back on.
   * @param {Boolean} [done]  what to set it to; left out, it flips
   * @returns {Boolean} whether anything changed
   */
  function setDone(listId, itemId, done) {
    const item = itemById(listId, itemId);
    if (!item) return false;
    const want = done === undefined ? !item.done : !!done;
    if (!!item.done === want) return false;
    mutate(s => {
      item.done = want;
      if (listId === COMPLETED_ID) return;
      const now = Date.now();
      if (want) {
        const onToday = inToday(listId, itemId);
        const src = listById(listId);
        completedIn(s).items.unshift({
          id: uid(),
          text: item.text,
          detail: item.detail || '',
          expanded: false,
          done: true,
          hour: onToday ? (item.hour || null) : null,
          wasToday: onToday,
          copyOf: itemId,
          /* the list it was ticked in — its name and colour kept as they were,
             for when that list is gone; see sourceOf */
          from: src ? { listId: src.id, name: src.name, color: src.color } : null,
          doneAt: now
        });
      } else {
        const box = s.lists.find(l => l.id === COMPLETED_ID);
        if (!box) return;
        const at = box.items.findIndex(c => c.copyOf === itemId && c.doneAt && sameDay(c.doneAt, now));
        if (at === -1) return;
        const gone = box.items[at].id;
        box.items.splice(at, 1);
        s.today = s.today.filter(t => !(t.listId === COMPLETED_ID && t.itemId === gone));
        (s.canvases || []).forEach(c => {
          const cards = (c.nodes || []).filter(n => n.itemId === gone).map(n => n.id);
          c.nodes = (c.nodes || []).filter(n => n.itemId !== gone);
          c.edges = (c.edges || []).filter(e => cards.indexOf(e.from.node) === -1 && cards.indexOf(e.to.node) === -1);
        });
      }
    }, ['board', 'today', 'lists', 'canvas']);
    return true;
  }

  /* ---------- today ---------- */
  /**
   * Where a note written straight into Do Today should live. Uncategorized is
   * the app's own catch-all; if it has been renamed away the first category
   * will do, and if there are none left at all we make one.
   */
  function inbox() {
    const named = state.lists.filter(l => String(l.name).trim().toLowerCase() === 'uncategorized')[0];
    if (named) return named;
    if (state.lists.length) return state.lists[0];
    return addList('Uncategorized');
  }

  const inToday = (listId, itemId) => state.today.some(t => t.listId === listId && t.itemId === itemId);

  /* ============================================================
     BRINGING BACK WHAT WAS DELETED

     Deleting is the one change that cannot be undone by doing it again,
     so what was deleted is kept: the thing itself, and enough about where
     it was to put it back — which list, which position on the board,
     whether it was on Do Today.

     It is kept on this device, not in the board: an undo list is about
     what you just did here, and sending it to the phone would mean the
     phone could put back something deleted an hour ago on the laptop.
     Twenty deep, oldest dropped first.
     ============================================================ */
  const TRASH_KEY = () => Profiles.key('undo.v1');
  const TRASH_MAX = 20;
  let trash = null;

  function trashList() {
    if (trash) return trash;
    /* a sealed board never wrote its trash down — see trashSave */
    if (sealed) { trash = []; return trash; }
    try { trash = JSON.parse(localStorage.getItem(TRASH_KEY()) || '[]'); } catch (e) { trash = []; }
    if (!Array.isArray(trash)) trash = [];
    return trash;
  }
  function trashSave() {
    /* The trash holds whole notes. Writing it down for a sealed board would
       put the very words the board is encrypted to hide back on the disk in
       plain text — deleting a note would have been the way to leak it. So
       for a sealed board the trash lives in memory and no further: undo
       works while the app is open and is gone when it closes, which is the
       right trade for a board that is kept locked. */
    if (sealed) return;
    try { localStorage.setItem(TRASH_KEY(), JSON.stringify(trash)); } catch (e) { /* this session only, then */ }
  }
  function remember(entry) {
    const t = trashList();
    t.push(Object.assign({ at: Date.now() }, entry));
    while (t.length > TRASH_MAX) t.shift();
    trashSave();
  }
  /** What undo would bring back, without bringing it back. @returns {Object|null} */
  function undoPeek() {
    const t = trashList();
    const last = t[t.length - 1];
    return last ? { kind: last.kind, name: last.name, at: last.at } : null;
  }
  function undoClear() { trash = []; trashSave(); }

  const nameOfNote = item => {
    const t = String((item && item.text) || '').trim();
    return t || 'the note with no name';
  };

  /**
   * Put back the last thing deleted.
   * @returns {Object|null} { kind, name } if something came back
   */
  function undoLast() {
    const t = trashList();
    const entry = t.pop();
    trashSave();
    if (!entry) return null;
    let back = false;

    const putToday = (s, rows) => (rows || []).forEach(r => {
      if (!s.today.some(x => x.listId === r.listId && x.itemId === r.itemId)) {
        s.today.splice(Math.max(0, Math.min(r.index, s.today.length)), 0, { listId: r.listId, itemId: r.itemId });
      }
    });

    mutate(s => {
      if (entry.kind === 'note' || entry.kind === 'many') {
        const l = s.lists.find(x => x.id === entry.listId);
        if (!l) return;
        const rows = entry.kind === 'note' ? [{ item: entry.item, index: entry.index }] : entry.items;
        rows.slice().sort((a, b) => a.index - b.index).forEach(row => {
          if (l.items.some(i => i.id === row.item.id)) return;      // already back
          l.items.splice(Math.max(0, Math.min(row.index, l.items.length)), 0, row.item);
          back = true;
        });
        putToday(s, entry.today);
        return;
      }
      if (entry.kind === 'list') {
        if (s.lists.some(l => l.id === entry.list.id)) return;
        s.lists.splice(Math.max(0, Math.min(entry.listIndex, s.lists.length)), 0, entry.list);
        if (entry.boardIndex >= 0) s.board.splice(Math.max(0, Math.min(entry.boardIndex, s.board.length)), 0, entry.list.id);
        if (entry.closedIndex >= 0) s.closedOrder.splice(Math.max(0, Math.min(entry.closedIndex, s.closedOrder.length)), 0, entry.list.id);
        putToday(s, entry.today);
        (entry.presets || []).forEach(p => {
          const preset = s.presets.find(x => x.id === p.presetId);
          if (preset && preset.listIds.indexOf(entry.list.id) === -1) {
            preset.listIds.splice(Math.max(0, Math.min(p.index, preset.listIds.length)), 0, entry.list.id);
          }
        });
        (entry.cards || []).forEach(c => {
          const canvas = s.canvases.find(x => x.id === c.canvasId);
          if (!canvas) return;
          c.nodes.forEach(n => { if (!canvas.nodes.some(x => x.id === n.id)) canvas.nodes.push(n); });
          c.edges.forEach(e => { if (!canvas.edges.some(x => x.id === e.id)) canvas.edges.push(e); });
        });
        back = true;
        return;
      }
      if (entry.kind === 'card') {
        const canvas = s.canvases.find(x => x.id === entry.canvasId);
        if (!canvas || canvas.nodes.some(n => n.id === entry.node.id)) return;
        canvas.nodes.splice(Math.max(0, Math.min(entry.index, canvas.nodes.length)), 0, entry.node);
        (entry.edges || []).forEach(e => { if (!canvas.edges.some(x => x.id === e.id)) canvas.edges.push(e); });
        back = true;
      }
    }, ['board', 'lists', 'today', 'presets', 'canvas', 'canvases']);

    return back ? { kind: entry.kind, name: entry.name } : null;
  }

  /* ---------- how a list is shown ----------

     A list is kept in the order you put it in. It can be SHOWN in another
     order without that being lost: sorted by when each note was written,
     with the finished ones pushed to the bottom or hidden altogether. The
     choice lives on the list, so it is the same on every device.

       sort       'manual' (yours) | 'new' (newest first) | 'old'
       doneBottom finished notes after the rest
       hideDone   finished notes not shown at all

     Move a note by hand while a list is sorted and the order you can see
     becomes the order the list is kept in — anything else would put the
     note straight back where it came from. */

  /** When a note was written. Older notes have it in their id. */
  function madeAt(item) {
    if (!item) return null;
    if (typeof item.made === 'number') return item.made;
    const stamp = parseInt(String(item.id).slice(0, 8), 36);
    /* a real time, not a test id or a word that happens to parse */
    return stamp > 1e12 && stamp < 4e12 ? stamp : null;
  }

  /** The list as it should be drawn: sorted, with the finished ones where they belong. */
  function listView(list) {
    if (!list) return [];
    const items = (list.items || []).slice();
    const where = {};
    items.forEach((i, at) => { where[i.id] = at; });
    let out = items;

    if (list.sort === 'new' || list.sort === 'old') {
      const dir = list.sort === 'new' ? -1 : 1;
      out = out.slice().sort((a, b) => {
        const am = madeAt(a), bm = madeAt(b);
        if (am === null && bm === null) return where[a.id] - where[b.id];
        if (am === null) return 1;
        if (bm === null) return -1;
        return am === bm ? where[a.id] - where[b.id] : (am - bm) * dir;
      });
    }
    if (list.hideDone) out = out.filter(i => !i.done);
    else if (list.doneBottom) {
      const undone = out.filter(i => !i.done), done = out.filter(i => i.done);
      out = undone.concat(done);
    }
    return out;
  }

  /** Is anything about this list's order not simply the order it is kept in? */
  const listSorted = list => !!list && (list.sort === 'new' || list.sort === 'old' || !!list.doneBottom);

  function setListSort(listId, patch) {
    const l = listById(listId);
    if (!l) return false;
    mutate(() => {
      Object.keys(patch).forEach(k => {
        if (patch[k] === null || patch[k] === false) delete l[k]; else l[k] = patch[k];
      });
    }, ['board', 'lists']);
    return true;
  }

  /**
   * Write the order a list is being shown in into the list itself, and let go
   * of the sort. Anything hidden keeps its place among the rest as best it
   * can: it goes back where it was relative to the notes it sat between.
   */
  function keepShownOrder(listId) {
    const l = listById(listId);
    if (!l) return false;
    const shown = listView(l).map(i => i.id);
    mutate(() => {
      const isShown = {};
      shown.forEach(id => { isShown[id] = 1; });

      /* A hidden note is remembered by the shown note it sat behind, and put
         back behind that same note wherever it has ended up. The ones before
         any shown note at all stay at the front. This used to pile every
         hidden note at the end, which the paragraph above already promised
         it did not do - and it only went unnoticed because the list stopped
         hiding them at the same moment, so they were all in plain sight
         again anyway. */
      const behind = {};
      const front = [];
      let last = null;
      l.items.forEach(it => {
        if (isShown[it.id]) { last = it.id; return; }
        if (last === null) front.push(it); else (behind[last] || (behind[last] = [])).push(it);
      });

      const byId = {};
      l.items.forEach(it => { byId[it.id] = it; });
      const out = front.slice();
      shown.forEach(id => {
        if (byId[id]) out.push(byId[id]);
        (behind[id] || []).forEach(h => out.push(h));
      });
      /* belt and braces: nothing may be dropped on the floor by a reorder */
      const placed = {};
      out.forEach(it => { placed[it.id] = 1; });
      l.items.forEach(it => { if (!placed[it.id]) out.push(it); });

      l.items = out;
      /* The sort and "finished at the bottom" are rules about order, and
         taking hold of the order by hand is a plain enough way of saying you
         would rather not have them. Hiding finished notes is not a rule about
         order - it is about what you want to look at - so moving a note now
         leaves it alone. It used to be dropped here too, which is why the
         switch kept turning itself off. */
      delete l.sort;
      delete l.doneBottom;
    }, ['board', 'lists']);
    return true;
  }

  /**
   * Move a note to where it was dropped, counting positions as they are on
   * SCREEN. In a sorted list that means the order shown is taken as the
   * order kept, since a note dropped into a sorted list would otherwise
   * spring straight back to wherever the sort wants it.
   */
  function moveNoteInView(fromListId, itemId, toListId, viewIndex) {
    const to = listById(toListId);
    if (to && (listSorted(to) || to.hideDone)) {
      const shown = listView(to).map(i => i.id).filter(id => id !== itemId);
      keepShownOrder(toListId);
      const at = Math.max(0, Math.min(viewIndex, shown.length));
      const anchor = shown[at];
      const real = anchor ? to.items.findIndex(i => i.id === anchor) : to.items.length;
      moveNote(fromListId, itemId, toListId, real === -1 ? to.items.length : real);
      return;
    }
    moveNote(fromListId, itemId, toListId, viewIndex);
  }

  /* ---------- tomorrow ----------

     A note put off to tomorrow carries the date it is for — not a flag —
     so a device that was shut at midnight, or for a week, still knows what
     is due when it opens. When that date comes it goes onto Do Today, with
     its time if it had one, and the mark comes off. Every device does this
     for itself; two devices doing it at once add the same note once, since
     Do Today holds each note only once, and the merge joins them by pair. */

  /** A day as this device's clock sees it: "2026-09-16". */
  function dayKey(d) {
    const x = d instanceof Date ? d : new Date(d === undefined ? Date.now() : d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  /* by the calendar, not by adding 24 hours — a clock change would skip a day or repeat one */
  const nextDayKey = now => { const d = new Date(now === undefined ? Date.now() : now); return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)); };

  /** Put off to a day that has not come yet. */
  const isTomorrow = (item, now) => !!(item && item.tomorrow && item.tomorrow > dayKey(now));

  /**
   * The day a note is for, or null if it is not spoken for.
   * `tomorrow` has always held a date rather than a flag, so it is already
   * the right field for this; the calendar simply sets it to days further
   * out than the one after today.
   */
  const dayOf = item => (item && item.tomorrow) || null;

  /**
   * Put a note on a day - any day, not only tomorrow.
   * @param {String|null} key  "2026-09-16", or null to take the day off it
   *
   * A day and Do Today are either-or, the same way tomorrow always was:
   * saying when a note is for takes it off today's pile until that day
   * comes round, and `rollTomorrow` puts it back.
   */
  function setDay(listId, itemId, key) {
    const item = itemById(listId, itemId);
    if (!item) return false;
    if (dayOf(item) === (key || null)) return false;
    mutate(s => {
      if (key) {
        item.tomorrow = key;
        s.today = s.today.filter(t => !(t.listId === listId && t.itemId === itemId));
      } else {
        delete item.tomorrow;
      }
    }, ['board', 'today', 'lists', 'calendar']);
    return true;
  }

  /**
   * @param {Boolean} on  put it off to tomorrow, or take that back
   * Tomorrow and Do Today are either-or: putting a note off takes it off today.
   */
  function setTomorrow(listId, itemId, on) {
    return setDay(listId, itemId, on ? nextDayKey() : null);
  }

  /**
   * Every note spoken for between two days, the days inclusive, gathered
   * by day so a month can be drawn in one pass instead of one per cell.
   * @returns {Object} { "2026-09-16": [{ list, item }, ...], ... }
   */
  function scheduled(fromKey, toKey) {
    const by = {};
    state.lists.forEach(list => {
      if (list.id === COMPLETED_ID) return;
      (list.items || []).forEach(item => {
        const d = dayOf(item);
        if (!d || d < fromKey || d > toKey) return;
        (by[d] || (by[d] = [])).push({ list, item });
      });
    });
    Object.keys(by).forEach(d => by[d].sort((a, b) => (a.item.hour || 99) - (b.item.hour || 99)));
    return by;
  }

  /**
   * What was ticked off on each day in a range - the record of days gone by,
   * which is all a past day can honestly show. Notes lose their day when it
   * arrives (`rollTomorrow`), so the past is read from the Completed box.
   */
  function doneBetween(fromKey, toKey) {
    const by = {};
    const box = state.lists.find(l => l.id === COMPLETED_ID);
    if (!box) return by;
    (box.items || []).forEach(item => {
      if (!item.doneAt) return;
      const d = dayKey(item.doneAt);
      if (d < fromKey || d > toKey) return;
      (by[d] || (by[d] = [])).push({ list: box, item });
    });
    return by;
  }

  /**
   * Everything put off to tomorrow: timed first by the hour, then the rest
   * in board order.
   *
   * Tomorrow proper, not "some day after this one". Until the calendar came
   * along the field was only ever set to the next day, so the two meant the
   * same thing and this filtered on `isTomorrow`. Now a note can be put off
   * to a fortnight away, and calling that lot "Tomorrow" in the dock would
   * simply be untrue. Anything further out belongs to the calendar, and
   * `rollTomorrow` still brings it in on the morning it is due.
   */
  function tomorrowItems(now) {
    const out = [];
    const key = nextDayKey(now);
    state.lists.forEach(list => (list.items || []).forEach(item => {
      if (dayOf(item) === key) out.push({ list, item });
    }));
    return out.map((e, i) => ({ e, i }))
      .sort((a, b) => ((a.e.item.hour || 99) - (b.e.item.hour || 99)) || (a.i - b.i))
      .map(x => x.e);
  }

  /**
   * Everything put off past tomorrow, gathered by day and soonest first,
   * each day's notes in time order with the untimed ones last.
   *
   * Tomorrow has its own fold in the dock and is left out here, so the two
   * never show the same note twice. Finished notes are left out as well:
   * the dock is a list of what there is to do.
   *
   * @returns {Array} [{ day: "2026-10-04", items: [{ list, item }, ...] }, ...]
   */
  function laterItems(now) {
    const after = nextDayKey(now);
    const by = {};
    state.lists.forEach(list => {
      if (list.id === COMPLETED_ID) return;
      (list.items || []).forEach(item => {
        const d = dayOf(item);
        if (!d || d <= after || item.done) return;
        (by[d] || (by[d] = [])).push({ list, item });
      });
    });
    const at = e => (e.item.hour === null || e.item.hour === undefined ? 99 : e.item.hour);
    return Object.keys(by).sort().map(day => ({ day: day, items: by[day].sort((a, b) => at(a) - at(b)) }));
  }

  /**
   * The day has come for anything put off to it: onto Do Today it goes.
   * @returns {Number} how many moved
   */
  function rollTomorrow(now) {
    const today = dayKey(now);
    const due = [];
    state.lists.forEach(list => (list.items || []).forEach(item => {
      if (item.tomorrow && item.tomorrow <= today) due.push({ list, item });
    }));
    if (!due.length) return 0;
    due.sort((a, b) => (a.item.hour || 99) - (b.item.hour || 99));
    mutate(s => {
      due.forEach(({ list, item }) => {
        delete item.tomorrow;
        if (!s.today.some(t => t.listId === list.id && t.itemId === item.id)) {
          s.today.push({ listId: list.id, itemId: item.id });
        }
      });
    }, ['board', 'today', 'lists']);
    return due.length;
  }

  function addToToday(listId, itemId, index) {
    const item = itemById(listId, itemId);
    if (item && item.tomorrow) mutate(() => { delete item.tomorrow; }, null, { silent: true });   // today, then, not tomorrow
    if (inToday(listId, itemId)) { if (typeof index === 'number') reorderToday(listId, itemId, index); return false; }
    mutate(s => {
      const entry = { listId, itemId };
      if (typeof index === 'number') s.today.splice(index, 0, entry);
      else s.today.push(entry);
    }, ['today', 'board']);
    return true;
  }

  function reorderToday(listId, itemId, toIndex) {
    mutate(s => {
      const from = s.today.findIndex(t => t.listId === listId && t.itemId === itemId);
      if (from === -1) return;
      const [e] = s.today.splice(from, 1);
      s.today.splice(toIndex, 0, e);
    }, ['today']);
  }

  function removeFromToday(listId, itemId) {
    mutate(s => { s.today = s.today.filter(t => !(t.listId === listId && t.itemId === itemId)); }, ['today', 'board']);
  }

  /**
   * Take the finished notes out of a list — the list menu's Clear finished.
   * One deletion, so one undo brings all of them back.
   */
  function clearFinished(listId) {
    const l = listById(listId);
    if (!l) return 0;
    const going = l.items.filter(i => i.done);
    if (!going.length) return 0;
    remember({
      kind: 'many',
      name: going.length + (going.length === 1 ? ' finished note' : ' finished notes'),
      listId: listId,
      items: going.map(i => ({ index: l.items.indexOf(i), item: JSON.parse(JSON.stringify(i)) })),
      today: state.today.map((t, i) => ({ listId: t.listId, itemId: t.itemId, index: i }))
        .filter(t => t.listId === listId && going.some(g => g.id === t.itemId))
    });
    const ids = going.map(i => i.id);
    mutate(s => {
      l.items = l.items.filter(i => ids.indexOf(i.id) === -1);
      s.today = s.today.filter(t => !(t.listId === listId && ids.indexOf(t.itemId) !== -1));
    }, ['board', 'today', 'lists']);
    return going.length;
  }

  /* ---------- presets ---------- */
  function addPreset(name) {
    const p = { id: uid(), name: name || 'Untitled', color: pickColor(), listIds: [], open: true };
    mutate(s => { s.presets.push(p); }, ['presets']);
    return p;
  }
  function deletePreset(id) {
    mutate(s => { s.presets = s.presets.filter(p => p.id !== id); }, ['presets']);
  }
  function presetAddList(presetId, listId, index) {
    mutate(() => {
      const p = presetById(presetId);
      if (!p) return;
      p.listIds = p.listIds.filter(x => x !== listId);
      if (typeof index === 'number') p.listIds.splice(index, 0, listId);
      else p.listIds.push(listId);
    }, ['presets']);
  }
  function presetRemoveList(presetId, listId) {
    mutate(() => {
      const p = presetById(presetId);
      if (p) p.listIds = p.listIds.filter(x => x !== listId);
    }, ['presets']);
  }

  /* ---------- canvases ---------- */
  const canvasById = id => state.canvases.find(c => c.id === id) || null;
  const activeCanvas = () => canvasById(state.activeCanvas);

  function setView(view) {
    if (state.view === view) return;
    mutate(s => { s.view = view; }, ['view', 'canvas', 'board', 'lists']);
  }

  function addCanvas(name) {
    const c = canvas(name, pickColor());
    mutate(s => { s.canvases.push(c); s.activeCanvas = c.id; s.view = 'canvas'; }, ['canvases', 'canvas', 'view']);
    return c;
  }

  function deleteCanvas(id) {
    mutate(s => {
      s.canvases = s.canvases.filter(c => c.id !== id);
      if (!s.canvases.length) s.canvases = [canvas('Scratch', PALETTE[2])];
      if (s.activeCanvas === id) s.activeCanvas = s.canvases[0].id;
    }, ['canvases', 'canvas']);
  }

  function openCanvas(id) {
    mutate(s => { s.activeCanvas = id; s.view = 'canvas'; }, ['canvases', 'canvas', 'view']);
  }

  /** Patch the active canvas. Pass {silent:true} while dragging. */
  function canvasEdit(fn, opts) {
    const c = activeCanvas();
    if (!c) return;
    mutate(() => fn(c), ['canvas'], opts);
  }

  function addNode(node) {
    const n = Object.assign({ id: uid(), x: 0, y: 0, w: 210, h: 120 }, node);
    canvasEdit(c => { c.nodes.push(n); });
    return n;
  }
  function removeNode(nodeId) {
    const c0 = activeCanvas();
    const node = c0 ? (c0.nodes || []).find(n => n.id === nodeId) : null;
    if (node) {
      remember({
        kind: 'card',
        name: String(node.text || node.name || (node.kind === 'image' ? 'the picture' : 'the card')).trim() || 'the card',
        canvasId: c0.id, index: c0.nodes.indexOf(node),
        node: JSON.parse(JSON.stringify(node)),
        edges: JSON.parse(JSON.stringify((c0.edges || []).filter(e => e.from.node === nodeId || e.to.node === nodeId)))
      });
    }
    canvasEdit(c => {
      c.nodes = c.nodes.filter(n => n.id !== nodeId);
      c.edges = c.edges.filter(e => e.from.node !== nodeId && e.to.node !== nodeId);
    });
  }
  function addEdge(from, to, color, width) {
    const e = { id: uid(), from, to, color: color || '#8fb7ff', width: width || 2, arrow: true };
    canvasEdit(c => {
      // no duplicate connectors between the same pair
      const dup = c.edges.some(x => x.from.node && x.to.node &&
        ((x.from.node === from.node && x.to.node === to.node) ||
         (x.from.node === to.node && x.to.node === from.node)));
      if (!dup) c.edges.push(e);
    });
    return e;
  }
  function removeEdge(edgeId) { canvasEdit(c => { c.edges = c.edges.filter(e => e.id !== edgeId); }); }
  /* returns the stroke, the way addNote and addNode do */
  function addStroke(stroke) {
    const s = Object.assign({ id: uid() }, stroke);
    canvasEdit(c => { c.strokes.push(s); });
    return s;
  }
  function removeStroke(strokeId) { canvasEdit(c => { c.strokes = c.strokes.filter(s => s.id !== strokeId); }); }
  function clearCanvas() { canvasEdit(c => { c.nodes = []; c.edges = []; c.strokes = []; }); }

  /* ---------- widgets ---------- */
  function addWidget(type, config) {
    const w = { id: uid(), type, config: config || {} };
    mutate(s => { s.widgets.push(w); }, ['widgets']);
    return w;
  }
  function removeWidget(id) { mutate(s => { s.widgets = s.widgets.filter(w => w.id !== id); }, ['widgets']); }
  function moveWidget(id, toIndex) {
    mutate(s => {
      const from = s.widgets.findIndex(w => w.id === id);
      if (from === -1) return;
      const [w] = s.widgets.splice(from, 1);
      s.widgets.splice(toIndex, 0, w);
    }, ['widgets']);
  }

  /* ---------- import / export ---------- */
  /**
   * A backup is a file you might email to yourself, drop in a shared folder or
   * hand to someone. The sync settings are a live write credential — the
   * database it points at and the room key that unlocks it — so they are left
   * out. Everything that is actually yours is in there.
   *
   * Sync's own copies (exportState) keep them, because a merge has to be able
   * to tell the local settings apart from the ones that arrived.
   */
  function exportJSON() {
    const out = JSON.parse(JSON.stringify(state));
    /* The credentials go; the preferences beside them stay, because they
       are yours and not a way into anything. */
    const was = state.settings.sync || {};
    out.settings.sync = {
      on: false, url: '', room: '', device: '', rev: 0, dirty: false,
      warn: was.warn !== false,
      gate: was.gate === true,
      tries: typeof was.tries === 'number' ? was.tries : 0
    };
    return JSON.stringify(out, null, 2);
  }

  /** The whole thing, credentials and all — for sync, which sends it nowhere else. */
  function exportState() { return JSON.stringify(state); }

  /**
   * Restoring a backup replaces your notes, not your connection: whatever the
   * file says about sync is ignored in favour of what this device already has.
   * That way a backup from another machine — or from someone else — can never
   * quietly point this one at a different room.
   */
  function importJSON(text) {
    const parsed = JSON.parse(text);
    const keepSync = state && state.settings ? state.settings.sync : null;
    state = migrate(parsed);
    if (keepSync) state.settings.sync = keepSync;
    persist();
    emit(ALL_CHANNELS);
  }
  function reset() {
    state = seed();
    persist();
    emit(ALL_CHANNELS);
  }

  return {
    PALETTE, uid, on, emit, mutate, freeze, flush, reload, get, settings,
    isSealed, isShut, unlockWith, sealFrom, shut,
    /* for Settings, to cut a spare key: it needs the key that opens the board,
       which is exactly the safeguard - only someone who can open it can copy it */
    dataKey: () => dataKey,
    listById, itemById, presetById, isOpen, expandedCount, atCapacity, pickColor,
    openList, closeList, toggleCollapse, addList, deleteList, moveListOnBoard,
    addNote, deleteNote, moveNote,
    inbox, inToday, addToToday, reorderToday, removeFromToday,
    dayKey, nextDayKey, isTomorrow, setTomorrow, tomorrowItems, rollTomorrow,
    dayOf, setDay, scheduled, doneBetween, laterItems,
    madeAt, listView, listSorted, setListSort, keepShownOrder, moveNoteInView,
    addPreset, deletePreset, presetAddList, presetRemoveList,
    canvasById, activeCanvas, setView, addCanvas, deleteCanvas, openCanvas, canvasEdit,
    addNode, removeNode, addEdge, removeEdge, addStroke, removeStroke, clearCanvas,
    addWidget, removeWidget, moveWidget,
    setDone, sourceOf, COMPLETED_ID,
    undoLast, undoPeek, undoClear, clearFinished,
    exportJSON, exportState, importJSON, reset, onPersist,
    /* the example notes a fresh board starts with — not anyone's own work */
    sampleTexts: () => [].concat.apply([], seed().lists.map(l => l.items.map(i => i.text)))
  };
})();
