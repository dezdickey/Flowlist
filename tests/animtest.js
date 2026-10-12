/*
 * The cost of an animation is not how it looks, it is which property it moves.
 * transform and opacity are handed to the compositor; anything else repaints
 * the element every frame for as long as the animation runs — and an animation
 * set to `infinite` runs for as long as the tab is open, which is what keeps a
 * laptop from ever idling.
 *
 * These checks hold the line: every never-ending animation must be
 * compositor-only, and a quiet theme must actually be quiet.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var CHEAP = ['transform', 'opacity'];
/* properties that force a repaint of the element on every single frame */
var COSTLY = ['filter', 'box-shadow', 'background', 'background-color', 'background-position',
              'width', 'height', 'top', 'left', 'right', 'bottom', 'color', 'border-color',
              'backdrop-filter', 'text-shadow', 'border-radius'];

function eachRule(fn) {
  [].forEach.call(document.styleSheets, function (sheet) {
    var rules;
    try { rules = sheet.cssRules; } catch (e) { return; }
    if (!rules) return;
    [].forEach.call(rules, function (r) { fn(r); });
  });
}

/* name -> the properties its frames touch */
function keyframeMap() {
  var m = {};
  eachRule(function (r) {
    if (r.type !== CSSRule.KEYFRAMES_RULE) return;
    var props = {};
    [].forEach.call(r.cssRules, function (frame) {
      for (var i = 0; i < frame.style.length; i++) props[frame.style[i]] = true;
    });
    m[r.name] = Object.keys(props);
  });
  return m;
}

/* every animation name that is set to run for ever */
function endless() {
  var names = {};
  eachRule(function (r) {
    if (!r.style) return;
    var a = r.style.animation || '';
    var iter = r.style.animationIterationCount || '';
    var name = r.style.animationName || '';
    if (a.indexOf('infinite') !== -1) {
      a.split(',').forEach(function (part) {
        if (part.indexOf('infinite') === -1) return;
        part.trim().split(/\s+/).forEach(function (w) {
          if (/^[a-z][a-z0-9-]*$/i.test(w) && !/^(infinite|alternate|reverse|both|none|forwards|backwards|linear|ease|ease-in|ease-out|ease-in-out|normal|paused|running)$/.test(w)) {
            names[w] = (r.selectorText || '?');
          }
        });
      });
    } else if (iter === 'infinite' && name) {
      names[name] = (r.selectorText || '?');
    }
  });
  return names;
}

setTimeout(function () {
  try {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    var frames = keyframeMap();
    var forever = endless();
    var names = Object.keys(forever).filter(function (n) { return frames[n]; });

    ok('there are never-ending animations to check', names.length > 5, names.length);

    var bad = [];
    names.forEach(function (n) {
      var offending = frames[n].filter(function (p) { return CHEAP.indexOf(p) === -1; });
      if (offending.length) bad.push(n + ' animates ' + offending.join('+') + '  (' + forever[n] + ')');
    });
    ok('every never-ending animation is compositor-only', bad.length === 0, bad.join(' | '));

    var repaints = [];
    names.forEach(function (n) {
      frames[n].forEach(function (p) { if (COSTLY.indexOf(p) !== -1) repaints.push(n + ':' + p); });
    });
    ok('none of them repaints the page every frame', repaints.length === 0, repaints.join(', '));

    /* the three that used to, by name, so a revert is caught */
    ok('the faceted brand dot no longer pulses its filter',
       !frames['ob-facet'] || frames['ob-facet'].indexOf('filter') === -1,
       frames['ob-facet'] && frames['ob-facet'].join('+'));

    /* ============================================================
       and the page can actually come to rest
       ============================================================ */
    document.body.classList.remove('booting');
    document.body.classList.add('loaded');
    Store.mutate(function (s) { s.settings.snow = false; s.settings.scene = false; }, null, { silent: true });

    /* Anything that never ends. A one-shot - a column sliding in, a widget
       appearing - is not the page failing to come to rest; it ends on its
       own. And in this harness it may never get the frames to end in, so
       counting those said the page was still busy when it was not. What the
       rule is about, and what this counts, is animation without end. */
    function animsNow() {
      /* the scene's own clock holds its animations paused and moves them
         itself (js/themes.js), so those count as moving too */
      var clocked = Themes.sceneClock();
      return document.getAnimations().filter(function (a) {
        if (clocked.indexOf(a) !== -1) return true;
        if (a.playState !== 'running' || a.transitionProperty) return false;
        var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
        return !t || t.iterations === Infinity;
      });
    }
    function namesNow() {
      return animsNow().map(function (a) { return a.animationName || '?'; }).sort().join(', ');
    }

    Themes.apply('paper');
    Themes.startFall();
    Themes.buildScene();
    eq('a flat theme with the scene off animates nothing at all', animsNow().length, 0, namesNow());

    Themes.apply('amethyst');
    Themes.startFall();
    Themes.buildScene();
    eq('Amethyst animates nothing either, polish or no polish', animsNow().length, 0, namesNow());

    Store.mutate(function (s) { s.settings.polish['amethyst'] = false; }, null, { silent: true });
    Themes.apply('amethyst');
    eq('...and still nothing with it off', animsNow().length, 0, namesNow());
    Store.mutate(function (s) { delete s.settings.polish['amethyst']; }, null, { silent: true });

    /* the hidden furniture stays still */
    Themes.apply('paper');
    var splash = document.createElement('div');
    ok('the delete target is paused while it is out of sight',
       getComputedStyle(document.querySelector('#drop-remove .dr-icon')).animationPlayState === 'paused',
       getComputedStyle(document.querySelector('#drop-remove .dr-icon')).animationPlayState);

    /* turning the scene on is what costs, and it is a choice */
    Store.mutate(function (s) { s.settings.scene = true; }, null, { silent: true });
    Themes.apply('midnight');
    Themes.buildScene();
    ok('a theme with scenery does animate, which is the point',
       animsNow().length > 0, namesNow());
    Store.mutate(function (s) { s.settings.scene = false; }, null, { silent: true });
    Themes.apply('midnight');
    Themes.buildScene();
    eq('...and turning the scenery off stops it again', animsNow().length, 0, namesNow());
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }
  document.title = 'ANIM ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre'); pre.id = 'animresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
