/* ============================================================
   Flowlist — Themes, ambient effects and the settings drawer
   ============================================================ */
const Themes = (function () {
  const drawer = document.getElementById('settings');
  const drawerBody = document.getElementById('settings-body');
  const scrim = document.getElementById('scrim');
  const wipe = document.getElementById('theme-wipe');
  const scene = document.getElementById('fx-scene');
  const canvas = document.getElementById('fx-snow');
  const ctx2d = canvas.getContext('2d');

  /* fall:  which particle layer, if any
     scene: which set of scenery, if any — drives what shows under Ambient */
  const THEMES = [
    { key: 'winter',   name: 'Winter',   swatch: ['#070d1a', '#5cc8ff', '#b78bff'], fall: 'snow', scene: 'winter' },
    { key: 'midnight', name: 'Midnight', swatch: ['#0b0b0f', '#7c8dff', '#4ad6c0'], fall: null,   scene: 'city'   },
    /* Near-black with a violet accent, and a graph of linked notes turning
       slowly in the corner. The graph is the one scene that starts switched
       off - see newScene in js/store.js - so the theme is quiet until you
       ask for it. */
    { key: 'amethyst', name: 'Amethyst', swatch: ['#1e1e1e', '#8b6cef', '#a882ff'], fall: null,   scene: 'graph'  },
    { key: 'paper',    name: 'Paper',    swatch: ['#f4f2ee', '#c2683a', '#3f7d6b'], fall: null,   scene: 'plane'  },
    { key: 'slate',    name: 'Slate',    swatch: ['#eef1f5', '#3b7de0', '#12a594'], fall: null,   scene: 'fog'    },

    /* Landscapes: the pictures from the password screen, whole, behind the
       board. Each one is the very scene js/scenes.js builds for that screen
       - not a copy of it - so the theme and the screen can never drift
       apart. The board goes to dark glass over them; see body.landscape in
       css/themes.css. */
    { key: 'valley',   name: 'The Valley', swatch: ['#0a1020', '#f4a46c', '#9db4ea'], fall: null, scene: 'valley', landscape: true },
    { key: 'dunes',    name: 'Dunes',      swatch: ['#150c14', '#f2a950', '#e8818f'], fall: null, scene: 'dunes',  landscape: true }
  ];
  const themeByKey = k => THEMES.find(t => t.key === k) || THEMES[0];

  const FALL_COPY = {
    snow:  ['Snowfall', 'Drifting snow across the page.']
  };
  const SCENE_COPY = {
    winter: ['Scenery', 'Snow drift and the snowman along the bottom.'],
    city:   ['City at night', 'A skyline with its windows coming on and off, under a moon.'],
    graph:  ['The graph', 'Linked notes drifting in the corner, the way the real one draws them.'],
    fog:    ['Fog on the ridge', 'Two ridges with fog banks drifting slowly across them.'],
    plane:  ['Paper plane', 'One folded plane crossing the sky, taking its time.'],
    valley:     ['The valley', 'Ridges going back into mist, birds now and then, and a sky that turns from dusk to night to dawn.'],
    dunes:      ['The dunes', 'Sand catching the last of a huge low sun, haze between the ridges, then a moon and the odd shooting star.']
  };

  /* ============================================================
     APPLY
     ============================================================ */
  function apply(key, origin) {
    const theme = THEMES.find(t => t.key === key) || THEMES[0];

    if (origin) {
      wipe.style.background = theme.swatch[0];
      wipe.style.left = origin.x + 'px';
      wipe.style.top = origin.y + 'px';
      wipe.classList.remove('go');
      void wipe.offsetWidth;               // restart the animation
      wipe.classList.add('go');
      setTimeout(() => commit(theme), 190);
    } else {
      commit(theme);
    }
  }

  function commit(theme) {
    document.documentElement.setAttribute('data-theme', theme.key);
    document.body.setAttribute('data-bg', theme.key);
    Store.mutate(s => { s.settings.theme = theme.key; }, null, { silent: true });
    applyThemeClasses();
    buildScene();
    startFall();
    renderSettings();
  }

  /**
   * A landscape theme's backdrop: the password screen's picture, full size,
   * behind everything. The scene layer is already fixed to the window and
   * sits under the board, which is all a picture of that kind needs.
   */
  function buildLandscape(key) {
    if (typeof Scenes === 'undefined' || !Scenes.has(key)) return;
    const pic = Scenes.build(key);
    pic.classList.add('as-backdrop');
    scene.appendChild(pic);
  }

  /** Every theme has its own Polish switch; absent means on. */
  const polishOn = key => (Store.settings().polish || {})[key || Store.settings().theme] !== false;

  /** Per-theme extras live on <body> so they can be flipped without a repaint. */
  function applyThemeClasses() {
    const s = Store.settings();
    /* Settings and the right-click menus in the theme's own dress - on
       unless switched off in Settings, Theme */
    document.body.classList.toggle('menu-skin', s.menuSkin !== false);
    document.body.classList.toggle('polish', polishOn(s.theme));
    document.body.classList.toggle('landscape', !!themeByKey(s.theme).landscape);
  }

  /* ============================================================
     AMBIENT SCENE (winter furniture)
     ============================================================ */
  /* ============================================================
     THE SCENE'S OWN CLOCK

     Everything in a scene moves slowly - a sky that turns over minutes,
     fog a few pixels a second, stars fading in and out. Left to itself
     the browser moves all of it on every frame the screen shows, which on
     a 165 Hz screen is 165 times a second, and each time it redraws the
     whole window over the graphics card: the sky layers are the size of
     the window. That kept the card so busy that a letter typed into a
     note waited behind it - about 16 ms, against 4 with the scene still.

     So the scene keeps its own time. Every looping animation in it is
     taken off the browser's hands and set to where it should be, all
     together, SCENE_HZ times a second. Nothing that slow looks any
     different at 30, and the window is redrawn a fifth as often. The
     animations still move only transform and opacity (see the note by
     #fx-scene.still in themes.css), and each moving piece is kept on a
     layer of its own, so setting them costs no painting at all.

     One-off animations - a piece fading in as the scene is built - play
     out on their own, as do any on ::before and ::after, which cannot be
     given a layer from here.
     ============================================================ */
  const SCENE_HZ = 30;
  /* t is the scene's own time: it runs on while the scene is let move,
     and stands still while the scene is held, so letting go carries on
     from where it stopped instead of jumping ahead */
  const clock = { timer: 0, driven: new Map(), lastLook: 0, hz: SCENE_HZ, t: 0, last: 0, busyUntil: 0 };

  /* ---- held while you are busy ----
     Scrolling, typing, dragging: while you do any of it the scene stands
     still, and for BUSY_MS after, then carries on. And while Settings is
     open, which covers it. At those moments the only thing on screen that
     changes is the thing you are moving, so that is all there is to draw -
     without it, every tick of the scene had the whole window blended again
     under whatever you were scrolling. The scene moves so slowly that a
     pause of a second or two never shows. */
  const BUSY_MS = 400;
  const busy = () => { clock.busyUntil = performance.now() + BUSY_MS; };
  ['keydown', 'input', 'touchmove'].forEach(t => window.addEventListener(t, busy, { passive: true, capture: true }));
  document.addEventListener('scroll', busy, { passive: true, capture: true });
  window.addEventListener('pointermove', e => { if (e.buttons) busy(); }, { passive: true, capture: true });
  const held = now => document.hidden || now < clock.busyUntil || drawer.classList.contains('show');

  function takeUpSceneAnimations(now) {
    clock.lastLook = now;
    /* Reading an animation's state makes the browser bring the page's
       style up to date first; setting its time makes it out of date again.
       Done in turns - read one, set one - that was a restyle for every
       piece on every tick, some 800 a second. So everything is read first,
       all together, and only then set - and only here, once a second, not
       on every tick. */
    const gone = [];
    clock.driven.forEach((t, a) => {
      if (a.playState === 'idle' || !a.effect || !a.effect.target || !a.effect.target.isConnected) gone.push(a);
    });
    gone.forEach(a => clock.driven.delete(a));
    const fresh = scene.getAnimations({ subtree: true }).filter(a => {
      if (clock.driven.has(a) || a.playState !== 'running' || a.transitionProperty) return false;
      const fx = a.effect;
      if (!fx || fx.pseudoElement || !fx.target || fx.getTiming().iterations !== Infinity) return false;
      const el = fx.target;
      return !(el instanceof SVGElement && !(el instanceof SVGSVGElement));
    });
    const at = fresh.map(a => a.currentTime || 0);
    fresh.forEach((a, i) => {
      const el = a.effect.target;
      const moves = new Set((el.style.willChange || '').split(',').map(x => x.trim()).filter(Boolean));
      a.effect.getKeyframes().forEach(k => {
        if ('transform' in k) moves.add('transform');
        if ('opacity' in k) moves.add('opacity');
      });
      if (moves.size) el.style.willChange = [...moves].join(', ');
      clock.driven.set(a, { at: at[i], from: clock.t });
      a.pause();
    });
  }

  function sceneClockTick() {
    const now = performance.now();
    /* a long gap - the tab hidden, the laptop asleep - is not time the scene saw */
    const dt = Math.min(now - clock.last, 100);
    clock.last = now;
    if (held(now)) return;
    clock.t += dt;
    /* new pieces arrive now and then - a flock, a shooting star - so look again every second */
    if (now - clock.lastLook > 1000) takeUpSceneAnimations(now);
    /* Only setting, never reading, here: see takeUpSceneAnimations. A piece
       taken off the page is skipped - setting the time of an animation that
       has ended brings it back - and let go of at the next look round.
       (isConnected is the DOM's to answer, not style's, so it restyles nothing.) */
    clock.driven.forEach((t, a) => {
      if (a.effect.target.isConnected) a.currentTime = t.at + (clock.t - t.from);
    });
  }

  function startSceneClock() {
    stopSceneClock();
    clock.last = performance.now();
    takeUpSceneAnimations(clock.last);
    clock.timer = setInterval(sceneClockTick, 1000 / clock.hz);
  }

  /* For measuring only (tests/perf/feel.js): run the clock at another
     rate, or with 0 hand the scene back to the browser to move on every
     frame, the way it was before the clock. */
  function setSceneHz(hz) {
    clock.hz = hz;
    if (hz > 0) {
      if (Store.settings().sceneStill !== true && scene.firstChild) startSceneClock();
      return;
    }
    clock.driven.forEach((t, a) => { if (a.playState !== 'idle') a.play(); });
    stopSceneClock();
  }

  function stopSceneClock() {
    clearInterval(clock.timer);
    clock.timer = 0;
    clock.driven.clear();
  }

  /* Build the scene for the theme and setting now in force, and start its clock. */
  function buildScene() {
    stopSceneClock();
    buildSceneParts();
    if (Store.settings().sceneStill !== true && scene.firstChild && clock.hz > 0) startSceneClock();
  }

  function buildSceneParts() {
    const s = Store.settings();
    const theme = themeByKey(s.theme);
    stopCat();
    scene.innerHTML = '';
    /* #fx-ground is the second scene layer: in front of the notes rather than
       behind them. Cleared here with everything else, before the early return
       below, so turning scenery off clears it too. A theme that wants
       something on that layer builds it back. */
    const floor = document.getElementById('fx-ground');
    if (floor) floor.innerHTML = '';
    /* Held still, the scene is built exactly as it always is and then nothing
       drives it: no physics loop, no walk, and the CSS keeps its hands off. */
    scene.classList.toggle('still', s.sceneStill === true);
    if (!theme.scene || !s.scene) return;
    // put back the way it was before it had a scene at all
    if (isNewScene(theme.scene) && !newSceneOn(theme.key)) return;

    if (theme.landscape) { buildLandscape(theme.scene); return; }
    if (theme.scene === 'city') { buildCityScene(); return; }
    if (theme.scene === 'graph') { buildGraphScene(); return; }
    if (theme.scene === 'fog') { buildFogScene(); return; }
    if (theme.scene === 'plane') { buildPlaneScene(); return; }

    const drift = document.createElement('div');
    drift.className = 'snow-drift';
    scene.appendChild(drift);

    const snowman = document.createElement('div');
    snowman.className = 'snowman';
    snowman.innerHTML =
      '<svg viewBox="0 0 76 96" width="76" height="96"><g class="sm-sway">' +
        '<ellipse cx="38" cy="90" rx="30" ry="5" fill="rgba(10,25,50,.22)"/>' +
        '<circle cx="38" cy="72" r="20" fill="#fbfdff"/>' +
        '<circle cx="38" cy="48" r="15" fill="#ffffff"/>' +
        '<circle cx="38" cy="27" r="11" fill="#ffffff"/>' +
        '<path d="M25 20h26l-2-5H27z" fill="#2b3f66"/><rect x="29" y="4" width="18" height="13" rx="2" fill="#2b3f66"/>' +
        '<rect x="29" y="14" width="18" height="4" fill="#5cc8ff"/>' +
        '<circle cx="33.5" cy="26" r="1.7" fill="#25324d"/><circle cx="42.5" cy="26" r="1.7" fill="#25324d"/>' +
        '<path d="M38 29l9 2.5-9 2z" fill="#ff9d4d"/>' +
        '<path d="M33 33.5q5 3.5 10 0" stroke="#25324d" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
        '<path d="M23 46l-13-7M53 46l13-7" stroke="#8a6242" stroke-width="2.4" stroke-linecap="round"/>' +
        '<path d="M13 41l-4-3M13 41l-1-5M63 41l4-3M63 41l1-5" stroke="#8a6242" stroke-width="1.8" stroke-linecap="round"/>' +
        '<circle cx="38" cy="44" r="1.9" fill="#25324d"/><circle cx="38" cy="52" r="1.9" fill="#25324d"/>' +
        '<path d="M24 36q14 6 28 0" stroke="#5cc8ff" stroke-width="4" fill="none" stroke-linecap="round"/>' +
        '<path d="M50 36l3 12" stroke="#5cc8ff" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '</g></svg>';
    scene.appendChild(snowman);

    if (s.cat) {
      const cat = document.createElement('div');
      cat.className = 'cat-walk';
      cat.innerHTML =
        '<svg viewBox="0 0 62 40" width="62" height="40"><g class="cat-body">' +
          '<path class="cat-tail" d="M12 22q-8 -2 -7 -11" stroke="#3b4a6b" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
          '<rect x="11" y="17" width="30" height="12" rx="6" fill="#46587d"/>' +
          '<circle cx="45" cy="17" r="8" fill="#46587d"/>' +
          '<path d="M40 11l-1-6 6 3zM50 11l1-6-6 3z" fill="#46587d"/>' +
          '<circle cx="43" cy="16" r="1.5" fill="#ffe9a8"/><circle cx="48.5" cy="16" r="1.5" fill="#ffe9a8"/>' +
          '<path d="M45.5 19.5l-1.4 1.4h2.8z" fill="#ffb0c8"/>' +
          '<g class="cat-leg-a"><rect x="15" y="27" width="3.4" height="10" rx="1.7" fill="#3b4a6b"/></g>' +
          '<g class="cat-leg-b"><rect x="22" y="27" width="3.4" height="10" rx="1.7" fill="#3b4a6b"/></g>' +
          '<g class="cat-leg-b"><rect x="30" y="27" width="3.4" height="10" rx="1.7" fill="#3b4a6b"/></g>' +
          '<g class="cat-leg-a"><rect x="36" y="27" width="3.4" height="10" rx="1.7" fill="#3b4a6b"/></g>' +
        '</g></svg>';
      scene.appendChild(cat);
      if (!s.sceneStill && Store.settings().catChase !== false) startCat(cat);
    }
  }

  /* One pointer position, shared by the particle layer and the
     cat. Tracked from boot so nothing has to wire up its own listener. */
  const cursor = { x: -1e4, y: -1e4, vx: 0, vy: 0, seen: false };

  function onCursorMove(e) {
    if (cursor.seen) { cursor.vx = e.clientX - cursor.x; cursor.vy = e.clientY - cursor.y; }
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    cursor.seen = true;
  }
  function onCursorOut() { cursor.seen = false; cursor.x = cursor.y = -1e4; cursor.vx = cursor.vy = 0; }

  function trackCursor() {
    window.addEventListener('pointermove', onCursorMove, { passive: true });
    document.addEventListener('pointerleave', onCursorOut);
  }

  /* ============================================================
     THE CAT — Winter, "Comes when called"
     Patrols on its own, but drops what it is doing and trots over
     when the cursor comes down to its level, then paws at it.
     ============================================================ */
  const CAT = { w: 62, patrol: 58, chase: 210, notice: 200, paw: 30 };
  let cat = null;
  let catRAF = null;

  function startCat(el) {
    stopCat();
    el.classList.add('live');
    cat = { el, x: window.innerWidth * 0.2, facing: 1, goal: null, moving: false };
    let last = performance.now();
    const step = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      tickCat(dt);
      catRAF = requestAnimationFrame(step);
    };
    catRAF = requestAnimationFrame(step);
  }

  function stopCat() {
    if (catRAF) cancelAnimationFrame(catRAF);
    catRAF = null;
    if (cat) { cat.el.classList.remove('live', 'walking', 'pawing'); cat.el.style.transform = ''; }
    cat = null;
  }

  function tickCat(dt) {
    if (!cat) return;
    const W = window.innerWidth, H = window.innerHeight;
    const minX = W * 0.04, maxX = W * 0.88 - CAT.w;
    const nose = cat.x + CAT.w / 2;

    // it only notices the cursor when it comes down near the floor
    const interested = Store.settings().catChase !== false && cursor.seen &&
                       cursor.y > H - CAT.notice;
    let goal;
    if (interested) {
      goal = Math.max(minX, Math.min(maxX, cursor.x - CAT.w / 2));
    } else {
      if (cat.goal === null || Math.abs(cat.x - cat.goal) < 8) {
        cat.goal = (cat.goal !== null && cat.goal > (minX + maxX) / 2) ? minX : maxX;
      }
      goal = cat.goal;
    }

    const dx = goal - cat.x;
    const speed = interested ? CAT.chase : CAT.patrol;
    if (Math.abs(dx) > 2) {
      const move = Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
      cat.x += move;
      cat.facing = move > 0 ? 1 : -1;
      cat.moving = true;
    } else {
      cat.moving = false;
    }

    const pawing = interested && Math.abs(nose - cursor.x) < CAT.paw;
    cat.el.classList.toggle('pawing', pawing);
    cat.el.classList.toggle('walking', cat.moving && !pawing);
    cat.el.style.transform = 'translateX(' + cat.x.toFixed(1) + 'px) scaleX(' + cat.facing + ')';
  }

  /* ============================================================
     A SCENE FOR THE REST OF THE THEMES

     Same house rules as the ones above: everything lives inside
     #fx-scene, so Scenery switches it off and "Hold it still" stops it
     dead, and anything that loops for ever moves transform or opacity
     and nothing else — never a filter, never a shadow.
     ============================================================ */

  /** A div in the scene, with optional inline style and markup. */
  function add(cls, style, html) {
    const d = document.createElement('div');
    d.className = cls;
    if (style) d.setAttribute('style', style);
    if (html) d.innerHTML = html;
    scene.appendChild(d);
    return d;
  }

  /* The scenes added after the fact. Each of these themes had nothing behind it
     to begin with, so each keeps a switch to put it back that way. */
  const NEW_SCENES = ['graph', 'city', 'fog', 'plane'];
  const isNewScene = s => NEW_SCENES.indexOf(s) !== -1;
  const newSceneOn = key => Store.settings().newScene[key] !== false;

  /* a repeatable jitter — the same every run, so a theme always looks itself */
  const wob = (i, m, seed) => ((i * 47 + (seed || 0) * 31) % m);

  /* ---------- Midnight: a city with its lights on ---------- */
  function buildCityScene() {
    add('mn-moon');
    const bars = [];
    const n = 14;
    for (let i = 0; i < n; i++) bars.push({ x: (i * 100) / n, w: 100 / n, h: 26 + wob(i, 52, 3) });

    let d = '';
    bars.forEach(b => {
      d += 'M' + b.x.toFixed(2) + ' 100 h' + b.w.toFixed(2) +
           ' v-' + b.h.toFixed(2) + ' h-' + b.w.toFixed(2) + ' Z ';
    });
    add('mn-city', null,
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="' + d + '"/></svg>');

    /* windows, placed inside the buildings rather than scattered over them */
    bars.forEach((b, i) => {
      const rows = 2 + wob(i, 3, 1);
      for (let r = 0; r < rows; r++) {
        const up = 0.22 + r * 0.24;                       // how far up the building
        add('mn-win',
          'left:' + (b.x + b.w * (0.3 + 0.4 * ((i + r) % 2))).toFixed(2) + '%;' +
          'bottom:' + (b.h * up * 0.3).toFixed(2) + '%;' +
          'animation-delay:-' + (((i * 7 + r * 13) % 50) / 10) + 's;' +
          'animation-duration:' + (5 + wob(i + r, 6, 2)) + 's');
      }
    });
  }

  /* ---------- Amethyst: the graph, turning slowly ---------- */
  const GRAPH_NODES = [[50, 50, 9], [50, 18, 6], [20, 38, 5], [80, 42, 6],
                       [32, 78, 4], [68, 80, 5], [10, 66, 3], [90, 70, 4], [50, 92, 3]];
  const GRAPH_LINKS = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [2, 6], [3, 7], [4, 8], [5, 8], [1, 3]];

  function buildGraphScene() {
    let svg = '<svg viewBox="0 0 100 100">';
    GRAPH_LINKS.forEach(l => {
      const p = GRAPH_NODES[l[0]], q = GRAPH_NODES[l[1]];
      svg += '<line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + q[0] + '" y2="' + q[1] + '"/>';
    });
    svg += '</svg>';
    const g = add('ob-graph', null, svg);
    GRAPH_NODES.forEach((n, i) => {
      const dot = document.createElement('span');
      dot.className = 'ob-node';
      dot.setAttribute('style',
        'left:' + n[0] + '%;top:' + n[1] + '%;width:' + n[2] * 2 + 'px;height:' + n[2] * 2 + 'px;' +
        'margin:-' + n[2] + 'px 0 0 -' + n[2] + 'px;animation-delay:-' + (i * 0.9) + 's');
      g.appendChild(dot);
    });
  }

  /* ---------- Slate: fog moving across a ridge ---------- */
  function buildFogScene() {
    add('sl-ridge sl-far', null,
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
      '<path d="M0 100 L16 46 L28 66 L44 30 L62 62 L74 44 L88 68 L100 52 L100 100 Z"/></svg>');
    add('sl-ridge sl-near', null,
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
      '<path d="M0 100 L12 70 L30 84 L46 58 L58 78 L76 62 L92 86 L100 74 L100 100 Z"/></svg>');
    [0, 1, 2].forEach(i => {
      add('sl-fog',
        'bottom:' + (9 + i * 8) + '%;' +
        'animation-duration:' + (46 + i * 19) + 's;' +
        'animation-delay:-' + (i * 12) + 's;' +
        'opacity:' + (0.5 - i * 0.12).toFixed(2));
    });
  }

  /* ---------- Paper: a plane, going somewhere ---------- */
  function buildPlaneScene() {
    add('pp-cloud', 'top:15%;animation-duration:150s');
    add('pp-cloud pp-sm', 'top:27%;left:56%;animation-duration:190s;animation-delay:-60s');
    add('pp-cloud pp-sm', 'top:9%;left:78%;animation-duration:170s;animation-delay:-25s');
    add('pp-plane', null,
      '<svg viewBox="0 0 40 26"><path d="M1 13 L38 2 L26 24 L20 15 Z"/>' +
      '<path class="pp-fold" d="M20 15 L38 2" fill="none"/></svg>');
  }

  /* ============================================================
     FALLING PARTICLES
     ============================================================ */
  let parts = [], raf = null, mode = null;

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const SPEC = {
    snow:  { n: 90,  color: '#ffffff',  size: [1.2, 3.4], vy: [.35, 1.1],  drift: .5,  alpha: [.35, .9] }
  };

  function startFall() {
    const s = Store.settings();
    const theme = THEMES.find(t => t.key === s.theme);
    const want = (s.snow && theme && theme.fall) ? theme.fall : null;

    if (!want) {
      canvas.classList.remove('on');
      cancelAnimationFrame(raf);
      raf = null; mode = null;
      return;
    }
    mode = want;
    canvas.classList.add('on');
    sizeCanvas();
    seed();
    if (!raf) loop();
  }

  function seed() {
    const spec = SPEC[mode];
    const rand = (a, b) => a + Math.random() * (b - a);
    parts = [];
    for (let i = 0; i < spec.n; i++) {
      parts.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: rand(spec.size[0], spec.size[1]),
        vy: rand(spec.vy[0], spec.vy[1]),
        a: rand(spec.alpha[0], spec.alpha[1]),
        p: Math.random() * Math.PI * 2,
        sp: rand(.006, .022)
      });
    }
  }

  /* ---------- accumulating snow ---------- */
  const DRIFT_TOP = 84;          // where the painted bank already sits
  const DRIFT_CAP = 46;          // how deep it may get — kept below the snowman's head
  let bank = null;               // per-column depth, in px

  function resetBank() {
    const cols = Math.max(24, Math.ceil(window.innerWidth / 12));
    bank = new Float32Array(cols);
  }
  const bankIndex = (x, W) => Math.max(0, Math.min(bank.length - 1, Math.floor((x / W) * bank.length)));

  function drawBank(W, H, color) {
    let any = false;
    for (let i = 0; i < bank.length; i++) if (bank[i] > 0.4) { any = true; break; }
    if (!any) return;
    const step = W / bank.length;
    ctx2d.globalAlpha = 0.92;
    ctx2d.fillStyle = color;
    ctx2d.beginPath();
    ctx2d.moveTo(0, H);
    for (let i = 0; i < bank.length; i++) {
      // average with the neighbours so the surface reads as a smooth bank
      const l = bank[Math.max(0, i - 1)], r = bank[Math.min(bank.length - 1, i + 1)];
      const d = (l + bank[i] * 2 + r) / 4;
      ctx2d.lineTo(i * step, H - DRIFT_TOP - d);
    }
    ctx2d.lineTo(W, H);
    ctx2d.closePath();
    ctx2d.fill();
  }

  /** Sweeping the cursor through the bank pushes the snow aside. */
  function sweepBank(W, H) {
    if (!cursor.seen) return;
    const surfaceY = H - DRIFT_TOP;
    if (cursor.y < surfaceY - DRIFT_CAP - 20 || cursor.y > H) return;
    const reach = 4;
    const c = bankIndex(cursor.x, W);
    for (let i = Math.max(0, c - reach); i <= Math.min(bank.length - 1, c + reach); i++) {
      const top = surfaceY - bank[i];
      if (cursor.y > top - 14) bank[i] *= 0.82;      // ploughed through
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!mode) return;
    const spec = SPEC[mode];
    const set = Store.settings();
    const W = window.innerWidth, H = window.innerHeight;
    const color = spec.color;
    ctx2d.clearRect(0, 0, W, H);

    const settling = mode === 'snow' && set.snowSettle !== false && set.scene !== false;
    if (settling && (!bank || bank.length < 24)) resetBank();
    const wind = set.fxWind !== false;

    if (settling) { sweepBank(W, H); drawBank(W, H, color); }
    ctx2d.fillStyle = color;

    for (const p of parts) {
      p.p += p.sp;
      p.x += Math.sin(p.p) * spec.drift;
      p.y += p.vy;

      /* the pointer pushes particles aside, and drags them along in its wake */
      if (wind && cursor.seen) {
        const dx = p.x - cursor.x, dy = p.y - cursor.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) {
          const k = (1 - d / 130), inv = 1 / (d || 1);
          p.x += dx * inv * k * 2.4 + cursor.vx * k * 0.32;
          p.y += dy * inv * k * 2.4 + cursor.vy * k * 0.32;
        }
      }

      /* snow that reaches the bank settles into it */
      if (settling && p.vy > 0) {
        const i = bankIndex(p.x, W);
        if (p.y > H - DRIFT_TOP - bank[i]) {
          if (bank[i] < DRIFT_CAP) bank[i] += 0.55;
          p.y = -8; p.x = Math.random() * W;
          continue;
        }
      }

      if (p.vy > 0 && p.y > H + 6) { p.y = -8; p.x = Math.random() * W; }
      if (p.vy < 0 && p.y < -6) { p.y = H + 8; p.x = Math.random() * W; }
      if (p.x < -10) p.x = W + 8;
      if (p.x > W + 10) p.x = -8;

      ctx2d.globalAlpha = p.a;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx2d.fill();
    }
    ctx2d.globalAlpha = 1;
    /* The pointer's velocity is read as wind above, so bleed it off here:
       left alone it keeps whatever it was last set to and the particles
       blow for ever. */
    cursor.vx *= 0.82;
    cursor.vy *= 0.82;
  }

  window.addEventListener('resize', () => { if (mode) { sizeCanvas(); } });

  /* ============================================================
     SETTINGS DRAWER
     ============================================================ */
  function renderSettings() {
    const s = Store.settings();
    const theme = THEMES.find(t => t.key === s.theme) || THEMES[0];

    drawerBody.innerHTML = '';

    /* --- layout: the biggest switch there is, so it goes first --- */
    const g0 = group('Layout');
    g0.appendChild(segmented('Shape',
      'Auto follows the size of the window. Pick one to hold it there whatever the device.',
      [{ v: 'auto', label: 'Auto' }, { v: 'phone', label: 'Phone' }, { v: 'desktop', label: 'Desktop' }],
      s.layout || 'auto',
      v => {
        Store.mutate(st => { st.settings.layout = v; }, null, { silent: true });
        Mobile.apply();
        renderSettings();
      }));
    const shapeNow = document.createElement('p');
    shapeNow.className = 'hint';
    shapeNow.style.marginTop = '8px';
    shapeNow.textContent = (Mobile.isPhone()
      ? 'The phone shape: the rail runs along the bottom, panels come up over the board, and columns are swiped one at a time.'
      : 'The wide shape: rail down the side, panels beside the board.') +
      ' This window is ' + window.innerWidth + 'px across; auto turns over at ' + Mobile.NARROW + '.';
    g0.appendChild(shapeNow);


    /* Filling the screen. Kept on the device rather than in the board,
       because it is about this piece of glass and nothing else.

       Three situations, and they want three different things said:

         · launched fullscreen by the manifest — nothing to offer, so
           explain rather than show a switch that would do nothing
         · installed but in the ordinary app shape — the browser bars are
           already gone, so this would only buy the status bar, and it
           would buy it at the price of the browser's notice on every
           launch. Offered, but never done automatically, and said plainly
         · an ordinary page in a browser — the whole point, notice and all */
    if (Fullscreen.byDisplay() || Fullscreen.inApp()) {
      const already = document.createElement('p');
      already.className = 'hint';
      already.style.marginTop = '8px';
      already.textContent = (Fullscreen.inApp()
        ? 'The app is drawn edge to edge by Android itself, so there is nothing to '
        : 'This copy was installed to the home screen and opens ') +
        (Fullscreen.inApp()
          ? 'switch. Nothing is asked for and '
          : 'filling the screen, so there is nothing to switch. Nothing is asked for and ') +
        'nothing is announced.';
      g0.appendChild(already);
    } else if (Fullscreen.installed()) {
      g0.appendChild(toggle('Take the status bar too',
        'The browser’s bars are already gone — this is the phone’s own status bar, ' +
        'the clock and the battery. It is off unless you ask, because taking the ' +
        'screen by hand makes the browser show its “drag from the top to exit” ' +
        'notice, every time you come back.',
        Fullscreen.wanted() && Fullscreen.isOn(),
        v => { Fullscreen.want(v); }));
    } else if (Fullscreen.supported()) {
      g0.appendChild(toggle('Fill the screen',
        'Takes the browser’s own bars away, top and bottom, and the phone’s status ' +
        'bar with them. It is asked for on your first touch after opening, because a ' +
        'browser only grants it during one — and asked for again whenever you come ' +
        'back, because switching away gives the screen up. The browser’s own notice ' +
        'about dragging from the top comes with it and cannot be turned off from ' +
        'here; installing the hosted copy is the way to be rid of it.',
        Fullscreen.wanted(),
        v => { Fullscreen.want(v); }));
    }
    /* What crosses from this shape to the other. Only this shape's side is
       shown: which of the computer's changes reach the phone is chosen on
       the computer, and the other way round on the phone. */
    const onPhone = Mobile.isPhone();
    const here = onPhone ? 'phone' : 'desktop';
    const otherName = onPhone ? 'the computer' : 'the phone';
    const crossHead = document.createElement('div');
    crossHead.className = 'layout-cross';
    crossHead.style.padding = '12px 0 2px';
    crossHead.innerHTML = '<div class="tr-name">' + (onPhone
        ? 'Changes on the phone that change the computer too'
        : 'Changes on the computer that change the phone too') + '</div>' +
      '<div class="tr-desc">The computer and the phone each keep their own layout, so opening or ' +
      'closing something here leaves ' + otherName + ' as it is. Switch a part on to have it follow ' +
      'this one from now on. Notes, categories and everything else sync as before.' +
      (onPhone ? '' : ' The phone chooses the same for its own changes, in its own Settings.') + '</div>';
    g0.appendChild(crossHead);
    const crossing = Layouts.sharing(here);
    const PART_COPY = {
      categories: ['Categories panel', 'Opening or closing it here opens or closes it on ' + otherName + '.'],
      presets: ['Presets panel', 'Opening or closing it here does the same on ' + otherName + '.'],
      canvases: ['Canvases panel', 'Opening or closing it here does the same on ' + otherName + '.'],
      today: ['Do Today panel', 'Opening or closing Do Today here does the same on ' + otherName + '.'],
      lists: ['Lists open on the board', 'Which lists are open, their order and which are folded — ' +
        'changing them here changes them on ' + otherName + '.']
    };
    Layouts.PARTS.forEach(part => {
      const row = toggle(PART_COPY[part][0], PART_COPY[part][1], crossing[part],
        v => Layouts.setSharing(here, part, v));
      row.dataset.layoutPart = part;
      g0.appendChild(row);
    });
    drawerBody.appendChild(g0);

    /* --- themes --- */
    const g1 = group('Theme');
    const grid = document.createElement('div');
    grid.className = 'theme-grid';
    THEMES.forEach(t => {
      const b = document.createElement('button');
      b.className = 'theme-card' + (t.key === s.theme ? ' on' : '');
      b.dataset.key = t.key;
      b.innerHTML = '<span class="theme-swatch">' +
        t.swatch.map(c => '<i style="background:' + c + '"></i>').join('') +
        '</span><span class="theme-name">' + t.name + '</span>';
      b.onclick = e => {
        const r = e.currentTarget.getBoundingClientRect();
        apply(t.key, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      };
      grid.appendChild(b);
    });
    g1.appendChild(grid);
    g1.appendChild(toggle('Themed menus',
      'Settings and the right-click menus dress in this theme’s own colours and style. Off, they are plain.',
      s.menuSkin !== false,
      v => {
        Store.mutate(st => { st.settings.menuSkin = v; }, null, { silent: true });
        applyThemeClasses();
      }));
    drawerBody.appendChild(g1);

    /* --- ambient --- only what this theme actually has --- */
    const g2 = group('Ambient');
    const set = (k, v) => Store.mutate(st => { st.settings[k] = v; }, null, { silent: true });

    /* Themes that were given a scene later keep a way back to the plain
       version they started as. It sits first, because everything below it
       belongs to the scene it turns on. */
    const fresh = isNewScene(theme.scene);
    const sceneOn = !fresh || newSceneOn(theme.key);
    if (fresh) {
      g2.appendChild(toggle('New scene',
        'The scenery this theme was given later. Off puts it back exactly as it was before it had any.',
        sceneOn,
        v => {
          Store.mutate(st => { st.settings.newScene[theme.key] = v; }, null, { silent: true });
          buildScene();
          renderSettings();
        }));
    }

    /* every theme keeps its own answer to this */
    g2.appendChild(toggle('Polish',
      theme.key === 'amethyst'
        ? 'Off is the plain app look. On adds depth, gradients and a violet glow.'
        : theme.landscape
          ? 'On, the columns and panels are dark glass and the picture shows through them. Off, they are solid and it only shows around them.'
          : 'Depth, gradients and glow. Off is a flat, plain version of this theme.',
      polishOn(theme.key),
      v => {
        Store.mutate(st => { st.settings.polish[theme.key] = v; }, null, { silent: true });
        applyThemeClasses();
      }));

    if (theme.fall) {
      const copy = FALL_COPY[theme.fall] || ['Falling particles', ''];
      // things that only mean anything while there are particles to affect
      const fallSub = subRows(s.snow);
      fallSub.appendChild(toggle('Cursor wind',
        'They swerve around your pointer and trail along in its wake.',
        s.fxWind !== false, v => set('fxWind', v)));
      if (theme.key === 'winter') {
        fallSub.appendChild(toggle('Settling snow',
          'It piles up along the bottom over time. Sweep through it to clear it.',
          s.snowSettle !== false, v => set('snowSettle', v)));
      }
      g2.appendChild(toggle(copy[0], copy[1], s.snow,
        v => { set('snow', v); startFall(); fallSub.classList.toggle('is-hidden', !v); }));
      g2.appendChild(fallSub);
    }

    if (theme.scene && sceneOn) {
      const copy = SCENE_COPY[theme.scene];
      // rows that only make sense while the scenery is on
      const sub = subRows(s.scene);
      const still = s.sceneStill === true;
      /* and, inside that, the ones that only mean anything while it moves */
      const motion = document.createElement('div');
      motion.className = 'motion-rows' + (still ? ' is-hidden' : '');

      sub.appendChild(toggle('Hold it still',
        'Paint the scene once and let nothing in it move. The whole picture, none of the work — by far the cheapest way to keep a backdrop.',
        still,
        v => {
          set('sceneStill', v);
          motion.classList.toggle('is-hidden', v);
          buildScene();
        }));
      sub.appendChild(motion);

      if (theme.scene === 'winter') {
        const catSub = subRows(s.cat);
        catSub.appendChild(toggle('Comes when called',
          'It notices the cursor near the floor, trots over and paws at it.',
          s.catChase !== false, v => { set('catChase', v); buildScene(); }));
        // whether there is a cat at all is not a question about motion
        sub.appendChild(toggle('Walking cat', 'A cat that patrols the bottom of the page.', s.cat,
          v => { set('cat', v); buildScene(); catSub.classList.toggle('is-hidden', !v); }));
        motion.appendChild(catSub);
      }
      g2.appendChild(toggle(copy[0], copy[1], s.scene,
        v => { set('scene', v); buildScene(); sub.classList.toggle('is-hidden', !v); }));
      g2.appendChild(sub);
    }




    /* the rest work on every theme */
    g2.appendChild(toggle('Confetti',
      'A burst when you tick off the last thing in Do Today.',
      s.fxConfetti !== false, v => set('fxConfetti', v)));

    /* splash, with its settings tucked underneath */
    const splashSub = subRows(s.splash);
    splashSub.appendChild(slider('How long it holds', s.splashDelay, 0, 6000,
      v => set('splashDelay', v), 50, null,
      ms => ms === 0 ? 'off' : ms + ' ms · ' + (ms / 1000).toFixed(1) + 's'));
    splashSub.appendChild(slider('Catchphrase size', s.splashPhraseSize, 10, 32, v => {
      set('splashPhraseSize', v);
      document.documentElement.style.setProperty('--splash-phrase', v + 'px');
    }, 1, 'px'));
    const prev = button('Preview it', () => { closeDrawer(); setTimeout(() => App.previewSplash(), 260); });
    prev.style.marginTop = '2px';
    splashSub.appendChild(prev);

    g2.appendChild(toggle('Loading splash', 'Show the splash screen when the page opens.', s.splash,
      v => { set('splash', v); splashSub.classList.toggle('is-hidden', !v); }));
    g2.appendChild(splashSub);

    drawerBody.appendChild(g2);

    /* --- board --- */
    const g3 = group('Board');
    g3.appendChild(slider('Columns on screen', s.maxOpen, 2, 16, v => {
      Store.mutate(st => { st.settings.maxOpen = v; }, ['board', 'lists']);
    }));
    g3.appendChild(toggle('Full screen hides everything',
      'Off keeps the top bar and the rail so you can still get around. On takes those too.',
      s.zenHideAll === true,
      v => { set('zenHideAll', v); App.refreshZen(); }));
    g3.appendChild(slider('Column width', s.listWidth, 220, 420, v => {
      Store.mutate(st => { st.settings.listWidth = v; }, null, { silent: true });
      Mobile.syncWidth();          // a phone sizes its columns to the screen instead
      Lists.syncGrabline();
      Presets.renderBands();
    }, 10, 'px'));
    drawerBody.appendChild(g3);

    /* --- canvas --- */
    const g35 = group('Canvas');
    const cv = Store.activeCanvas();
    g35.appendChild(slider('Canvas scale', Math.round((cv ? cv.zoom : s.canvasScale) * 100), 25, 300, v => {
      Store.mutate(st => { st.settings.canvasScale = v / 100; }, null, { silent: true });
      Canvas.setZoom(v / 100);
    }, 5, '%'));
    g35.appendChild(toggle('Grid', 'A dotted grid behind the canvas.', s.canvasGrid,
      v => Store.mutate(st => { st.settings.canvasGrid = v; }, ['canvas'])));

    g35.appendChild(segmented(
      'Long category cards',
      'What a category card does when it holds more notes than fit.',
      [{ v: 'scroll', label: 'Scroll' }, { v: 'count', label: '+N more' }],
      s.canvasListOverflow,
      v => { Store.mutate(st => { st.settings.canvasListOverflow = v; }, ['canvas']); renderSettings(); }
    ));
    g35.appendChild(slider('Rows before it ' + (s.canvasListOverflow === 'scroll' ? 'scrolls' : 'counts'),
      s.canvasListRows, 3, 20, v => {
        Store.mutate(st => { st.settings.canvasListRows = v; }, ['canvas']);
      }));
    const pasteHint = document.createElement('p');
    pasteHint.className = 'hint';
    pasteHint.style.marginTop = '-2px';
    pasteHint.textContent = 'Ctrl+V drops a copied picture on the canvas where the mouse is. ' +
      'The picture itself is never touched, so this only sets how big it lands — ' +
      'right-click one to change it afterwards.';
    g35.appendChild(slider('Pasted pictures', s.pasteScale === undefined ? 100 : s.pasteScale, 10, 200,
      v => Store.mutate(st => { st.settings.pasteScale = v; }, null, { silent: true }), 5, null,
      v => v + '% of its own size'));
    g35.appendChild(pasteHint);

    g35.appendChild(button('Fit everything on screen', () => { Store.setView('canvas'); Canvas.fit(); closeDrawer(); }));
    drawerBody.appendChild(g35);

    /* --- phone notifications --- */
    drawerBody.appendChild(ntfyGroup(s));

    /* --- profiles --- sits above sync, because which board you are on
       decides which room and passphrase the sync rows below are about */
    drawerBody.appendChild(profilesGroup());

    /* --- sync --- */
    drawerBody.appendChild(syncGroup(s));

    /* --- data --- */
    const g4 = group('Data');
    const note = document.createElement('p');
    note.className = 'hint';
    note.style.marginBottom = '10px';
    note.textContent = 'Everything saves to this browser automatically. Export gives you a file you can carry to another machine.';
    g4.appendChild(note);

    g4.appendChild(button('Export a backup', () => {
      const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'flowlist-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }));

    g4.appendChild(button('Import a backup', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return;
        const fr = new FileReader();
        fr.onload = () => {
          try { Store.importJSON(fr.result); UI.toast('Backup restored.'); }
          catch (e) { UI.toast('That file was not a Flowlist backup.'); }
        };
        fr.readAsText(f);
      };
      inp.click();
    }));

    g4.appendChild(button('Reset everything', () => {
      if (window.confirm('Wipe every category, note and preset, and start from the sample board?')) {
        Store.reset();
        UI.toast('Back to a clean board.');
      }
    }, true));

    drawerBody.appendChild(g4);

    /* --- shortcuts: every key the app answers to, each with its own switch --- */
    const gk = group('Shortcuts');
    const keyNote = document.createElement('p');
    keyNote.className = 'hint';
    keyNote.style.marginBottom = '8px';
    keyNote.textContent = 'Every key Flowlist answers to. Switch off any you keep pressing by accident; the rest go on working.';
    gk.appendChild(keyNote);
    let where = '';
    Keys.LIST.forEach(k => {
      if (k.where !== where) {
        where = k.where;
        const h = document.createElement('div');
        h.className = 'key-where';
        h.textContent = where;
        gk.appendChild(h);
      }
      const row = toggle(k.what, '', Keys.on(k.id), v => Keys.set(k.id, v));
      row.classList.add('key-row');
      row.dataset.key = k.id;
      row.querySelector('.tr-name').innerHTML =
        '<kbd class="keycap">' + UI.esc(k.keys) + '</kbd><span>' + UI.esc(k.what) + '</span>';
      const desc = row.querySelector('.tr-desc');
      if (desc) desc.remove();
      gk.appendChild(row);
    });
    const keyBtns = document.createElement('div');
    keyBtns.className = 'set-row key-all';
    keyBtns.appendChild(mini('Switch them all on', () => { Keys.set('*', true); renderSettings(); }));
    keyBtns.appendChild(mini('Switch them all off', () => { Keys.set('*', false); renderSettings(); }));
    gk.appendChild(keyBtns);
    drawerBody.appendChild(gk);

    dressSettings();
  }

  /* ============================================================
     FINDING YOUR WAY ROUND SETTINGS

     Settings is one long page of sections. Down the side, a button for
     each one takes you straight to it, and lights up as you scroll past.
     Across the top, a box that narrows the page to what matches - by
     name or by what a setting says about itself - so "snow" or "sync"
     finds its switch without knowing which section it lives in.
     ============================================================ */
  const GROUP_ICONS = {
    layout: 'grid', theme: 'palette', ambient: 'star', board: 'layers', canvas: 'canvas',
    phone: 'news', sync: 'cloud', data: 'copy', shortcuts: 'keys', profiles: 'layers'
  };
  const settingsNav = document.getElementById('settings-nav');
  const searchBox = document.getElementById('settings-search');
  let navActive = null;

  function markNav() {
    if (!settingsNav) return;
    settingsNav.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('on', b.dataset.group === navActive));
    /* on a phone the sections are a strip across the top: keep the lit
       one in sight as you scroll past the ones either side of it. Measured
       in the next frame, once the page is laid out anyway - measuring now,
       in the middle of building Settings, would lay it all out twice. */
    if (!Mobile.isPhone()) return;
    requestAnimationFrame(() => {
      const on = settingsNav.querySelector('.nav-item.on');
      if (!on || settingsNav.scrollWidth <= settingsNav.clientWidth + 1) return;
      const nr = settingsNav.getBoundingClientRect(), br = on.getBoundingClientRect();
      if (br.left < nr.left + 8 || br.right > nr.right - 8)
        settingsNav.scrollLeft += br.left - nr.left - (nr.width - br.width) / 2;
    });
  }

  /* where a section sits in the scrolling page, whatever is positioned
     around it */
  function sectionTop(g) {
    /* measured on screen, so while the sheet is still growing in as it
       opens the distance is shrunk with it - scale it back to the page's */
    const br = drawerBody.getBoundingClientRect();
    const scale = drawerBody.offsetHeight ? br.height / drawerBody.offsetHeight : 1;
    return (g.getBoundingClientRect().top - br.top) / (scale || 1) + drawerBody.scrollTop;
  }

  function dressSettings() {
    if (!settingsNav) return;
    settingsNav.innerHTML = '';
    drawerBody.querySelectorAll(':scope > .set-group').forEach(g => {
      const slug = g.dataset.group;
      const b = document.createElement('button');
      b.className = 'nav-item';
      b.dataset.group = slug;
      b.innerHTML = UI.icon(GROUP_ICONS[slug] || 'layers') + '<span>' + UI.esc(g.dataset.label) + '</span>';
      b.onclick = () => {
        navActive = slug;
        markNav();
        /* the page is on its way there: what it passes on the way is not
           where you are, so the lights wait for it to arrive */
        spyHold = Date.now() + 1200;
        drawerBody.scrollTo({ top: Math.max(0, sectionTop(g) - 12), behavior: 'smooth' });
        g.classList.remove('flash'); void g.offsetWidth; g.classList.add('flash');
      };
      settingsNav.appendChild(b);
    });
    if (!navActive) navActive = (drawerBody.querySelector(':scope > .set-group') || { dataset: {} }).dataset.group;
    markNav();
    applySearch();
  }

  /* the section nearest the top of the page is the one you are in */
  /* Straight from the scroll event, which the browser already sends at
     most once a frame - and scrolling moves nothing that has to be laid
     out again, so reading where the sections are costs nothing here. */
  let spyHold = 0;
  function spy() {
    if (Date.now() < spyHold) return;
    const gs = drawerBody.querySelectorAll(':scope > .set-group:not(.search-miss)');
    if (!gs.length) return;
    const top = drawerBody.getBoundingClientRect().top;
    /* the last one whose top has reached the top of the page - or, at
       the very bottom, the last one, which may be too short to get there */
    let best = gs[0];
    gs.forEach(g => { if (g.getBoundingClientRect().top - top <= 48) best = g; });
    if (drawerBody.scrollTop > 0 &&
        drawerBody.scrollTop + drawerBody.clientHeight >= drawerBody.scrollHeight - 4) best = gs[gs.length - 1];
    if (best.dataset.group !== navActive) { navActive = best.dataset.group; markNav(); }
  }

  function applySearch() {
    const q = ((searchBox && searchBox.value) || '').trim().toLowerCase();
    drawer.classList.toggle('searching', !!q);
    let shown = 0;
    drawerBody.querySelectorAll(':scope > .set-group').forEach(g => {
      const labelHit = !!q && (g.dataset.label || '').toLowerCase().indexOf(q) !== -1;
      let any = false;
      [].forEach.call(g.children, c => {
        if (c.classList.contains('set-label')) return;
        const hit = !q || labelHit || c.textContent.toLowerCase().indexOf(q) !== -1;
        c.classList.toggle('search-miss', !hit);
        if (hit) any = true;
      });
      const miss = !!q && !any && !labelHit;
      g.classList.toggle('search-miss', miss);
      if (!miss) shown++;
      const nb = settingsNav && settingsNav.querySelector('.nav-item[data-group="' + g.dataset.group + '"]');
      if (nb) nb.classList.toggle('search-miss', miss);
    });
    let none = drawerBody.querySelector(':scope > .set-none');
    if (q && !shown) {
      if (!none) {
        none = document.createElement('p');
        none.className = 'set-none';
        drawerBody.appendChild(none);
      }
      none.textContent = 'Nothing in Settings matches “' + q + '”.';
    } else if (none) none.remove();
  }

  /* ---------- phone notifications ---------- */
  function mini(label, onClick) {
    const b = document.createElement('button');
    b.className = 'set-mini';
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }

  /** Clipboard, with a hand-selection fallback for browsers that refuse. */
  function copyText(text) {
    if (!text) { UI.toast('Nothing to copy yet.'); return; }
    const byHand = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let done = false;
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      ta.remove();
      UI.toast(done ? 'Copied.' : 'Copy it by hand: ' + text);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => UI.toast('Copied.'), byHand);
    } else byHand();
  }

  /**
   * Reminders for Do Today, pushed to a phone through ntfy.
   * The preview card is the point of the wording settings — change one and
   * you see the notification you are actually going to get.
   */
  /* ---------- live sync ---------- */
  /* The room key is still the whole of the way in — there is no sign-in, so
     knowing it is what stands for permission. What these add on top is that
     even someone who did know it cannot do the two worst things:

       - they cannot empty a room, because a write has to leave something
         behind, so a guessed key cannot be used to wipe the board
       - they cannot store a readable board, because "enc" is required and
         anything else is refused, so the database itself will not hold a
         plain copy even if the app tries to send one

     That second one turns the encryption from a promise this code makes into
     a rule the database enforces. */
  const SYNC_RULES =
    '{\n' +
    '  "rules": {\n' +
    '    "rooms": {\n' +
    '      ".read": false,\n' +
    '      ".write": false,\n' +
    '      "$room": {\n' +
    '        ".read": true,\n' +
    '        ".write": "newData.exists()",\n' +
    '        "rev": { ".validate": "newData.isNumber()" },\n' +
    '        "at":  { ".validate": "newData.isNumber()" },\n' +
    '        "enc": {\n' +
    '          ".validate": "newData.hasChildren([\'v\', \'iv\', \'data\'])",\n' +
    '          "v":    { ".validate": "newData.isNumber()" },\n' +
    '          "iv":   { ".validate": "newData.isString() && newData.val().length < 64" },\n' +
    '          "data": { ".validate": "newData.isString()" },\n' +
    '          "$else": { ".validate": false }\n' +
    '        },\n' +
    '        ".validate": "newData.hasChildren([\'rev\', \'at\', \'enc\'])",\n' +
    '        "$else": { ".validate": false }\n' +
    '      }\n' +
    '    }\n' +
    '  }\n' +
    '}';

  /**
   * The board on every device. The room key is the whole of the security, so
   * it is generated rather than invented, and said so plainly.
   */
  /* ============================================================
     PROFILES

     A separate board on the same machine, with its own room key and
     passphrase. Switching puts the board you are on away first - written
     to disk, then pushed to its room - and only then swaps and reloads.

     The wording here is deliberate about what removing one does and does
     not do. It clears a profile from this device; it is not a shredder,
     and saying so would be worse than saying nothing. See forget() in
     js/profiles.js for why.
     ============================================================ */
  function profilesGroup() {
    const g = group('Profiles');

    const note = document.createElement('p');
    note.className = 'hint';
    note.style.marginBottom = '10px';
    note.textContent = 'A second board on this machine, with its own notes, its own room key ' +
      'and its own passphrase. Switching saves and sends the board you are on first.';
    g.appendChild(note);

    Profiles.list().forEach(p => {
      const here = p.id === Profiles.active();
      const row = document.createElement('div');
      row.className = 'toggle-row';
      row.innerHTML = '<div><div class="tr-name">' + UI.esc(p.name) +
        (here ? ' <span class="dim">— on this one now</span>' : '') + '</div>' +
        '<div class="tr-desc">' + (here ? 'The board in front of you.'
          : (Profiles.used(p.id) ? 'Saved on this device.' : 'Never opened yet — it will start empty.')) +
        '</div></div>';

      const acts = document.createElement('div');
      acts.className = 'set-actions';

      if (!here) {
        acts.appendChild(button('Switch to it', async () => {
          UI.toast('Saving and sending this board first…');
          await Profiles.switchTo(p.id);
        }));
      }
      acts.appendChild(button('Rename', () => {
        const name = prompt('Call this profile:', p.name);
        if (name === null) return;
        Profiles.rename(p.id, name);
        renderSettings();
      }));
      if (!here && p.id !== Profiles.MAIN) {
        acts.appendChild(button('Remove from this device', () => confirmForget(p), true));
      }
      /* The key on a drive. Only offered for the board in front of you,
         and only while it is open: protecting it needs the board, and
         cutting a spare needs the key that opens it - which is the point,
         because it means a spare can only be made by someone who could
         already get in. */
      if (here && p.id !== Profiles.MAIN && KeyFile.available()) {
        if (!Profiles.isLocked(p.id)) acts.appendChild(button('Keep this board on a drive…', protectHere));
        else if (!Store.isShut()) acts.appendChild(button('Make a spare key', spareKey));
      }
      row.appendChild(acts);
      g.appendChild(row);
    });

    g.appendChild(button('Add another profile', () => {
      const name = prompt('Call the new profile:', 'Second');
      if (name === null) return;
      Profiles.add(name);
      renderSettings();
    }));

    return g;
  }

  /**
   * Put this board's key on a drive.
   *
   * The key file is written wherever you point it — a USB stick is the
   * idea, but nothing here checks, because a browser cannot tell one drive
   * from another and pretending to would be worse than saying nothing.
   * From then on the board is encrypted on disk and this machine holds
   * nothing that opens it.
   */
  async function protectHere() {
    const words = prompt('A backup passphrase, for the day the drive is lost.\n\n' +
      'Make it long — it is the one part of this that someone holding your drive could ' +
      'work on at their leisure. Lose both this and the drive and the board is gone for good.');
    if (words === null) return;

    const file = KeyFile.makeKeyFile();
    let bundle;
    try { bundle = await KeyFile.create(file, words); }
    catch (e) { UI.toast(e.message); return; }

    /* write the key out before anything is sealed: if saving it fails or
       is cancelled, nothing has been locked and nothing is lost */
    const saved = await writeKeyFile(file, 'flowlist-key.json');
    if (!saved) { UI.toast('Nothing was locked — the key was not saved.'); return; }

    Profiles.setLocks(Profiles.active(), bundle);
    Store.sealFrom(await KeyFile.openWithFile(bundle, file));
    Store.flush();
    UI.toast('Locked. Keep that drive safe — and the passphrase somewhere else.');
    renderSettings();
  }

  /** Another key for the same board. Needs it open, which is the safeguard. */
  async function spareKey() {
    const id = Profiles.active();
    const locks = Profiles.locks(id);
    if (!locks || Store.isShut()) { UI.toast('Open this board first.'); return; }
    const dataKey = Store.dataKey && Store.dataKey();
    if (!dataKey) { UI.toast('Open this board with its key first.'); return; }
    const made = await KeyFile.addStick(locks, dataKey);
    const saved = await writeKeyFile(made.file, 'flowlist-key-spare.json');
    if (!saved) { UI.toast('No spare was made.'); return; }
    Profiles.setLocks(id, made.locks);
    UI.toast('A second key. Either one opens this board.');
    renderSettings();
  }

  /** @returns {Promise<Boolean>} whether the key actually got written somewhere */
  async function writeKeyFile(text, suggested) {
    try {
      if (window.showSaveFilePicker) {
        const h = await window.showSaveFilePicker({
          suggestedName: suggested,
          types: [{ description: 'Flowlist key', accept: { 'application/json': ['.json', '.key'] } }]
        });
        const w = await h.createWritable();
        await w.write(text);
        await w.close();
        return true;
      }
    } catch (e) { return false; }
    /* no picker: fall back to an ordinary download, which still lets it be
       put on a drive, just with an extra step */
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = suggested;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return true;
    } catch (e) { return false; }
  }

  /**
   * Removing a profile. The confirmation says plainly what it does, and -
   * because this was asked for as a way of making data unrecoverable
   * before selling a laptop - what it does not do. Overstating it here
   * would be the one way to do real harm.
   */
  function confirmForget(p) {
    const g = document.createElement('div');
    g.className = 'forget-box';
    g.innerHTML =
      '<p><b>Remove “' + UI.esc(p.name) + '” from this device?</b></p>' +
      '<p>Its notes, its room key, its passphrase, its sync log and its undo history are ' +
      'cleared from this machine. If that board is in a sync room, the copy in the room stays ' +
      'and the passphrase will open it again from any device.</p>' +
      '<p class="warn">This is not a shredder. Each entry is overwritten before it is removed, ' +
      'which raises the cost of casual recovery — but the browser appends rather than overwrites, ' +
      'and this laptop\'s drives are SSDs, which move blocks about internally. Someone with the ' +
      'drive and the right tools may still find traces. To make a drive safe to pass on, encrypt ' +
      'it from the start and then reset the machine with the drive wiped.</p>';

    const bar = document.createElement('div');
    bar.className = 'set-actions';
    const prog = document.createElement('div');
    prog.className = 'forget-prog';

    const go = button('Remove it', async () => {
      go.disabled = true;
      await Profiles.forget(p.id, (done, total, what) => {
        prog.textContent = 'Clearing ' + done + ' of ' + total + ' — ' +
          String(what).split('.').slice(-2).join('.');
      });
      prog.textContent = 'Cleared.';
      UI.toast('“' + p.name + '” is off this device.');
      setTimeout(renderSettings, 600);
    }, true);
    bar.appendChild(go);
    bar.appendChild(button('Keep it', () => renderSettings()));
    g.appendChild(bar);
    g.appendChild(prog);

    /* scoped to the body: the nav down the side carries the same
       data-group, and comes first in the document */
    const row = document.querySelector('#settings-body [data-group="profiles"]');
    if (row) { row.appendChild(g); g.scrollIntoView({ block: 'nearest' }); }
  }

  function syncGroup(s) {
    const c = s.sync;
    const g = group('Sync');
    const set = (k, v) => Sync.setLocal(k, v);
    const sub = subRows(c.on === true);

    const state = document.createElement('p');
    state.className = 'hint';
    state.style.marginTop = '9px';

    function paintState() {
      const st = Sync.status();
      const when = ms => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      const words = {
        off: 'Not connected.',
        connecting: 'Connecting…',
        live: 'Live.',
        waiting: 'Saved here, waiting for a way out.'
      };
      const bits = [words[st.state] || ''];
      if (st.at) bits.push('Last change ' + when(st.at) + (st.from ? ' from ' + st.from : '') + '.');
      if (Sync.isDirty()) bits.push('A change here is not out there yet.');
      if (st.sent || st.got) bits.push(st.sent + ' sent, ' + st.got + ' received this session.');
      if (st.error) bits.push('Trouble: ' + st.error);
      /* Something two devices can be held side by side and compared by.
         Same revision and same room ending means the same board, up to
         date. The last four characters of the room are not a way in — the
         rest of it is still seventy-odd bits nobody will guess — but they
         are enough to see at a glance that a phone is in a different room
         from the laptop, which is otherwise invisible: both just say Live. */
      const sc = Store.settings().sync || {};
      if (sc.on && sc.room) {
        bits.push('Revision ' + (sc.rev || 0) + ', room ending “' + String(sc.room).slice(-4) + '”.');
      }
      state.textContent = bits.join(' ');
    }

    /* ---- what to do first ---- */
    const how = document.createElement('p');
    how.className = 'hint';
    how.style.marginBottom = '8px';
    how.innerHTML =
      'Make a free project at <b>console.firebase.google.com</b>, add a ' +
      '<b>Realtime Database</b>, paste its URL below, and put the rules from the ' +
      'button at the bottom into its Rules tab. Then copy the room key onto your ' +
      'other device. Anyone who has both can read and write this board.';

    const urlWrap = document.createElement('div');
    urlWrap.style.padding = '4px 0 0';
    urlWrap.innerHTML = '<div class="tr-name">Database URL</div>' +
      '<div class="tr-desc" style="margin-bottom:6px">The one ending in firebaseio.com.</div>';
    const url = document.createElement('input');
    url.className = 'set-input';
    url.placeholder = 'https://your-project-default-rtdb.firebaseio.com';
    url.value = c.url || '';
    url.spellcheck = false;
    url.oninput = () => set('url', url.value.trim().replace(/\/+$/, ''));
    urlWrap.appendChild(url);

    const keyWrap = document.createElement('div');
    keyWrap.style.padding = '10px 0 0';
    keyWrap.innerHTML = '<div class="tr-name">Room key</div>' +
      '<div class="tr-desc" style="margin-bottom:6px">The same on every device that should share this board.</div>';
    const keyRow = document.createElement('div');
    keyRow.className = 'set-row';
    const key = document.createElement('input');
    key.className = 'set-input';
    key.placeholder = 'board-…';
    key.value = c.room || '';
    key.spellcheck = false;
    key.oninput = () => set('room', key.value.trim());
    keyRow.appendChild(key);
    keyRow.appendChild(mini('Copy', () => copyText(key.value.trim())));
    keyRow.appendChild(mini('New', () => {
      key.value = Sync.randomKey();
      set('room', key.value);
    }));
    keyWrap.appendChild(keyRow);

    const nameWrap = document.createElement('div');
    nameWrap.style.padding = '10px 0 0';
    nameWrap.innerHTML = '<div class="tr-name">This device is called</div>' +
      '<div class="tr-desc" style="margin-bottom:6px">Only so the line below can say where a change came from.</div>';
    const name = document.createElement('input');
    name.className = 'set-input';
    name.value = c.device || Sync.deviceName();
    name.oninput = () => set('device', name.value.trim());
    nameWrap.appendChild(name);

    /* ---- the master switch ---- */
    g.appendChild(toggle('Sync between devices',
      'The whole board, live, on everything signed in to the same room.',
      c.on === true,
      v => {
        /* local settings, so this must not mark the board unsent either */
        set('on', v);
        if (v && !Store.settings().sync.room) set('room', Sync.randomKey());
        key.value = Store.settings().sync.room || '';
        sub.classList.toggle('is-hidden', !v);
        if (v) Sync.connect(); else Sync.stop();
        paintState();
      }));

    sub.appendChild(how);
    sub.appendChild(urlWrap);
    sub.appendChild(keyWrap);
    sub.appendChild(nameWrap);

    /* ---- the passphrase ---- */
    /* Shown in place of a passphrase already set: the real one is never put
       back in the field, so there is nothing here to read off the screen. */
    const SET_ALREADY = String.fromCharCode(0x2022).repeat(12);   // 12 bullets
    const lockWrap = document.createElement('div');
    lockWrap.style.padding = '12px 0 0';
    lockWrap.innerHTML = '<div class="tr-name">Passphrase</div>' +
      '<div class="tr-desc" style="margin-bottom:6px">Leave this empty and the database holds your notes in plain text. Fill it in and the board is locked on this device before it is sent, so whoever runs the database stores bytes they cannot read. The same words on every device.</div>';
    const lock = document.createElement('input');
    lock.className = 'set-input';
    lock.type = 'password';
    lock.placeholder = 'none — sending in the clear';
    lock.value = Sync.hasPassphrase() ? SET_ALREADY : '';
    lock.spellcheck = false;

    lock.onfocus = () => { if (lock.value === SET_ALREADY) lock.value = ''; };
    /* Committed on every keystroke, like the URL and room key beside it.
       It used to wait for the field to lose focus, which on a phone often
       never happened: you type the words, tap Connect, and the tap goes on
       dismissing the keyboard. The passphrase was never set, so the board
       came back locked and nothing appeared to happen. */
    let lockTouched = false;
    lock.oninput = () => { lockTouched = true; Sync.setPassphrase(lock.value); };
    const lockSettled = () => {
      if (!lockTouched) return;
      lockTouched = false;
      const remembered = Sync.setPassphrase(lock.value);
      if (!lock.value) UI.toast('Unlocked — the board will be sent in plain text.');
      else if (!Sync.canLock()) UI.toast('This page has no encryption to lock with — nothing will be sent.');
      else if (!remembered) UI.toast('Locked for now, but this browser would not remember it.');
      else UI.toast('Locked. Put the same words on your other device.');
      renderSettings();
    };
    lock.onblur = lockSettled;
    lock.onchange = lockSettled;
    lockWrap.appendChild(lock);
    const lockWarn = document.createElement('p');
    lockWarn.className = 'hint';
    lockWarn.style.marginTop = '6px';
    lockWarn.textContent = !Sync.canLock()
      ? 'This page cannot lock anything: the browser only offers encryption over https, or on a file opened from disk. Serve the app properly and this will work.'
      : (Sync.hasPassphrase()
        ? 'Locked. Lose these words and the copy in the database cannot be read again — the board on this device is untouched, and setting a new passphrase writes over it.'
        : 'Not locked. Anyone who can read the database can read your notes.');
    lockWrap.appendChild(lockWarn);
    sub.appendChild(lockWrap);


    /* ---- one password instead of three fields ---- */
    sub.appendChild(toggle('Ask for one password when this opens',
      'Instead of a database, a room key and a passphrase, this asks for a single password ' +
      'and works the rest out from it. The same words always reach the same board, so a new ' +
      'device needs nothing but the password. It is then the only thing keeping the board ' +
      'private, so make it a long one.',
      c.gate === true,
      v => { set('gate', v); renderSettings(); }));

    if (c.gate === true) {

      sub.appendChild(toggle('Stop after two wrong passwords',
        'The password screen shuts after two wrong tries and wants the page reloaded. ' +
        'It is friction, not protection: anyone going at the database directly never ' +
        'sees this screen. The length of your password is what actually guards the board.',
        (c.tries || 0) > 0,
        v => set('tries', v ? 2 : 0)));
      /* ---- whether to be asked every time ---- */
      sub.appendChild(toggle('Remember the passphrase on this device',
        'On, so you type it once here and not again. Turn it off and it is asked for ' +
        'every time this opens — worth doing on anything that leaves the house, because ' +
        'a phone that remembers is a phone that whoever picks it up can read.',
        c.remember === true,
        v => {
          set('remember', v);
          /* switching it on has to write down what is already held, and
             switching it off has to rub it out straight away */
          Sync.setPassphrase(Sync.heldPassphrase());
          renderSettings();
        }));

      const forget = button('Forget the password on this device', () => {
        Themes.closeDrawer();
        setTimeout(() => Lock.relock(), 180);
      });
      forget.style.marginTop = '8px';
      sub.appendChild(forget);
    }

    /* ---- changing the passphrase ---- */
    const changeWrap = document.createElement('div');
    changeWrap.style.padding = '10px 0 0';
    const changeBtn = button('Change the passphrase', () => {
      if (changeWrap.querySelector('.set-input')) return;   // already open

      const box = document.createElement('input');
      box.className = 'set-input';
      box.type = 'password';
      box.spellcheck = false;
      box.placeholder = 'the new passphrase';
      box.style.marginTop = '8px';

      const meter = document.createElement('p');
      meter.className = 'hint';
      meter.style.margin = '6px 0 0';

      const step = document.createElement('p');
      step.className = 'hint';
      step.style.margin = '6px 0 0';

      const go = button('Move the board to it', () => {
        const want = box.value;
        /* Nothing is refused for being short. The line under the box has said
           its piece; standing between someone and their own board is not
           this code's job. */
        go.disabled = true;
        box.disabled = true;
        Sync.changePassphrase(want, t => { step.textContent = t; }).then(res => {
          if (res.ok) {
            UI.toast(res.movedFrom
              ? 'Changed. The board moved to a new room.'
              : 'Changed. The board is locked with the new passphrase.');
            step.textContent = res.movedFrom
              ? 'Done. Put the same words on your other devices — they are still on the old ' +
                'ones and will not be able to read this until you do.'
              : 'Done. Put the same words on your other devices.';
            box.value = '';
            renderSettings();
          } else {
            go.disabled = false;
            box.disabled = false;
            step.textContent = 'Nothing changed: ' + res.reason;
          }
        });
      });
      go.style.marginTop = '8px';

      box.oninput = () => {
        const j = Lock.judge(box.value);
        meter.textContent = box.value ? ['Too short — four unrelated words is the mark to hit.',
          'It will do, but a fourth unrelated word would multiply the work to guess it.',
          'Good — four words is past the reach of any realistic attack.',
          'Strong.'][j.score] : '';
      };

      changeWrap.appendChild(box);
      changeWrap.appendChild(meter);
      changeWrap.appendChild(go);
      changeWrap.appendChild(step);
      setTimeout(() => box.focus(), 40);
    });
    changeWrap.appendChild(changeBtn);
    const changeNote = document.createElement('p');
    changeNote.className = 'hint';
    changeNote.style.marginTop = '6px';
    changeNote.textContent = 'The board is republished under the new words and read back to ' +
      'check before the old ones are let go. If anything fails, nothing changes. Your other ' +
      'devices will each need the new passphrase.';
    changeWrap.appendChild(changeNote);
    sub.appendChild(changeWrap);
    sub.appendChild(toggle('Say so when it cannot go out',
      'A note in the corner while a change is stuck on this device, and again when it gets through. The line below says the same thing whether this is on or off.',
      c.warn !== false,
      v => { set('warn', v); if (!v) Sync.hideNote(); }));

    const connect = button('Connect and pull what is there', () => {
      Sync.connect();
      Sync.pull().then(paintState);
      paintState();
    });
    connect.style.marginTop = '12px';
    sub.appendChild(connect);
    sub.appendChild(button('Send this board now', () => { Sync.pushNow(); setTimeout(paintState, 400); }));
    sub.appendChild(button('What sync has done', () => { closeDrawer(); setTimeout(() => Sync.openLog(), 200); }));

    /* ---- what this device had before it joined a room ---- */
    const kept = Sync.aside();
    if (kept) {
      const keptWrap = document.createElement('div');
      keptWrap.className = 'sync-aside';
      keptWrap.style.padding = '10px 0 0';
      const plural = kept.notes === 1 ? 'note' : 'notes';
      keptWrap.innerHTML = '<div class="tr-name">Kept from before this device joined</div>' +
        '<div class="tr-desc" style="margin-bottom:6px">Joining took the board that was already in the room. ' +
        'This device had ' + kept.notes + ' ' + plural + ' of its own then (' +
        new Date(kept.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) +
        '). Bringing them back adds them to this board — and to your other devices — without removing anything.</div>';
      const back = button('Bring back those ' + kept.notes + ' ' + plural, () => {
        if (Sync.bringBack()) UI.toast('Brought back and merged in.');
        renderSettings();
      });
      const drop = button('Let them go', () => { Sync.throwAside(); renderSettings(); });
      drop.style.marginTop = '6px';
      keptWrap.appendChild(back);
      keptWrap.appendChild(drop);
      sub.appendChild(keptWrap);
    }
    sub.appendChild(button('Copy the rules to paste into Firebase', () => copyText(SYNC_RULES)));
    sub.appendChild(state);

    const warn = document.createElement('p');
    warn.className = 'hint';
    warn.style.marginTop = '8px';
    warn.textContent =
      'Editing the same board on two devices at the same moment will keep the ' +
      'later save and lose the other. Moving between devices, which is what this ' +
      'is for, is safe: a device that opens second pulls before it sends.';
    sub.appendChild(warn);

    g.appendChild(sub);
    paintState();
    return g;
  }

  function ntfyGroup(s) {
    const c = s.ntfy;
    const g = group('Phone');
    const set = (k, v) => Store.mutate(st => { st.settings.ntfy[k] = v; }, null, { silent: true });

    const sub = subRows(c.on === true);
    const prev = document.createElement('div');
    prev.className = 'noti-prev';
    const status = document.createElement('p');
    status.className = 'hint';
    status.style.marginTop = '9px';

    const clock = ms => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

    /* a real item if there is one, so the preview is in your own wording */
    function sample() {
      const cc = Store.settings().ntfy;
      const real = Ntfy.nextUp() || Ntfy.plan()[0];
      return {
        hour: real ? real.hour : 22,
        text: real ? real.text : 'Call parents at 11 pm',
        // always the main reminder: the preview is what the slider above is setting
        lead: cc.lead || 30,
        alert: 0
      };
    }
    function paintStatus() {
      const st = Ntfy.status();
      const next = Ntfy.nextUp();
      const bits = [next
        ? 'Next goes at ' + clock(next.fire) + ' — ' + (next.text || 'Untitled') + '.'
        : 'Nothing else due today.'];
      if (st.error) bits.push('Last try failed: ' + st.error + '.');
      else if (st.at) bits.push('Last sent at ' + clock(st.at) + '.');
      if (st.queued) bits.push(st.queued + ' handed to ntfy in advance.');
      status.textContent = bits.join(' ');
    }
    function paint() {
      const cc = Store.settings().ntfy;
      const p = sample();
      const head = Ntfy.headingFor(p, cc);
      prev.innerHTML =
        '<div class="np-app">ntfy &middot; ' + UI.esc(cc.topic || 'no topic yet') + '</div>' +
        (head ? '<div class="np-head">' + UI.esc(head) + '</div>' : '') +
        '<div class="np-body">' + UI.esc(Ntfy.messageFor(p, cc)) + '</div>';
      paintStatus();
    }

    /* ---- the topic word ---- */
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.style.marginBottom = '8px';
    hint.innerHTML = 'Install <b>ntfy</b> from the App Store or Play Store, press <b>+</b>, ' +
      'and subscribe to this word. Anyone who knows it can push to your phone, so leave it odd.';

    const row = document.createElement('div');
    row.className = 'set-row';
    const inp = document.createElement('input');
    inp.className = 'set-input';
    inp.value = c.topic || '';
    inp.placeholder = 'flowlist-...';
    inp.spellcheck = false;
    inp.oninput = () => { set('topic', inp.value.trim()); paint(); };
    row.appendChild(inp);
    row.appendChild(mini('Copy', () => copyText(inp.value.trim())));
    row.appendChild(mini('New', () => {
      inp.value = Ntfy.randomTopic();
      set('topic', inp.value);
      paint();
    }));

    /* ---- the master switch ---- */
    g.appendChild(toggle('Send to my phone',
      'Reminders for anything in Do Today that has an hour on it.',
      c.on === true,
      v => {
        Store.mutate(st => {
          st.settings.ntfy.on = v;
          // nothing can go anywhere without a topic, so make one
          if (v && !st.settings.ntfy.topic) st.settings.ntfy.topic = Ntfy.randomTopic();
        }, null, { silent: true });
        inp.value = Store.settings().ntfy.topic || '';
        sub.classList.toggle('is-hidden', !v);
        paint();
        if (v) Ntfy.start(); else Ntfy.stop();
      }));

    sub.appendChild(hint);
    sub.appendChild(row);
    sub.appendChild(prev);

    /* ---- when ---- */
    sub.appendChild(slider('How early it goes', c.lead || 30, 5, 180,
      v => { set('lead', v); paint(); }, 5, null, v => Ntfy.leadText(v) + ' before the hour'));

    const early = subRows(c.alert2 === true);
    early.appendChild(slider('How early that one is', c.lead2 || 50, 5, 240,
      v => { set('lead2', v); paint(); }, 5, null, v => Ntfy.leadText(v) + ' before the hour'));
    sub.appendChild(toggle('A second, earlier one',
      'One more notification further out — a heads-up before the reminder.',
      c.alert2 === true,
      v => { set('alert2', v); early.classList.toggle('is-hidden', !v); paint(); }));
    sub.appendChild(early);

    /* ---- how it reads ---- */
    sub.appendChild(segmented('How the time reads',
      'The bit at the front of every message.',
      [{ v: 'compact', label: '10pm' }, { v: 'spaced', label: '10 PM' },
       { v: 'clock', label: '10:00 PM' }, { v: '24', label: '22:00' }],
      c.timeFormat || 'compact', v => { set('timeFormat', v); paint(); }));

    sub.appendChild(segmented('Heading',
      'The bold line above it.',
      [{ v: 'left', label: 'Time left' }, { v: 'app', label: 'Flowlist' },
       { v: 'time', label: 'The hour' }, { v: 'none', label: 'None' }],
      c.heading || 'left', v => { set('heading', v); paint(); }));

    sub.appendChild(segmented('How loudly it lands',
      'Urgent gets through a phone on silent. Quiet arrives without a sound.',
      [{ v: 'low', label: 'Quiet' }, { v: 'normal', label: 'Normal' },
       { v: 'high', label: 'High' }, { v: 'urgent', label: 'Urgent' }],
      c.priority || 'normal', v => set('priority', v)));

    /* ---- what gets one ---- */
    sub.appendChild(toggle('Skip anything ticked off',
      'Nothing is sent for a task already marked done.',
      c.skipDone !== false, v => { set('skipDone', v); paint(); }));

    sub.appendChild(toggle('Send them ahead of time',
      'Hands each one to ntfy early so they still arrive with this app closed. Nothing can call one back, so a task changed or removed afterwards may still buzz.',
      c.ahead === true, v => { set('ahead', v); Ntfy.pass(); paint(); }));

    const srv = document.createElement('div');
    srv.style.padding = '9px 0';
    srv.innerHTML = '<div class="tr-name">Server</div>' +
      '<div class="tr-desc" style="margin-bottom:6px">Leave this alone unless you run your own ntfy.</div>';
    const srvInp = document.createElement('input');
    srvInp.className = 'set-input';
    srvInp.value = c.server || 'https://ntfy.sh';
    srvInp.spellcheck = false;
    srvInp.oninput = () => set('server', srvInp.value.trim() || 'https://ntfy.sh');
    srv.appendChild(srvInp);
    sub.appendChild(srv);

    /* with two devices running the same clock, only one should send */
    if (typeof Sync !== 'undefined' && Sync.isOn()) {
      const who = document.createElement('div');
      who.style.padding = '9px 0 2px';
      const mine = Ntfy.maySend();
      who.innerHTML = '<div class="tr-name">Sent from</div>' +
        '<div class="tr-desc" style="margin-bottom:6px">Every device with the app open runs the same clock, so one of them does the sending — otherwise your phone buzzes twice for one reminder.</div>' +
        '<div class="hint" style="margin-bottom:6px">' +
        (mine ? 'This device (<b>' + UI.esc(Sync.deviceName()) + '</b>).'
              : '<b>' + UI.esc(Ntfy.sender() || 'another device') + '</b>, not this one.') + '</div>';
      if (!mine) {
        who.appendChild(button('Send them from this device instead', () => {
          Ntfy.sendFromHere();
          renderSettings();
        }));
      }
      sub.appendChild(who);
    }

    sub.appendChild(button('Send one to my phone now', () => Ntfy.sendTest(paintStatus)));
    sub.appendChild(status);

    g.appendChild(sub);
    paint();
    return g;
  }

  /* ---------- little builders ---------- */
  function group(label) {
    const d = document.createElement('div');
    const slug = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    d.className = 'set-group';
    d.dataset.group = slug;
    d.dataset.label = label;
    d.innerHTML = '<div class="set-label">' + UI.icon(GROUP_ICONS[slug] || 'layers') + '<span>' + UI.esc(label) + '</span></div>';
    return d;
  }
  /** A nested block that appears and disappears with the row above it. */
  function subRows(visible) {
    const d = document.createElement('div');
    d.className = 'sub-rows' + (visible ? '' : ' is-hidden');
    return d;
  }

  function toggle(name, desc, value, onChange) {
    const row = document.createElement('div');
    row.className = 'toggle-row';
    row.innerHTML = '<div><div class="tr-name">' + UI.esc(name) + '</div><div class="tr-desc">' + UI.esc(desc) + '</div></div>';
    const b = document.createElement('button');
    b.className = 'switch' + (value ? ' on' : '');
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', value ? 'true' : 'false');
    let on = value;
    b.onclick = () => {
      on = !on;
      // flip the switch itself first so it animates, then act on it
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      onChange(on);
    };
    row.appendChild(b);
    return row;
  }
  /** @param {Function} [format] custom readout, e.g. ms => "2000 ms · 2.00 s" */
  function slider(name, value, min, max, onChange, step, unit, format) {
    const show = v => (format ? format(v) : v + (unit || ''));
    const wrap = document.createElement('div');
    wrap.dataset.slider = name;
    wrap.style.padding = '9px 0';
    wrap.innerHTML = '<div class="tr-name" style="margin-bottom:6px">' + UI.esc(name) + '</div>';
    const row = document.createElement('div');
    row.className = 'num-row';
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step || 1; inp.value = value;
    const out = document.createElement('span');
    out.className = 'num-val';
    out.style.width = format ? '112px' : (unit ? '46px' : '22px');
    if (format) out.style.fontSize = '11px';
    out.textContent = show(value);
    inp.oninput = () => { out.textContent = show(parseInt(inp.value, 10)); onChange(parseInt(inp.value, 10)); };
    row.appendChild(inp); row.appendChild(out);
    wrap.appendChild(row);
    return wrap;
  }
  /** Two or more mutually exclusive choices, as a pill row. */
  function segmented(name, desc, options, value, onChange) {
    const wrap = document.createElement('div');
    wrap.style.padding = '9px 0';
    wrap.innerHTML = '<div class="tr-name">' + UI.esc(name) + '</div>' +
      '<div class="tr-desc" style="margin-bottom:8px">' + UI.esc(desc) + '</div>';
    const row = document.createElement('div');
    row.className = 'segmented';
    options.forEach(o => {
      const b = document.createElement('button');
      b.className = 'seg' + (o.v === value ? ' on' : '');
      b.textContent = o.label;
      b.onclick = () => {
        // move the pill first so it responds even when nothing re-renders
        row.querySelectorAll('.seg').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        onChange(o.v);
      };
      row.appendChild(b);
    });
    wrap.appendChild(row);
    return wrap;
  }

  function button(label, onClick, danger) {
    const b = document.createElement('button');
    b.className = 'set-btn' + (danger ? ' danger' : '');
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }
  /* ============================================================
     INIT
     ============================================================ */
  function openDrawer() { drawer.classList.add('show'); scrim.classList.add('show'); renderSettings(); }
  function closeDrawer() {
    drawer.classList.remove('show'); scrim.classList.remove('show');
    /* the next time it opens, it opens on everything */
    if (searchBox && searchBox.value) { searchBox.value = ''; applySearch(); }
  }

  function init() {
    document.getElementById('btn-gear').onclick = openDrawer;
    document.getElementById('settings-close').onclick = closeDrawer;
    scrim.onclick = closeDrawer;
    if (searchBox) {
      searchBox.addEventListener('input', () => { applySearch(); drawerBody.scrollTop = 0; });
      /* Escape in the box empties it first; a second one closes Settings */
      searchBox.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        if (searchBox.value) { searchBox.value = ''; applySearch(); }
        /* the board's own Escape skips boxes being typed in, so this one
           has to close Settings itself - if Escape is switched on */
        else if (Keys.on('close')) { searchBox.blur(); closeDrawer(); }
      });
    }
    /* Not while the page is moving: once it comes to rest. On every scroll
       event - every frame of a scroll - spy() measuring the sections made
       the browser restyle and lay out the whole page first, 2-3 ms of a
       6 ms frame; and the section lighting up partway through made it
       repaint and sort out all of the page's layers again, mid-scroll.
       Traced with a real mouse wheel, those were the stutter in Settings
       that the lists did not have (tests/perf/longtasks.pl). So nothing
       on the page changes until the scroll stops - scrollend, or a moment
       after the last scroll event where the browser has no scrollend. */
    let spyTimer = 0;
    drawerBody.addEventListener('scroll', () => {
      clearTimeout(spyTimer);
      spyTimer = setTimeout(() => { spyTimer = 0; spy(); }, 120);
    }, { passive: true });
    drawerBody.addEventListener('scrollend', () => { clearTimeout(spyTimer); spyTimer = 0; spyHold = 0; spy(); });

    const s = Store.settings();
    document.documentElement.style.setProperty('--list-w', s.listWidth + 'px');
    document.documentElement.style.setProperty('--splash-phrase', (s.splashPhraseSize || 14) + 'px');
    applyThemeClasses();
    trackCursor();
    apply(s.theme);
  }

  /** The canvas zoom buttons and the drawer slider are the same number. */
  function syncCanvasScale() {
    if (!drawer.classList.contains('show')) return;
    const cv = Store.activeCanvas();
    if (!cv) return;
    const row = drawerBody.querySelector('[data-slider="Canvas scale"]');
    if (!row) return;
    const pct = Math.round(cv.zoom * 100);
    row.querySelector('input').value = pct;
    row.querySelector('.num-val').textContent = pct + '%';
  }

  return {
    init, apply, THEMES, startFall, buildScene, openDrawer, closeDrawer, renderSettings, syncCanvasScale,
    /* the animations the scene's clock is moving - they are paused as far
       as the browser is concerned, so anything counting what moves has to
       count these as well */
    sceneClock: () => [...clock.driven.keys()].filter(a => a.playState !== 'idle'),
    sceneClockTicking: () => !!clock.timer,
    /* true while you are scrolling, typing or dragging, and for a moment
       after: anything that would put something new on screen waits for a
       quiet moment rather than landing on top of what you are doing */
    busyNow: () => performance.now() < clock.busyUntil,
    setSceneHz,
    catStep: tickCat,
    catState: () => (cat ? { x: cat.x, facing: cat.facing, moving: cat.moving, el: cat.el } : null)
  };
})();
