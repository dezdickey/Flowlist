/*
 * Two fingers on the canvas mean zoom, whatever tool is in hand — and a
 * pinch must never leave behind the stroke or the card move that the first
 * finger had already begun.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
function near(n, got, want, tol) { ok(n, Math.abs(got - want) <= tol, 'got ' + got + ' want about ' + want); }

var VP = function () { return document.getElementById('canvas-viewport'); };
function ev(type, id, x, y, t) {
  (t || VP()).dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: id,
    button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y
  }));
}
function tool(name) {
  var i = { select: 0, pen: 1, arrow: 2, erase: 3, sweep: 4 }[name];
  document.querySelectorAll('#ctool-tools .ctool')[i].click();
}
function C() { return Store.activeCanvas(); }
function strokes() { return C().strokes.length; }

setTimeout(function () {
  try {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    Store.reset();
    Store.setView('canvas');
    ok('the canvas is showing', !!VP());

    /* ---------- a plain two-finger pinch zooms ---------- */
    tool('select');
    Canvas.setZoom(1);
    ev('pointerdown', 1, 400, 400);
    ev('pointerdown', 2, 500, 400);            // 100px apart
    ev('pointermove', 1, 350, 400);
    ev('pointermove', 2, 550, 400);            // 200px apart, so twice
    near('two fingers spreading zoom in', C().zoom, 2, 0.05);
    ev('pointerup', 1, 350, 400); ev('pointerup', 2, 550, 400);

    /* ---------- and pinching in zooms out ---------- */
    Canvas.setZoom(2);
    ev('pointerdown', 3, 300, 400);
    ev('pointerdown', 4, 500, 400);            // 200 apart
    ev('pointermove', 3, 375, 400);
    ev('pointermove', 4, 425, 400);            // 50 apart, so a quarter
    near('...and closing them zooms out', C().zoom, 0.5, 0.05);
    ev('pointerup', 3, 375, 400); ev('pointerup', 4, 425, 400);

    /* ---------- it will not go past the limits ---------- */
    Canvas.setZoom(1);
    ev('pointerdown', 5, 399, 400); ev('pointerdown', 6, 401, 400);
    ev('pointermove', 5, 100, 400); ev('pointermove', 6, 900, 400);
    ok('it stops at the top of the range', C().zoom <= 3, C().zoom);
    ev('pointerup', 5, 100, 400); ev('pointerup', 6, 900, 400);

    Canvas.setZoom(1);
    ev('pointerdown', 16, 100, 400); ev('pointerdown', 17, 900, 400);
    ev('pointermove', 16, 399, 400); ev('pointermove', 17, 401, 400);
    ok('...and at the bottom', C().zoom >= 0.25, C().zoom);
    ev('pointerup', 16, 399, 400); ev('pointerup', 17, 401, 400);

    /* ---------- moving both together also pans ---------- */
    Canvas.setZoom(1);
    var panX = C().pan.x, panY = C().pan.y;
    ev('pointerdown', 7, 400, 400); ev('pointerdown', 8, 500, 400);
    ev('pointermove', 7, 460, 430); ev('pointermove', 8, 560, 430);
    near('moving both together pans sideways', C().pan.x, panX + 60, 6);
    near('...and up and down', C().pan.y, panY + 30, 6);
    near('...without changing the zoom', C().zoom, 1, 0.02);
    ev('pointerup', 7, 460, 430); ev('pointerup', 8, 560, 430);

    /* ---------- with the pen, a second finger cancels the stroke ---------- */
    tool('pen');
    Canvas.setZoom(1);
    var before = strokes();
    ev('pointerdown', 9, 300, 300);
    ev('pointermove', 9, 320, 320);
    ev('pointermove', 9, 340, 340);
    ev('pointerdown', 10, 500, 300);           // second finger lands mid-stroke
    ev('pointermove', 9, 280, 300);
    ev('pointermove', 10, 520, 300);
    ev('pointerup', 9, 280, 300);
    ev('pointerup', 10, 520, 300);
    eq('a pinch mid-stroke leaves no mark behind', strokes(), before);

    /* ---------- the finger left over does not start drawing ---------- */
    var before2 = strokes();
    ev('pointerdown', 11, 200, 200);
    ev('pointerdown', 12, 400, 200);
    ev('pointerup', 12, 400, 200);             // one lifts, one stays down
    ev('pointermove', 11, 260, 260);
    ev('pointermove', 11, 300, 300);
    ev('pointerup', 11, 300, 300);
    eq('the finger left over does not draw', strokes(), before2);

    /* ---------- once every finger is up, drawing works again ---------- */
    var before3 = strokes();
    ev('pointerdown', 13, 150, 150);
    ev('pointermove', 13, 200, 200);
    ev('pointermove', 13, 250, 250);
    ev('pointerup', 13, 250, 250);
    eq('after every finger lifts, the pen draws again', strokes(), before3 + 1);

    /* ---------- zoom works with the pen in hand ---------- */
    Canvas.setZoom(1);
    ev('pointerdown', 14, 400, 400); ev('pointerdown', 15, 500, 400);
    ev('pointermove', 14, 350, 400); ev('pointermove', 15, 550, 400);
    near('two fingers zoom even with the pen selected', C().zoom, 2, 0.06);
    ev('pointerup', 14, 350, 400); ev('pointerup', 15, 550, 400);

    /* ---------- a card dragged into a pinch goes back ---------- */
    tool('select');
    Canvas.setZoom(1);
    document.querySelectorAll('#ctool-add .ctool')[0].click();      // add a Note
    var node = C().nodes[C().nodes.length - 1];
    ok('a card to try it with', !!node);
    var startX = node.x, startY = node.y;
    var dom = document.querySelector('.cnode[data-node-id="' + node.id + '"]');
    ok('...and it is on screen', !!dom);
    if (dom) {
      var r = dom.getBoundingClientRect();
      ev('pointerdown', 20, r.left + 12, r.top + 12, dom);
      ev('pointermove', 20, r.left + 92, r.top + 92);
      ev('pointerdown', 21, r.left + 320, r.top + 12);    // pinch begins mid-drag
      ev('pointerup', 20, r.left + 92, r.top + 92);
      ev('pointerup', 21, r.left + 320, r.top + 12);
      var after = C().nodes.filter(function (n) { return n.id === node.id; })[0];
      near('a card dragged into a pinch goes back where it was', after.x, startX, 2);
      near('...on both axes', after.y, startY, 2);
    }

    /* ---------- one finger still pans as it always did ---------- */
    tool('select');
    Canvas.setZoom(1);
    var px = C().pan.x;
    ev('pointerdown', 30, 700, 500);
    ev('pointermove', 30, 760, 500);
    ev('pointerup', 30, 760, 500);
    near('one finger on empty space still pans', C().pan.x, px + 60, 6);
  } catch (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }
  document.title = 'PINCH ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre'); pre.id = 'pinchresults';
  pre.textContent = '\n' + OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
