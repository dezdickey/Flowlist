var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var VP = document.getElementById('canvas-viewport');
var cv = function () { return Store.activeCanvas(); };
var ring = function () { return document.getElementById('sweep-ring'); };
var tools = function () { return [].slice.call(document.querySelectorAll('#ctool-tools .ctool')); };

/* world → screen, so a test can aim at something it drew */
function screenOf(wx, wy) {
  var r = VP.getBoundingClientRect(), c = cv();
  return { x: r.left + c.pan.x + wx * c.zoom, y: r.top + c.pan.y + wy * c.zoom };
}
function ev(type, p, button) {
  return new PointerEvent(type, {
    clientX: p.x, clientY: p.y, button: button || 0, buttons: type === 'pointerup' ? 0 : 1,
    bubbles: true, cancelable: true, pointerId: 1
  });
}
/** Drag the brush through a run of world points. */
function sweep(points) {
  var pts = points.map(function (w) { return screenOf(w[0], w[1]); });
  VP.dispatchEvent(ev('pointerdown', pts[0]));
  for (var i = 1; i < pts.length; i++) VP.dispatchEvent(ev('pointermove', pts[i]));
  VP.dispatchEvent(ev('pointerup', pts[pts.length - 1]));
}
function pickTool(key) {
  var i = { select: 0, pen: 1, arrow: 2, erase: 3, sweep: 4 }[key];
  tools()[i].click();
}
/** A horizontal line at y, from x1 to x2, as one swipe of the pen. */
function line(y, x1, x2, color) {
  var pts = [];
  for (var x = x1; x <= x2; x += 10) pts.push(x, y);
  return Store.addStroke({ color: color || '#5cc8ff', width: 6, pts: pts });
}
var strokeIds = function () { return cv().strokes.map(function (s) { return s.id; }); };
var has = function (id) { return strokeIds().indexOf(id) !== -1; };

setTimeout(function () {
  try {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    var noAnim = document.createElement('style');
    noAnim.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
    document.head.appendChild(noAnim);
    Store.reset();
    Store.setView('canvas');
    Store.mutate(function (s) {
      s.settings.panels.canvas.lists = false;
      s.settings.panels.canvas.canvas = false;
    }, ['panels']);
    Store.clearCanvas();
    Canvas.setZoom(1);
    Store.canvasEdit(function (c) { c.pan.x = 0; c.pan.y = 0; }, { silent: true });
    Canvas.render();

    /* ============================================================
       the tool
       ============================================================ */
    eq('there are five tools now', tools().length, 5);
    eq('...the new one last', tools()[4].title, 'Rub out');
    eq('...the old eraser still before it', tools()[3].title, 'Erase');
    ok('...with an icon of its own', tools()[4].innerHTML.indexOf('svg') !== -1);
    ok('there is a brush ring, out of sight until it is needed',
       !!ring() && getComputedStyle(ring()).display === 'none');

    pickTool('sweep');
    eq('picking it tells the canvas', VP.dataset.tool, 'sweep');
    ok('...and marks the button', tools()[4].classList.contains('on'));
    eq('...the pointer becomes the brush', getComputedStyle(VP).cursor, 'none');

    /* ============================================================
       one swipe at a time — the house
       ============================================================ */
    Store.clearCanvas();
    var walls = [];
    for (var i = 0; i < 6; i++) walls.push(line(80 + i * 60, 100, 400));   // six separate swipes
    Canvas.render();
    eq('six swipes on the canvas', cv().strokes.length, 6);

    /* drag along the third one only */
    sweep([[100, 200], [250, 200], [400, 200]]);
    eq('dragging along one swipe takes that one', cv().strokes.length, 5);
    ok('...the one that was touched', !has(walls[2].id));
    ok('...and the one above is still there', has(walls[1].id));
    ok('...and the one below', has(walls[3].id));

    /* a drag straight down the middle crosses all of the rest */
    sweep([[250, 60], [250, 140], [250, 220], [250, 300], [250, 380], [250, 440]]);
    eq('a drag across the lot takes each one it crosses', cv().strokes.length, 0);

    /* ============================================================
       a click that touches nothing changes nothing
       ============================================================ */
    Store.clearCanvas();
    var a = line(100, 100, 400);
    var b = line(300, 100, 400);
    Canvas.render();
    sweep([[100, 200], [400, 200]]);
    eq('a drag through empty space leaves everything', cv().strokes.length, 2);
    ok('...both of them', has(a.id) && has(b.id));

    /* it goes as soon as the brush touches it, before the button is up */
    var pts = [screenOf(100, 100), screenOf(400, 100)];
    VP.dispatchEvent(ev('pointerdown', pts[0]));
    VP.dispatchEvent(ev('pointermove', pts[1]));
    eq('the mark leaves the screen the moment it is touched',
       document.querySelectorAll('#csvg-strokes .cstroke').length, 1);
    eq('...though the canvas is not written to until the button comes up', cv().strokes.length, 2);
    VP.dispatchEvent(ev('pointerup', pts[1]));
    eq('...and then it is', cv().strokes.length, 1);
    ok('the right one went', !has(a.id) && has(b.id));

    /* ============================================================
       arrows and cards go the same way
       ============================================================ */
    Store.clearCanvas();
    Store.addEdge({ x: 100, y: 100 }, { x: 400, y: 100 }, '#5cc8ff', 4);
    var keep = Store.addEdge({ x: 100, y: 400 }, { x: 400, y: 400 }, '#5cc8ff', 4);
    Canvas.render();
    sweep([[100, 100], [250, 100], [400, 100]]);
    eq('an arrow can be rubbed out', cv().edges.length, 1);
    eq('...and the far one is untouched', cv().edges[0].id, keep.id);

    Store.clearCanvas();
    var card = Store.addNode({ kind: 'note', x: 120, y: 120, w: 210, h: 120, text: 'rub me out' });
    var safe = Store.addNode({ kind: 'note', x: 120, y: 400, w: 210, h: 120, text: 'leave me' });
    Canvas.render();
    sweep([[130, 160], [200, 170], [300, 180]]);
    eq('a card goes too', cv().nodes.length, 1);
    eq('...the one under the brush', cv().nodes[0].id, safe.id);
    ok('...and it says the note itself is safe',
       document.getElementById('toast').textContent.indexOf('untouched') !== -1,
       document.getElementById('toast').textContent);

    /* a card that referenced a real note leaves the note alone */
    Store.clearCanvas();
    var list = Store.get().lists[1];
    var item = list.items[0];
    Store.addNode({ kind: 'ref', listId: list.id, itemId: item.id, x: 120, y: 120, w: 190, h: 84 });
    Canvas.render();
    sweep([[130, 150], [250, 160]]);
    eq('the card is off the canvas', cv().nodes.length, 0);
    ok('...but the note is still in its category',
       Store.itemById(list.id, item.id) !== null);

    /* an arrow hanging off a card that goes, goes with it */
    Store.clearCanvas();
    var n1 = Store.addNode({ kind: 'note', x: 100, y: 100, w: 200, h: 110, text: 'one' });
    var n2 = Store.addNode({ kind: 'note', x: 100, y: 420, w: 200, h: 110, text: 'two' });
    Store.addEdge({ node: n1.id }, { node: n2.id }, '#5cc8ff', 3);
    Canvas.render();
    eq('a card at each end of an arrow', cv().edges.length, 1);
    sweep([[120, 130], [260, 140]]);
    eq('the card is gone', cv().nodes.length, 1);
    eq('...and the arrow that held it with it', cv().edges.length, 0);

    /* ============================================================
       the other tools are unchanged
       ============================================================ */
    Store.clearCanvas();
    var c1 = line(100, 100, 400);
    line(200, 100, 400);
    Canvas.render();
    pickTool('erase');
    eq('the old eraser is still a single click', VP.dataset.tool, 'erase');
    var p = screenOf(250, 100);
    VP.dispatchEvent(ev('pointerdown', p));
    VP.dispatchEvent(ev('pointerup', p));
    eq('...and still works', cv().strokes.length, 1);
    ok('...on the one clicked', !has(c1.id));

    pickTool('pen');
    var q1 = screenOf(60, 60), q2 = screenOf(160, 120);
    VP.dispatchEvent(ev('pointerdown', q1));
    VP.dispatchEvent(ev('pointermove', q2));
    VP.dispatchEvent(ev('pointerup', q2));
    eq('the pen still draws', cv().strokes.length, 2);

    pickTool('sweep');
    ok('the brush shows itself when the pointer moves',
       (function () {
         VP.dispatchEvent(ev('pointermove', screenOf(300, 300)));
         return ring().classList.contains('on');
       })());
    VP.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerId: 1 }));
    ok('...and hides when the pointer leaves', !ring().classList.contains('on'));

    /* keyboard */
    pickTool('select');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
    eq('S reaches for it', VP.dataset.tool, 'sweep');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    eq('E is still the old one', VP.dataset.tool, 'erase');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));

    /* ============================================================
       it works away from the origin, at another zoom
       ============================================================ */
    Store.clearCanvas();
    Canvas.setZoom(0.5);
    Store.canvasEdit(function (c) { c.pan.x = 120; c.pan.y = 60; }, { silent: true });
    Canvas.applyTransform();
    var far = line(600, 400, 900, '#ffffff');
    var alsoFar = line(700, 400, 900, '#ffffff');
    Canvas.render();
    pickTool('sweep');
    sweep([[400, 600], [650, 600], [900, 600]]);
    eq('zoomed out and panned, it still finds the mark', cv().strokes.length, 1);
    ok('...the right one', !has(far.id) && has(alsoFar.id));
    Canvas.setZoom(1);
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }
  document.title = 'SWEEP ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre'); pre.id = 'sweepresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2400);
