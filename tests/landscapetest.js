/*
 * Landscapes: the password screen's pictures as themes, and the three new
 * pictures made to stand beside the valley.
 *
 * It also stands in for the scene tests that were lost with the old
 * scratch folder — the forty-layer ceiling and the transform-and-opacity
 * rule — and covers every scene, old and new, not just the new ones.
 *
 * And it pins something that nearly shipped: the new scenes were first
 * written with class names the older scenes already used. A later .lk-lamp
 * rule would have knocked every lantern in Lanterns out of place, and a
 * second @keyframes lk-shoot would have replaced the Constellation's
 * shooting star. Neither shows up in the new scenes — only in the old ones.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

var NEW = ['dunes'];
var LANDS = ['valley', 'dunes'];

/* every rule in every stylesheet, as text */
function allRules() {
  var out = [];
  Array.prototype.forEach.call(document.styleSheets, function (s) {
    try { Array.prototype.forEach.call(s.cssRules, function (r) { out.push(r); }); } catch (e) {}
  });
  return out;
}
function alpha(color) {
  var m = String(color).match(/rgba?\(([^)]+)\)/);
  if (!m) return 1;
  var p = m[1].split(',');
  return p.length === 4 ? parseFloat(p[3]) : 1;
}
/* put a scene on the page by itself, so it has real styles and animations */
function mount(key) {
  var host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:4000';
  var pic = Scenes.build(key);
  host.appendChild(pic);
  document.body.appendChild(host);
  return { host: host, pic: pic, gone: function () { host.remove(); } };
}
function animated(root) {
  return Array.prototype.filter.call(root.querySelectorAll('*'), function (e) {
    return getComputedStyle(e).animationName !== 'none';
  });
}

setTimeout(function () {
  var sp = document.getElementById('splash'); if (sp) sp.remove();
  document.body.classList.remove('booting'); document.body.classList.add('loaded');
  Store.reset();

  Promise.resolve().then(function () {

    /* ---------- 1. the scenes exist, and are offered ---------- */
    NEW.forEach(function (k) {
      ok(k + ' is a scene', Scenes.has(k));
      ok('...though the password screen offers the Valley alone',
         Scenes.LIST.length === 1 && Scenes.LIST[0].key === 'valley');
    });

    /* ---------- 2. every scene: under forty layers, moving only what the compositor can ---------- */
    Scenes.LIST.forEach(function (s) {
      var m = mount(s.key);
      var n = animated(m.pic).length;
      ok(s.name + ': ' + n + ' moving parts, under the ceiling of forty', n > 0 && n <= 40, n);
      m.gone();
    });

    var bad = [];
    var names = {};
    allRules().forEach(function (r) {
      if (!(r instanceof CSSKeyframesRule) || r.name.indexOf('lk-') !== 0) return;
      names[r.name] = (names[r.name] || 0) + 1;
      Array.prototype.forEach.call(r.cssRules, function (f) {
        for (var i = 0; i < f.style.length; i++) {
          var p = f.style[i];
          if (p !== 'opacity' && p !== 'transform' && p.indexOf('animation-timing') !== 0) bad.push(r.name + ':' + p);
        }
      });
    });
    eq('every scene animation moves only opacity and transform', bad.join(', '), '');
    var twice = Object.keys(names).filter(function (k) { return names[k] > 1; });
    eq('...and no two animations share a name', twice.join(', '), '');

    /* ---------- 4. no stripes between the layers ---------- */
    [['dunes', '.lk-d-dune']].forEach(function (pair) {
      var m = mount(pair[0]);
      var bands = m.pic.querySelectorAll(pair[1]);
      ok(pair[0] + ' has its layers', bands.length === 5, bands.length);
      var carried = Array.prototype.every.call(bands, function (b) {
        var after = getComputedStyle(b, '::after');
        return b.classList.contains('lk-x-ground') && parseFloat(after.height) > 0 &&
               after.backgroundColor === getComputedStyle(b).getPropertyValue('--ground').trim().replace(/^#(..)(..)(..)$/, function (_, r, g, bl) {
                 return 'rgb(' + parseInt(r, 16) + ', ' + parseInt(g, 16) + ', ' + parseInt(bl, 16) + ')';
               });
      });
      ok('...each carried on down in its own colour, so no sky shows between them', carried);

      /* and the geometry: the bottom of each layer, filled on down, reaches
         below the lowest point of the one in front */
      var gap = false;
      for (var i = 0; i + 1 < bands.length; i++) {
        var back = bands[i].getBoundingClientRect(), front = bands[i + 1].getBoundingClientRect();
        /* no ::after at all reads as 'auto', which must count as reaching nowhere */
        var backReach = back.bottom + (parseFloat(getComputedStyle(bands[i], '::after').height) || 0);
        if (backReach < front.bottom - 1) gap = true;
      }
      ok('...reaching past the foot of the layer in front', !gap);
      m.gone();
    });

    /* ---------- 5. the same picture every time ---------- */
    NEW.forEach(function (k) {
      var a = Scenes.build(k), b = Scenes.build(k);
      var paths = function (el) { return Array.prototype.map.call(el.querySelectorAll('path'), function (p) { return p.getAttribute('d'); }).join('|'); };
      ok(k + ' draws the same land every time it is built', paths(a).length > 100 && paths(a) === paths(b));
    });

    /* ---------- 7. the themes ---------- */
    LANDS.forEach(function (k) {
      var t = Themes.THEMES.filter(function (x) { return x.key === k; })[0];
      ok(k + ' is a theme', !!t && t.landscape === true && t.scene === k);
    });

    Store.mutate(function (s) { s.settings.scene = true; s.settings.sceneStill = false; s.settings.polish = {}; }, null, { silent: true });
    Themes.apply('valley');
    return wait(60);

  }).then(function () {
    var fx = document.getElementById('fx-scene');
    ok('The Valley puts the valley behind the board', !!fx.querySelector('.lk-scene.lk-valley'));
    ok('...marked as a backdrop', !!fx.querySelector('.lk-scene.as-backdrop'));
    ok('...and the page knows it is a landscape', document.body.classList.contains('landscape'));
    eq('...behind the board, not over it',
       parseInt(getComputedStyle(fx).zIndex, 10) < parseInt(getComputedStyle(document.getElementById('main')).zIndex, 10), true);

    /* the glass */
    Store.get().lists.forEach(function (l) { if (!Store.isOpen(l.id)) Store.openList(l.id); });
    var col = document.querySelector('#board .list');
    ok('a column is glass, so the picture shows through', col && alpha(getComputedStyle(col).backgroundColor) < 0.8,
       col && getComputedStyle(col).backgroundColor);
    var note = document.querySelector('#board .note');
    ok('...a note on it is nearly solid, so it reads', note && alpha(getComputedStyle(note).backgroundColor) >= 0.8,
       note && getComputedStyle(note).backgroundColor);

    /* Polish off: solid */
    Store.mutate(function (s) { s.settings.polish.valley = false; }, null, { silent: true });
    Themes.apply('valley');
    return wait(40);

  }).then(function () {
    var col = document.querySelector('#board .list');
    eq('with Polish off, the columns are solid', alpha(getComputedStyle(col).backgroundColor), 1);
    Store.mutate(function (s) { s.settings.polish = {}; }, null, { silent: true });

    /* each of the other three builds its own */
    NEW.forEach(function (k) {
      Themes.apply(k);
      ok(k + ' as a theme puts its own picture up', !!document.querySelector('#fx-scene .lk-scene.lk-' + k));
      eq('...and only that one', document.querySelectorAll('#fx-scene .lk-scene').length, 1);
    });

    /* and leaving for an ordinary theme takes it all away */
    Themes.apply('midnight');
    ok('an ordinary theme takes the picture down', !document.querySelector('#fx-scene .lk-scene'));
    ok('...and the page is no longer a landscape', !document.body.classList.contains('landscape'));

    /* ---------- 8. on a phone, the sheets stay solid ---------- */
    Themes.apply('dunes');
    Store.mutate(function (st) { st.settings.layout = 'phone'; }, null, { silent: true });
    Mobile.apply();
    var dock = document.getElementById('panel-today');
    if (!dock.classList.contains('open')) document.getElementById('btn-panel-today').click();
    return wait(80);

  }).then(function () {
    var dock = document.getElementById('panel-today');
    ok('on a phone Do Today is up as a sheet', dock.classList.contains('open'));
    eq('...and it is solid, so the notes underneath do not show through', alpha(getComputedStyle(dock).backgroundColor), 1);
    var col = document.querySelector('#board .list');
    ok('...while a column on its own over the picture is still glass', col && alpha(getComputedStyle(col).backgroundColor) < 0.8);
    Store.mutate(function (st) { st.settings.layout = 'desktop'; }, null, { silent: true });
    Mobile.apply();

    /* ---------- 9. held still ---------- */
    Themes.apply('dunes');
    Store.mutate(function (s) { s.settings.sceneStill = true; }, null, { silent: true });
    Themes.buildScene();
    return wait(40);

  }).then(function () {
    var fx = document.getElementById('fx-scene');
    ok('held still, nothing in the picture moves', animated(fx).length === 0, animated(fx).length);
    var skies = fx.querySelectorAll('.lk-sky-l');
    eq('...it rests on the first sky', getComputedStyle(skies[0]).opacity, '1');
    eq('...with the other two put away',
       [getComputedStyle(skies[1]).opacity, getComputedStyle(skies[2]).opacity].join(','), '0,0');
    eq('...and the moon and stars not out at dusk',
       Array.prototype.filter.call(fx.querySelectorAll('.lk-x-night'), function (e) { return getComputedStyle(e).opacity !== '0'; }).length, 0);
    ok('...but the sun still is', getComputedStyle(fx.querySelector('.lk-d-sun')).opacity === '1');
    Store.mutate(function (s) { s.settings.sceneStill = false; }, null, { silent: true });

    /* ---------- 10. Settings ---------- */
    Themes.renderSettings();
    var body = document.getElementById('settings-body');
    var names = Array.prototype.map.call(body.querySelectorAll('.theme-card'), function (c) { return c.textContent.trim(); }).join(' | ');
    ['The Valley', 'Dunes'].forEach(function (n) {
      ok('Settings offers ' + n, names.indexOf(n) !== -1, names);
    });
    var text = body.textContent;
    ok('...the scenery row describes the dunes', /Sand catching the last of a huge low sun/.test(text));
    ok('...and Polish says what it does to a landscape', /dark glass and the picture shows through/.test(text));

    Store.mutate(function (s) { s.settings.sync.gate = false; s.settings.sync.on = false; }, null, { silent: true });

  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'LANDSCAPE ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'results';
    pre.textContent = '\n' + OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
