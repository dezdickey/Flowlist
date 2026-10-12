/*
 * Smooth on a fast screen: scrolling, and the scene behind it.
 *
 * Found on a 165 Hz laptop, where the board scrolled at about 40 frames a
 * second and a typed letter took a while to show:
 *
 *  - a column is glass over the scene, and Chrome will not slide a scroller
 *    that has nothing solid behind its words - it repainted the column on
 *    every frame of a scroll. Each column, the board and the panels now have
 *    a layer of their own, so a scroll slides them.
 *  - the board listened to the wheel in a way that could cancel it, which
 *    makes the browser hold every scroll over every column until the page
 *    has answered. It now only listens.
 *  - the fog was softened with a blur filter, which is worked out again on
 *    every frame for something that moves. It is drawn soft instead.
 *  - the scene moved on every frame the screen showed, and each time the
 *    whole window was redrawn. It now keeps its own clock, 30 times a
 *    second, all its pieces together.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 60); }); };

var scene = function () { return document.getElementById('fx-scene'); };
function looseLoops() {
  /* looping animations in the scene that the browser is still running on every frame */
  return scene().getAnimations({ subtree: true }).filter(function (a) {
    var fx = a.effect, el = fx && fx.target;
    return a.playState === 'running' && fx && !fx.pseudoElement && fx.getTiming().iterations === Infinity &&
           !(el instanceof SVGElement && !(el instanceof SVGSVGElement));
  });
}
function setting(k, v) { Store.mutate(function (s) { s.settings[k] = v; }, null, { silent: true }); }
function wheel(target, opts) {
  var e = new WheelEvent('wheel', Object.assign({ deltaY: 120, bubbles: true, cancelable: true }, opts || {}));
  target.dispatchEvent(e);
  return e;
}
function board() {
  var st = JSON.parse(Store.exportState());
  var mk = function (id, text) { return { id: id, text: text, detail: '', expanded: false, done: false, hour: null }; };
  st.lists = [];
  st.board = [];
  for (var i = 0; i < 7; i++) {
    var items = [];
    for (var j = 0; j < 30; j++) items.push(mk('N' + i + '_' + j, 'Note ' + j));
    st.lists.push({ id: 'L' + i, name: 'List ' + i, color: '#5cc8ff', collapsed: false, items: items });
    st.board.push('L' + i);
  }
  st.closedOrder = []; st.today = [];
  st.settings.layout = 'desktop';
  st.settings.maxOpen = 10;
  st.settings.theme = 'valley';
  st.settings.scene = true;
  st.settings.sceneStill = false;
  st.settings.panels.board = { lists: true, presets: false, canvas: false, today: true };
  return st;
}

setTimeout(function () {
  (async function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    Store.importJSON(JSON.stringify(board()));
    Mobile.apply();
    Themes.apply('valley');
    await wait(400);

    /* ================================================================ SCROLLING */
    var body = document.querySelector('#board .list-body');
    var boardEl = document.getElementById('board');
    ok('each column slides on a layer of its own', getComputedStyle(body).willChange === 'transform',
       getComputedStyle(body).willChange);
    ok('...and so does the board, going sideways', getComputedStyle(boardEl).willChange === 'transform');
    ok('...and Do Today', getComputedStyle(document.querySelector('.today-body')).willChange === 'transform');
    ok('...and the Categories panel', getComputedStyle(document.querySelector('#panel-lists .panel-body')).willChange === 'transform');

    var e1 = wheel(body.querySelector('.note') || body);
    ok('a wheel over a column is left to the browser', !e1.defaultPrevented);
    var e2 = wheel(body, { shiftKey: true });
    ok('...shift and all: nothing the board does can hold a column\'s scroll up', !e2.defaultPrevented);
    ok('(the board is wider than the window, to slide)', boardEl.scrollWidth > boardEl.clientWidth + 100,
       boardEl.scrollWidth + ' vs ' + boardEl.clientWidth);
    boardEl.scrollLeft = 0;
    var e3 = wheel(boardEl);
    ok('the wheel over the board between columns still slides it sideways', boardEl.scrollLeft > 0, boardEl.scrollLeft);
    ok('...without cancelling anything', !e3.defaultPrevented);
    boardEl.scrollLeft = 0;
    var head = document.querySelector('#board .list-head') || document.querySelector('#board .list-title');
    wheel(head);
    ok('...and over a column\'s heading', boardEl.scrollLeft > 0, boardEl.scrollLeft);
    boardEl.scrollLeft = 0;
    var grab = document.getElementById('grabline') || document.querySelector('.grabline');
    if (grab) {
      var e4 = wheel(grab);
      ok('the wheel over the bar under the board slides it too', boardEl.scrollLeft > 0, boardEl.scrollLeft);
      boardEl.scrollLeft = 0;
    }

    /* the top bar's live widgets: painted every second, rebuilt only when what they show changes */
    var clockW = [].filter.call(document.querySelectorAll('#widgetbar .widget .w-inner'), function (w) { return w.querySelector('.w-big') && /\d:\d\d/.test(w.textContent); })[0];
    ok('(a clock on the top bar to watch)', !!clockW);
    if (clockW) {
      var firstNode = clockW.firstChild, text = clockW.textContent;
      await wait(2200);
      ok('the clock does not rebuild itself every second while the minute stays the same - each rebuild relaid the page mid-scroll',
         clockW.textContent !== text || clockW.firstChild === firstNode);
    }

    /* ================================================================ THE FOG */
    var fogs = scene().querySelectorAll('.lk-fog');
    ok('the Valley has its fog', fogs.length >= 3, fogs.length);
    ok('...with no blur filter on it to work out every frame', [].every.call(fogs, function (f) {
      return getComputedStyle(f).filter === 'none';
    }), getComputedStyle(fogs[0]).filter);
    ok('...drawn soft instead, reaching past its band', [].every.call(fogs, function (f) {
      var b = getComputedStyle(f, '::before');
      return /linear-gradient/.test(b.backgroundImage) && parseFloat(b.top) < 0 && parseFloat(b.bottom) < 0;
    }));
    ok('...and it still drifts', [].some.call(fogs, function (f) { return f.getAnimations().length > 0; }));

    /* ================================================================ THE CLOCK */
    var clocked = Themes.sceneClock();
    ok('the scene keeps its own time', clocked.length > 5 && Themes.sceneClockTicking(), clocked.length);
    eq('...leaving nothing that loops for the browser to move every frame', looseLoops().map(function (a) { return a.animationName; }), []);
    ok('...only things that loop: anything that plays once plays out by itself',
       clocked.every(function (a) { return a.effect.getTiming().iterations === Infinity; }));
    ok('...all of it in the scene', clocked.every(function (a) { return scene().contains(a.effect.target); }));
    var noLayer = clocked.filter(function (a) {
      var wc = a.effect.target.style.willChange || '';
      var props = {};
      a.effect.getKeyframes().forEach(function (k) { Object.keys(k).forEach(function (p) { props[p] = 1; }); });
      return (props.transform && wc.indexOf('transform') === -1) || (props.opacity && wc.indexOf('opacity') === -1);
    });
    eq('each moving piece keeps a layer of its own, so setting it paints nothing', noLayer.length, 0);

    await wait(600);                 // past the hold that the scrolling above set off
    var before = clocked.map(function (a) { return a.currentTime; });
    await wait(600);
    var moved = clocked.map(function (a, i) { return a.currentTime - before[i]; });
    ok('its pieces move on', moved.every(function (d) { return d > 500 && d < 700; }), moved.slice(0, 5).join(', '));
    ok('...all together, by the same amount', Math.max.apply(null, moved) - Math.min.apply(null, moved) < 1,
       Math.min.apply(null, moved) + '..' + Math.max.apply(null, moved));

    var one = clocked[0], seen = {}, t0 = performance.now();
    while (performance.now() - t0 < 500) { seen[one.currentTime] = 1; await wait(4); }
    var steps = Object.keys(seen).length;
    ok('...about 30 times a second, not every frame', steps >= 12 && steps <= 18, steps + ' in half a second');

    /* a piece that turns up later is taken on too */
    var late = document.createElement('div');
    late.style.cssText = 'position:absolute;left:0;top:0;width:10px;height:10px;animation:lk-fogdrift 9s linear infinite';
    scene().appendChild(late);
    await wait(1300);
    ok('a piece added later joins the clock within a second or so', Themes.sceneClock().some(function (a) { return a.effect.target === late; }));
    late.remove();
    await wait(100);
    ok('...and leaves it when it goes', !Themes.sceneClock().some(function (a) { return a.effect.target === late; }));

    /* it never restyles the page once for every piece: reading a piece's
       state makes the browser restyle, so the ticks only ever set */
    var CA = window.CSSAnimation && Object.getOwnPropertyDescriptor(CSSAnimation.prototype, 'playState') ? CSSAnimation.prototype : Animation.prototype;
    var real = Object.getOwnPropertyDescriptor(CA, 'playState');
    var reads = 0;
    Object.defineProperty(CA, 'playState', { configurable: true, get: function () { reads++; return real.get.call(this); } });
    await wait(500);
    Object.defineProperty(CA, 'playState', real);
    var pieces = Themes.sceneClock().length;
    ok('the ticks do not read each piece (a restyle apiece): at most one look round in half a second',
       reads <= pieces + 5, reads + ' reads for ' + pieces + ' pieces');

    /* held while you are busy, and carrying on after without jumping ahead */
    var sample = function () { return Themes.sceneClock()[0].currentTime; };
    var col = document.querySelector('#board .list-body');
    var t1 = sample();
    /* scroll events only - really moving it would add the browser's own, which land late on the test clock */
    for (var k = 0; k < 8; k++) { col.dispatchEvent(new Event('scroll')); await wait(50); }
    eq('while you scroll, the scene holds still', sample(), t1);
    await wait(900);
    var on = sample() - t1;
    ok('...and a moment after, carries on from where it stood - not jumping ahead',
       on > 350 && on < 700, Math.round(on) + ' ms on, over 400 ms held and 900 ms waited');

    await wait(500);
    t1 = sample();
    for (k = 0; k < 6; k++) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); await wait(60); }
    eq('while you type, it holds too', sample(), t1);

    await wait(500);
    Themes.openDrawer();
    t1 = sample();
    await wait(500);
    eq('with Settings open over it, it holds', sample(), t1);
    Themes.closeDrawer();
    await wait(1000);                  /* shutting it can end with a scroll, which holds the scene a moment longer */
    ok('...and moves again once Settings is shut', sample() - t1 > 350, Math.round(sample() - t1));

    /* the stars: over the sky only, in three twinkling layers */
    var vs = scene().querySelector('.lk-vstars');
    ok('the stars are laid over the sky only, not the land and sea', vs && vs.style.bottom === '38%', vs && vs.style.bottom);
    eq('...in three twinkling layers, not six', scene().querySelectorAll('.lk-vstars .lk-twinkler').length, 3);

    /* held still: no clock at all */
    setting('sceneStill', true);
    Themes.buildScene();
    await wait(100);
    eq('held still, the clock stops', Themes.sceneClock().length, 0);
    ok('...not ticking over with nothing to move, waking the page for nothing', !Themes.sceneClockTicking());
    eq('...and nothing in the scene moves', scene().getAnimations({ subtree: true }).filter(function (a) { return a.playState === 'running'; }).length, 0);
    setting('sceneStill', false);
    Themes.buildScene();
    await wait(100);
    ok('let go again, it starts again', Themes.sceneClock().length > 5);

    /* a new theme, a new scene, a new set of pieces */
    var valleyPieces = Themes.sceneClock();
    Themes.apply('dunes');
    await wait(200);
    var dunes = Themes.sceneClock();
    ok('a new theme\'s scene is on the clock', dunes.length > 3, dunes.length);
    ok('...and the last one\'s pieces are not', !dunes.some(function (a) { return valleyPieces.indexOf(a) !== -1; }));
    eq('...nor left loose', looseLoops().length, 0);
    ok('the dunes\' haze has no blur filter either', [].every.call(scene().querySelectorAll('.lk-d-haze'), function (f) {
      return getComputedStyle(f).filter === 'none';
    }));
    /* the dunes are the last landscape here; the Valley was checked above */

    /* the scene turned off altogether */
    setting('scene', false);
    Themes.buildScene();
    await wait(100);
    eq('with the scenery off there is nothing to keep time for', Themes.sceneClock().length, 0);
    ok('...and no clock ticking', !Themes.sceneClockTicking());
    setting('scene', true);

    /* for measuring: handing it back to the browser, and taking it again */
    Themes.apply('valley');
    await wait(200);
    Themes.setSceneHz(0);
    ok('handed back, the browser moves it again', Themes.sceneClock().length === 0 && looseLoops().length > 5, looseLoops().length);
    Themes.buildScene();
    await wait(100);
    eq('...and a rebuild leaves it with the browser while that is asked for', Themes.sceneClock().length, 0);
    Themes.setSceneHz(30);
    await wait(100);
    ok('taken back, it is on the clock again', Themes.sceneClock().length > 5 && looseLoops().length === 0);
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'CLOCK ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'clockresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
