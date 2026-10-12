var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var VP = document.getElementById('canvas-viewport');
var cv = function () { return Store.activeCanvas(); };
var nodes = function () { return cv().nodes; };
var imgs = function () { return nodes().filter(function (n) { return n.kind === 'image'; }); };

function pt(x, y) {
  var r = VP.getBoundingClientRect();
  return { x: r.left + x, y: r.top + y };
}
function down(x, y, button, target) {
  var p = pt(x, y);
  (target || VP).dispatchEvent(new PointerEvent('pointerdown', {
    clientX: p.x, clientY: p.y, button: button || 0, buttons: button === 1 ? 4 : 1,
    bubbles: true, cancelable: true, pointerId: 1
  }));
}
function move(x, y) {
  var p = pt(x, y);
  VP.dispatchEvent(new PointerEvent('pointermove', {
    clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, pointerId: 1
  }));
}
function up(x, y, button) {
  var p = pt(x, y);
  VP.dispatchEvent(new PointerEvent('pointerup', {
    clientX: p.x, clientY: p.y, button: button || 0, buttons: 0,
    bubbles: true, cancelable: true, pointerId: 1
  }));
}
function wheelOn(el, x, y, dy) {
  var p = pt(x, y);
  var ev = new WheelEvent('wheel', { clientX: p.x, clientY: p.y, deltaY: dy, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
}
function rightClick(x, y, target) {
  var p = pt(x, y);
  (target || VP).dispatchEvent(new MouseEvent('contextmenu', {
    clientX: p.x, clientY: p.y, button: 2, bubbles: true, cancelable: true
  }));
}
function menuLabels() {
  return [].slice.call(document.querySelectorAll('#ctx .ctx-item span:last-child'))
    .map(function (s) { return s.textContent; });
}
function menuHeads() {
  return [].slice.call(document.querySelectorAll('#ctx .ctx-head'))
    .map(function (s) { return s.textContent; });
}
function clickMenu(label) {
  var b = [].slice.call(document.querySelectorAll('#ctx .ctx-item')).filter(function (x) {
    return x.textContent.trim() === label;
  })[0];
  if (b) b.click();
  return !!b;
}

/* a picture with known dimensions, as a real File on a real paste event */
function svgFile(w, h) {
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
            '<rect width="' + w + '" height="' + h + '" fill="#33aa77"/></svg>';
  return new File([svg], 'pic.svg', { type: 'image/svg+xml' });
}
function pasteEvent(file, alsoText) {
  var dt = new DataTransfer();
  if (alsoText) dt.setData('text/plain', 'some words');
  if (file) dt.items.add(file);
  return new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
}
/* the paste runs through FileReader and an <img> decode, so wait for it */
function waitFor(test, ms) {
  return new Promise(function (done, fail) {
    var tries = 0;
    (function look() {
      if (test()) return done(true);
      if (++tries > (ms || 60)) return fail(new Error('gave up waiting'));
      setTimeout(look, 16);
    })();
  });
}

setTimeout(function () {
  Promise.resolve().then(function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    Store.reset();
    Store.setView('canvas');
    Store.clearCanvas();
    Canvas.setZoom(1);
    Store.canvasEdit(function (c) { c.pan.x = 0; c.pan.y = 0; }, { silent: true });
    Canvas.applyTransform();
    Canvas.render();

    /* ============================================================
       a black marker
       ============================================================ */
    var swatches = [].slice.call(document.querySelectorAll('#ctool-colors .cswatch'));
    eq('the palette has ten colours', swatches.length, 10);
    var black = swatches[swatches.length - 1];
    eq('the last one is black', black.style.getPropertyValue('--c'), '#000000');
    eq('...and says so', black.title, 'Black');
    eq('white is still beside it', swatches[swatches.length - 2].title, 'White');
    ok('every swatch has a ring, so black shows up on a dark theme',
       getComputedStyle(black).boxShadow.indexOf('inset') !== -1, getComputedStyle(black).boxShadow);

    black.click();
    ok('clicking it marks it', document.querySelectorAll('#ctool-colors .cswatch.on').length === 1 &&
       document.querySelectorAll('#ctool-colors .cswatch')[9].classList.contains('on'));

    /* draw with it */
    document.querySelectorAll('#ctool-tools .ctool')[1].click();   // pen
    down(120, 120); move(150, 150); move(180, 170); up(180, 170);
    eq('a stroke was drawn', cv().strokes.length, 1);
    eq('...in black', cv().strokes[0].color, '#000000');
    document.querySelectorAll('#ctool-tools .ctool')[0].click();   // back to select
    Store.clearCanvas();

    /* ============================================================
       middle-button drag pans
       ============================================================ */
    var pan0 = { x: cv().pan.x, y: cv().pan.y };
    down(200, 200, 1);
    ok('holding the wheel down starts a pan', VP.classList.contains('panning'));
    move(260, 240);
    eq('...and the canvas follows it across', cv().pan.x, pan0.x + 60);
    eq('...and down', cv().pan.y, pan0.y + 40);
    up(260, 240, 1);
    ok('letting go ends it', !VP.classList.contains('panning'));

    /* it pans with any tool in hand, not just Select */
    document.querySelectorAll('#ctool-tools .ctool')[1].click();   // pen
    var pan1 = cv().pan.x;
    down(200, 200, 1); move(240, 200); up(240, 200, 1);
    eq('the pen tool pans on the middle button too', cv().pan.x, pan1 + 40);
    eq('...and draws nothing', cv().strokes.length, 0);
    document.querySelectorAll('#ctool-tools .ctool')[0].click();

    /* the browser's own autoscroll is turned away */
    var md = new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true });
    VP.dispatchEvent(md);
    ok('middle mousedown is swallowed, so no autoscroll compass', md.defaultPrevented);

    /* ============================================================
       pasting a picture
       ============================================================ */
    Store.mutate(function (s) { s.settings.pasteScale = 100; }, null, { silent: true });
    move(300, 260);                                   // the paste lands here
    var world = { x: (300 - cv().pan.x) / cv().zoom, y: (260 - cv().pan.y) / cv().zoom };
    document.dispatchEvent(pasteEvent(svgFile(120, 60)));
    return waitFor(function () { return imgs().length === 1; }).then(function () {
      var n = imgs()[0];
      eq('a picture becomes a card of its own', n.kind, 'image');
      eq('...at its own width', n.w, 120);
      eq('...and its own height', n.h, 60);
      eq('...remembering the size it really is', n.nw, 120);
      ok('...stored as it arrived, not re-encoded', n.src.indexOf('data:image/svg+xml') === 0, n.src.slice(0, 40));
      ok('...centred on the mouse', Math.abs((n.x + n.w / 2) - world.x) < 2 &&
         Math.abs((n.y + n.h / 2) - world.y) < 2, n.x + ',' + n.y + ' vs ' + JSON.stringify(world));

      var dom = document.querySelector('[data-node-id="' + n.id + '"]');
      ok('it is on the canvas', !!dom && dom.classList.contains('cnode-image'));
      var pic = dom.querySelector('.cn-img');
      ok('...as a picture', !!pic);
      eq('...with the pasted data behind it', pic.getAttribute('src'), n.src);
      eq('...and the browser cannot drag it away', pic.draggable, false);
      eq('...the card is exactly as wide as the picture', dom.style.width, '120px');

      /* the scale setting */
      var first = n.src;
      Store.mutate(function (s) { s.settings.pasteScale = 50; }, null, { silent: true });
      move(400, 300);
      document.dispatchEvent(pasteEvent(svgFile(120, 60)));
      return waitFor(function () { return imgs().length === 2; }).then(function () {
        var half = imgs()[1];
        eq('half scale halves the width', half.w, 60);
        eq('...and the height with it', half.h, 30);
        eq('...but the picture itself is untouched', half.src, first);
        eq('...and it still knows its real size', half.nw, 120);

        Store.mutate(function (s) { s.settings.pasteScale = 200; }, null, { silent: true });
        document.dispatchEvent(pasteEvent(svgFile(120, 60)));
        return waitFor(function () { return imgs().length === 3; }).then(function () {
          eq('and 200% doubles it', imgs()[2].w, 240);
          eq('...keeping the shape', imgs()[2].h, 120);
          Store.mutate(function (s) { s.settings.pasteScale = 100; }, null, { silent: true });

          /* resizing one afterwards */
          var n2 = imgs()[1];
          Canvas.render();
          rightClick(0, 0, document.querySelector('[data-node-id="' + n2.id + '"]'));
          ok('a picture has a size menu', menuHeads().indexOf('Size') !== -1, menuHeads().join(' | '));
          ok('...with all three ways to change it',
             menuLabels().indexOf('Bigger') !== -1 && menuLabels().indexOf('Smaller') !== -1 &&
             menuLabels().indexOf('Its own full size') !== -1, menuLabels().join(' | '));
          var mid = { x: n2.x + n2.w / 2, y: n2.y + n2.h / 2 };
          clickMenu('Bigger');
          eq('bigger is a quarter more', n2.w, 75);
          eq('...and the shape holds', n2.h, 38);
          ok('...growing about its middle', Math.abs((n2.x + n2.w / 2) - mid.x) < 2);

          Canvas.render();
          rightClick(0, 0, document.querySelector('[data-node-id="' + n2.id + '"]'));
          clickMenu('Its own full size');
          eq('and it can go back to its own pixels', n2.w, 120);
          eq('...exactly', n2.h, 60);

          /* what should not paste */
          var before = imgs().length;
          Store.setView('board');
          document.dispatchEvent(pasteEvent(svgFile(120, 60)));
          return waitFor(function () { return true; }).then(function () {
            eq('nothing is pasted while you are on the board', imgs().length, before);
            Store.setView('canvas');
            Canvas.render();

            /* mid-sentence, words win */
            var note = Store.addNode({ kind: 'note', x: 40, y: 40, w: 210, h: 120, text: '' });
            Canvas.render();
            var ta = document.querySelector('[data-node-id="' + note.id + '"] .cn-text');
            ta.focus();
            document.dispatchEvent(pasteEvent(svgFile(120, 60), true));
            return new Promise(function (r) { setTimeout(r, 60); }).then(function () {
              eq('typing in a note, a clipboard with words in it is left alone', imgs().length, before);
              document.dispatchEvent(pasteEvent(svgFile(120, 60)));
              return waitFor(function () { return imgs().length === before + 1; }).then(function () {
                ok('...but a picture on its own still lands', true);
                ta.blur();

                /* a picture too big for the browser is not left half-there */
                var real = localStorage.setItem.bind(localStorage);
                var kept = imgs().length;
                localStorage.setItem = function () { throw new Error('QuotaExceededError'); };
                document.dispatchEvent(pasteEvent(svgFile(120, 60)));
                return new Promise(function (r) { setTimeout(r, 120); }).then(function () {
                  localStorage.setItem = real;
                  eq('a picture the browser will not store is taken back off again', imgs().length, kept);
                  ok('...and it says so', document.getElementById('toast').textContent.indexOf('5 MB') !== -1,
                     document.getElementById('toast').textContent);
                  ok('the save works again afterwards', Store.flush() === true);

                  /* it survives a reload */
                  var saved = JSON.parse(Store.exportJSON());
                  Store.importJSON(JSON.stringify(saved));
                  var back = Store.activeCanvas().nodes.filter(function (n) { return n.kind === 'image'; });
                  eq('pictures come back after a reload', back.length, kept);
                  ok('...with their data', back[0].src.indexOf('data:image') === 0);
                  eq('...and their size', back[0].w, 120);

                  /* ============================================================
                     the wheel inside a text box
                     ============================================================ */
                  Store.clearCanvas();
                  var lines = [];
                  for (var i = 0; i < 60; i++) lines.push('line ' + i);
                  var big = Store.addNode({ kind: 'note', x: 0, y: 0, w: 210, h: 120, text: lines.join('\n') });
                  Canvas.render();
                  var box = document.querySelector('[data-node-id="' + big.id + '"] .cn-text');
                  ok('the note has more text than it can show', box.scrollHeight > box.clientHeight + 2,
                     box.scrollHeight + ' vs ' + box.clientHeight);

                  var panA = cv().pan.y;
                  box.scrollTop = 0;
                  var w1 = wheelOn(box, 30, 60, 120);
                  ok('the wheel inside the text is left to scroll it', !w1.defaultPrevented);
                  eq('...and the canvas stays put', cv().pan.y, panA);

                  box.scrollTop = box.scrollHeight;
                  var w2 = wheelOn(box, 30, 60, 120);
                  ok('at the end of the text it goes back to the canvas', w2.defaultPrevented);
                  ok('...which moves again', cv().pan.y !== panA);

                  box.scrollTop = box.scrollHeight;
                  var panB = cv().pan.y;
                  var w3 = wheelOn(box, 30, 60, -120);
                  ok('scrolling back up inside the text is still the text', !w3.defaultPrevented);
                  eq('...canvas untouched', cv().pan.y, panB);

                  var panC = cv().pan.y;
                  var w4 = wheelOn(VP, 400, 300, 120);
                  ok('over bare canvas the wheel still pans', w4.defaultPrevented && cv().pan.y !== panC);

                  /* ============================================================
                     right-click on bare canvas
                     ============================================================ */
                  rightClick(320, 200);
                  ok('bare canvas has a menu now', document.getElementById('ctx').classList.contains('show'));
                  ok('...offering a paste', menuLabels().indexOf('Paste a picture here') !== -1,
                     menuLabels().join(' | '));
                  ok('...a note', menuLabels().indexOf('Add a note here') !== -1);
                  ok('...and a way to see everything', menuLabels().indexOf('Fit everything on screen') !== -1);
                  clickMenu('Add a note here');
                  var made = nodes()[nodes().length - 1];
                  eq('the note is made where the menu was opened', made.kind, 'note');
                  var wx = (320 - cv().pan.x) / cv().zoom;
                  ok('...at that spot', Math.abs((made.x + 105) - wx) < 3, made.x + ' vs ' + wx);

                  Canvas.render();
                  rightClick(0, 0, document.querySelector('[data-node-id="' + made.id + '"]'));
                  ok('a card keeps its own menu', menuLabels().indexOf('Remove from canvas') !== -1 &&
                     menuLabels().indexOf('Paste a picture here') === -1, menuLabels().join(' | '));
                  UI.close();

                  /* the setting itself */
                  Themes.openDrawer();
                  var names = [].slice.call(document.querySelectorAll('.drawer-body .tr-name'))
                    .map(function (r) { return r.textContent; });
                  ok('the paste size is in Settings', names.indexOf('Pasted pictures') !== -1, names.join(' | '));
                  var row = document.querySelector('[data-slider="Pasted pictures"]');
                  eq('...as a percentage', row.querySelector('.num-val').textContent, '100% of its own size');
                  row.querySelector('input').value = 25;
                  row.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }));
                  eq('...that is remembered', Store.settings().pasteScale, 25);
                  Themes.closeDrawer();
                });
              });
            });
          });
        });
      });
    });
  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'PASTE ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'pasteresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2400);
