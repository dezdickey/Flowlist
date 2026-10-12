/* canvas suite — drives the real pointer path */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }

var VP = function () { return document.getElementById('canvas-viewport'); };
function ev(type, x, y, t) {
  (t || VP()).dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y,
    button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1
  }));
}
function down(x, y) { var t = document.elementFromPoint(x, y) || VP(); ev('pointerdown', x, y, t); }
function move(x, y) { ev('pointermove', x, y); }
function up(x, y) { ev('pointerup', x, y); }
function screenOf(wx, wy) {
  var c = Store.activeCanvas(), r = VP().getBoundingClientRect();
  return { x: r.left + c.pan.x + wx * c.zoom, y: r.top + c.pan.y + wy * c.zoom };
}
function tool(name) {
  var i = { select: 0, pen: 1, arrow: 2, erase: 3 }[name];
  document.querySelectorAll('#ctool-tools .ctool')[i].click();
}
function C() { return Store.activeCanvas(); }

setTimeout(function () {
  try {
    Store.reset();
    Store.setView('canvas');

    /* ---------- view switching ---------- */
    ok('canvas view is showing', getComputedStyle(document.getElementById('canvas-wrap')).display !== 'none');
    ok('board is hidden', getComputedStyle(document.getElementById('board-wrap')).display === 'none');
    ok('rail marks the canvas as the live view',
       document.getElementById('btn-panel-canvas').classList.contains('view-on'));
    ok('one canvas seeded', Store.get().canvases.length === 1);
    ok('toolbar built', document.querySelectorAll('#ctool-tools .ctool').length === 4);

    /* ---------- free notes ---------- */
    document.querySelectorAll('#ctool-add .ctool')[0].click();     // "Note"
    ok('toolbar adds a note', C().nodes.length === 1, C().nodes.length);
    ok('note is on the canvas', document.querySelectorAll('.cnode-note').length === 1);
    var n1 = C().nodes[0];
    var ta = document.querySelector('[data-node-id="' + n1.id + '"] .cn-text');
    ta.value = 'first idea';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ok('typing into a canvas note is stored', C().nodes[0].text === 'first idea', C().nodes[0].text);

    var p = screenOf(600, 420);
    VP().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: p.x, clientY: p.y }));
    ok('double-click drops a note', C().nodes.length === 2, C().nodes.length);
    var n2 = C().nodes[1];
    ok('...where you clicked', Math.abs(n2.x + n2.w / 2 - 600) < 4 && Math.abs(n2.y + 60 - 420) < 4,
       n2.x + ',' + n2.y);

    /* ---------- dragging a card ---------- */
    tool('select');
    var before = { x: n1.x, y: n1.y };
    var g = document.querySelector('[data-node-id="' + n1.id + '"] .cn-grip');
    var gr = g.getBoundingClientRect();
    down(gr.left + gr.width / 2, gr.top + gr.height / 2);
    move(gr.left + gr.width / 2 + 130, gr.top + gr.height / 2 + 90);
    up(gr.left + gr.width / 2 + 130, gr.top + gr.height / 2 + 90);
    ok('a card can be dragged', Math.abs(n1.x - before.x - 130) < 3 && Math.abs(n1.y - before.y - 90) < 3,
       (n1.x - before.x) + ',' + (n1.y - before.y));

    /* ---------- connecting two cards ---------- */
    tool('arrow');
    var a = screenOf(n1.x + n1.w / 2, n1.y + 60);
    var b = screenOf(n2.x + n2.w / 2, n2.y + 60);
    down(a.x, a.y); move((a.x + b.x) / 2, (a.y + b.y) / 2); move(b.x, b.y); up(b.x, b.y);
    ok('dragging card to card makes a connector', C().edges.length === 1, C().edges.length);
    if (C().edges.length) {
      var e0 = C().edges[0];
      ok('the connector knows both cards', e0.from.node === n1.id && e0.to.node === n2.id,
         JSON.stringify(e0.from) + '->' + JSON.stringify(e0.to));
      ok('connector drawn with an arrowhead', document.querySelectorAll('#csvg-edges g').length === 1 &&
         document.querySelectorAll('#csvg-edges path').length === 2);
    }
    // a second identical link is refused
    down(a.x, a.y); move(b.x, b.y); up(b.x, b.y);
    ok('no duplicate connector between the same pair', C().edges.length === 1, C().edges.length);

    /* ---------- connectors follow the cards ---------- */
    var d1 = document.querySelector('#csvg-edges path').getAttribute('d');
    tool('select');
    var g2 = document.querySelector('[data-node-id="' + n2.id + '"] .cn-grip').getBoundingClientRect();
    down(g2.left + 5, g2.top + 5); move(g2.left + 205, g2.top + 145); up(g2.left + 205, g2.top + 145);
    ok('the line follows the card', document.querySelector('#csvg-edges path').getAttribute('d') !== d1);

    /* ---------- drawing ---------- */
    tool('pen');
    var s1 = screenOf(200, 700), s2 = screenOf(500, 700);
    down(s1.x, s1.y);
    for (var i = 1; i <= 10; i++) move(s1.x + (s2.x - s1.x) * i / 10, s1.y);
    up(s2.x, s2.y);
    ok('a freehand stroke is recorded', C().strokes.length === 1, C().strokes.length);
    ok('the stroke has points', C().strokes.length && C().strokes[0].pts.length >= 8,
       C().strokes.length ? C().strokes[0].pts.length : 0);
    ok('the stroke is drawn', document.querySelectorAll('#csvg-strokes .cstroke').length === 1);
    ok('the stroke kept the chosen colour+width',
       C().strokes.length && C().strokes[0].width === 4);
    ok('nothing left in the live layer', document.getElementById('csvg-live').children.length === 0);

    // a tap with the pen leaves nothing behind
    down(s1.x, s1.y + 60); up(s1.x, s1.y + 60);
    ok('a pen tap does not leave a dot', C().strokes.length === 1, C().strokes.length);

    /* ---------- panning ---------- */
    tool('select');
    var panBefore = { x: C().pan.x, y: C().pan.y };
    var blank = screenOf(1400, 1200);
    down(blank.x, blank.y); move(blank.x - 120, blank.y - 60); up(blank.x - 120, blank.y - 60);
    ok('dragging blank space pans', Math.abs(C().pan.x - panBefore.x + 120) < 2 && Math.abs(C().pan.y - panBefore.y + 60) < 2,
       (C().pan.x - panBefore.x) + ',' + (C().pan.y - panBefore.y));

    /* ---------- zoom ---------- */
    Canvas.setZoom(2);
    ok('zoom set', Math.abs(C().zoom - 2) < 0.001, C().zoom);
    ok('transform reflects zoom', document.getElementById('canvas-world').style.transform.indexOf('scale(2)') !== -1,
       document.getElementById('canvas-world').style.transform);
    ok('zoom label updated', document.getElementById('zoom-label').textContent === '200%',
       document.getElementById('zoom-label').textContent);
    Canvas.setZoom(9);
    ok('zoom is clamped at the top', C().zoom <= 3.001, C().zoom);
    Canvas.setZoom(0.01);
    ok('zoom is clamped at the bottom', C().zoom >= 0.249, C().zoom);
    Canvas.setZoom(1);

    // world coords survive a zoom round trip
    var keep = { x: n1.x, y: n1.y };
    Canvas.setZoom(1.75); Canvas.setZoom(1);
    ok('cards keep their world position through zooming', n1.x === keep.x && n1.y === keep.y);

    Canvas.fit();
    ok('fit picks a sane zoom', C().zoom > 0.24 && C().zoom <= 2, C().zoom);

    /* ---------- erasing ---------- */
    tool('erase');
    var sp = document.querySelector('#csvg-strokes .cstroke').getBoundingClientRect();
    down(sp.left + sp.width / 2, sp.top + sp.height / 2);
    ok('the eraser removes a stroke', C().strokes.length === 0, C().strokes.length);
    var nd = document.querySelector('.cnode').getBoundingClientRect();
    var nodesBefore = C().nodes.length;
    down(nd.left + nd.width / 2, nd.top + nd.height / 2);
    ok('the eraser removes a card', C().nodes.length === nodesBefore - 1, C().nodes.length);
    ok('its connectors go with it', C().edges.length === 0, C().edges.length);
    tool('select');

    /* ---------- categories on the canvas ---------- */
    var work = Store.get().lists.filter(function (l) { return l.name === 'Work'; })[0];
    Store.addNode({ kind: 'list', listId: work.id, x: 100, y: 100, w: 240, h: 180 });
    Canvas.render();
    var listNode = C().nodes[C().nodes.length - 1];
    var dom = document.querySelector('[data-node-id="' + listNode.id + '"]');
    ok('a category card renders', !!dom && dom.classList.contains('cnode-list'));
    ok('it shows the category name', dom.textContent.indexOf('Work') !== -1);
    ok('it lists the notes', dom.querySelectorAll('.cn-item').length === work.items.length,
       dom.querySelectorAll('.cn-item').length);

    dom.querySelector('.cn-item .cn-pop').click();
    ok('a note pops out onto the canvas', C().nodes.filter(function (n) { return n.kind === 'ref'; }).length === 1);
    ok('...linked back to its category', C().edges.length === 1, C().edges.length);
    var refNode = C().nodes.filter(function (n) { return n.kind === 'ref'; })[0];
    var refDom = document.querySelector('[data-node-id="' + refNode.id + '"]');
    ok('the popped note shows its text', refDom.textContent.indexOf(work.items[0].text.slice(0, 10)) !== -1);

    dom.querySelector('.cn-item .cn-pop').click();
    ok('popping the same note twice is refused',
       C().nodes.filter(function (n) { return n.kind === 'ref'; }).length === 1);

    /* live link to the real note */
    Store.mutate(function () { work.items[0].text = 'edited on the board'; }, ['canvas']);
    refDom = document.querySelector('[data-node-id="' + refNode.id + '"]');
    ok('editing the real note updates the canvas card',
       refDom.textContent.indexOf('edited on the board') !== -1, refDom.textContent.slice(0, 40));

    /* deleting the category cleans up */
    var edgesBefore = C().edges.length;
    Store.deleteList(work.id);
    ok('deleting a category removes its canvas card',
       C().nodes.filter(function (n) { return n.listId === work.id && n.kind === 'list'; }).length === 0);
    ok('and drops the connectors that hung off it', C().edges.length < edgesBefore || C().edges.length === 0);

    /* ---------- multiple canvases ---------- */
    var c2 = Store.addCanvas('Second');
    ok('a second canvas exists', Store.get().canvases.length === 2);
    ok('it becomes the active one', Store.get().activeCanvas === c2.id);
    ok('it starts empty', C().nodes.length === 0 && C().strokes.length === 0);
    ok('both are listed in the panel', document.querySelectorAll('#canvas-index .cv-row').length === 2);
    ok('the active one is marked', document.querySelectorAll('#canvas-index .cv-row.is-open').length === 1);

    Store.mutate(function () { c2.name = 'Renamed'; }, ['canvases']);
    ok('renaming shows in the panel',
       document.querySelectorAll('#canvas-index .cv-row')[1].textContent.indexOf('Renamed') !== -1);

    var firstId = Store.get().canvases[0].id;
    Store.openCanvas(firstId);
    ok('switching canvases works', Store.get().activeCanvas === firstId);
    ok('the first canvas still has its contents', C().nodes.length > 0, C().nodes.length);

    Store.deleteCanvas(c2.id);
    ok('a canvas can be deleted', Store.get().canvases.length === 1);
    Store.deleteCanvas(Store.get().canvases[0].id);
    ok('deleting the last one leaves a fresh canvas', Store.get().canvases.length === 1);

    /* ---------- focus mode ---------- */
    Store.mutate(function (s) { s.settings.panels = { lists: true, presets: false, canvas: true, today: true }; }, ['panels']);
    Canvas.toggleFocus();
    var pn = Store.settings().panels;
    ok('focus hides every panel', !pn.lists && !pn.presets && !pn.canvas && !pn.today);
    ok('the rail stays put', document.getElementById('rail').offsetWidth > 0);
    Canvas.toggleFocus();
    pn = Store.settings().panels;
    ok('focus restores what was open', pn.lists && pn.canvas && pn.today && !pn.presets,
       JSON.stringify(pn));

    /* ---------- back to the board ---------- */
    document.getElementById('btn-back-to-board').click();
    ok('back to the board', Store.get().view === 'board');
    ok('board visible again', getComputedStyle(document.getElementById('board-wrap')).display !== 'none');
    ok('canvas hidden', getComputedStyle(document.getElementById('canvas-wrap')).display === 'none');
    document.getElementById('btn-panel-canvas').click();
    ok('the rail button brings the canvas back', Store.get().view === 'canvas');

    /* ---------- persistence ---------- */
    Store.setView('canvas');
    Store.addNode({ kind: 'note', x: 5, y: 6, w: 210, h: 120, text: 'persist me', color: '#f2c94c' });
    Store.addStroke({ color: '#ff6fae', width: 8, pts: [1, 2, 3, 4, 5, 6] });
    var dump = Store.exportJSON();
    var nodeCount = C().nodes.length, strokeCount = C().strokes.length;
    Store.reset();
    ok('reset clears the canvas', C().nodes.length === 0);
    Store.importJSON(dump);
    ok('canvases survive an export/import', C().nodes.length === nodeCount && C().strokes.length === strokeCount,
       C().nodes.length + '/' + C().strokes.length);
    ok('note text survived', C().nodes.some(function (n) { return n.text === 'persist me'; }));
    ok('stroke colour survived', C().strokes.some(function (s) { return s.color === '#ff6fae' && s.width === 8; }));
    Store.flush();
    var saved = JSON.parse(localStorage.getItem('flowlist.state.v1'));
    ok('canvases reach storage', saved.canvases && saved.canvases.length >= 1);
    ok('the saved canvas carries its nodes',
       saved.canvases.some(function (c) { return c.nodes.some(function (n) { return n.text === 'persist me'; }); }));

    /* ---------- older saves upgrade cleanly ---------- */
    var legacy = JSON.parse(dump);
    delete legacy.canvases; delete legacy.activeCanvas; delete legacy.view; legacy.v = 1;
    Store.importJSON(JSON.stringify(legacy));
    ok('a pre-canvas save still loads', Store.get().canvases.length === 1, Store.get().canvases.length);
    ok('...and lands on the board', Store.get().view === 'board');
    ok('...with its lists intact', Store.get().lists.length === legacy.lists.length);

  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }

  document.title = 'CANVAS ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre');
  pre.id = 'canvasresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 500);
