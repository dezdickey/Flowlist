/* drop-on-the-panels to remove, and the Canvas rail button behaviour */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function pev(type, x, y, t) {
  (t || window).dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y,
    button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1
  }));
}
function centre(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function C() { return Store.activeCanvas(); }
function VP() { return document.getElementById('canvas-viewport'); }
function OV() { return document.getElementById('drop-remove'); }
function panelPoint() { var b = Remove.box(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }

/* a canvas card is dragged by the canvas itself, not the shared engine */
function dragCard(nodeId, to) {
  var dom = document.querySelector('[data-node-id="' + nodeId + '"]');
  var handle = dom.querySelector('.cn-grip') || dom.querySelector('.cn-head') || dom;
  var s = centre(handle);
  pev('pointerdown', s.x, s.y, handle);
  pev('pointermove', s.x + 10, s.y + 10, VP());
  pev('pointermove', to.x, to.y, VP());
  pev('pointerup', to.x, to.y, VP());
}
/* anything on the shared engine */
function dragDnd(el, to) {
  var s = centre(el);
  pev('pointerdown', s.x, s.y, el);
  pev('pointermove', s.x + 12, s.y + 12);
  pev('pointermove', to.x, to.y);
  pev('pointermove', to.x, to.y);
  pev('pointerup', to.x, to.y);
}
function P(k) { return Store.settings().panels[k]; }

setTimeout(function () {
  try {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');

    /* ============================================================
       PART 1 — the Canvas rail button
       ============================================================ */
    Store.reset();
    Store.mutate(function (s) { s.settings.panels = { lists: false, presets: false, canvas: false, today: false }; }, ['panels']);
    var btn = document.getElementById('btn-panel-canvas');

    btn.click();
    ok('first press opens the canvas', Store.get().view === 'canvas');
    ok('...with the list of canvases', P('canvas') === true);
    ok('...and Categories beside it', P('lists') === true);

    var railX = document.getElementById('rail').getBoundingClientRect().right;
    var lr = document.getElementById('panel-lists').getBoundingClientRect();
    var cr = document.getElementById('panel-canvas').getBoundingClientRect();
    ok('Categories sits hard left, next to the rail', Math.abs(lr.left - railX) < 2,
       Math.round(lr.left) + ' vs ' + Math.round(railX));
    ok('the canvases column sits to its right', cr.left >= lr.right - 1,
       Math.round(cr.left) + ' vs ' + Math.round(lr.right));

    btn.click();
    ok('second press hides the canvases column', P('canvas') === false);
    ok('...and leaves Categories open', P('lists') === true);
    ok('...and stays on the canvas', Store.get().view === 'canvas');

    btn.click();
    ok('third press brings the canvases column back', P('canvas') === true);
    ok('...Categories still open', P('lists') === true);

    /* Categories closes only when you close it */
    document.querySelector('#panel-lists .panel-close').click();
    ok('its own close button shuts Categories', P('lists') === false);
    btn.click(); btn.click();
    ok('toggling canvases does not reopen Categories', P('lists') === false);
    ok('canvases toggled as normal', P('canvas') === true);

    /* the other rail buttons are plain toggles and do not change surface */
    document.getElementById('btn-panel-lists').click();
    ok('the Lists button reopens Categories', P('lists') === true);
    ok('...without leaving the canvas', Store.get().view === 'canvas');
    document.getElementById('btn-panel-today').click();
    ok('the Today button is a plain toggle', P('today') === true && Store.get().view === 'canvas');
    document.getElementById('btn-panel-today').click();

    /* ============================================================
       PART 2 — dropping a canvas card on the panels
       ============================================================ */
    Store.reset();
    Store.mutate(function (s) { s.settings.panels = { lists: true, presets: false, canvas: true, today: false }; }, ['panels']);
    Store.setView('canvas');
    var work = Store.get().lists.filter(function (l) { return l.name === 'Work'; })[0];
    var workItems = work.items.length;

    var listNode = Store.addNode({ kind: 'list', listId: work.id, x: 60, y: 60, w: 240, h: 180 });
    var noteNode = Store.addNode({ kind: 'note', x: 60, y: 320, w: 210, h: 120, text: 'keep me', color: '#f2c94c' });
    var refNode = Store.addNode({ kind: 'ref', listId: work.id, itemId: work.items[0].id, x: 60, y: 500, w: 190, h: 84 });
    Store.addEdge({ node: listNode.id }, { node: refNode.id }, '#5cc8ff', 2);
    Canvas.render();
    ok('three cards on the canvas', C().nodes.length === 3, C().nodes.length);

    ok('the target is hidden while nothing is moving',
       getComputedStyle(OV()).visibility === 'hidden', getComputedStyle(OV()).visibility);

    /* the target appears the moment a card is lifted */
    var dom = document.querySelector('[data-node-id="' + noteNode.id + '"]');
    var h = centre(dom.querySelector('.cn-grip'));
    pev('pointerdown', h.x, h.y, dom.querySelector('.cn-grip'));
    pev('pointermove', h.x + 12, h.y + 12, VP());
    ok('lifting a card reveals the target', OV().classList.contains('show'));
    ok('...covering the open panels', Math.abs(parseFloat(OV().style.left) - Remove.box().left) < 1);
    ok('...not yet lit up', !OV().classList.contains('armed'));

    var pp = panelPoint();
    pev('pointermove', pp.x, pp.y, VP());
    ok('moving over the panels lights it up', OV().classList.contains('armed'));
    ok('...and marks the card', dom.classList.contains('about-to-go'));

    pev('pointerup', pp.x, pp.y, VP());
    ok('dropping there takes the note card off the canvas', C().nodes.length === 2, C().nodes.length);
    ok('...the target hides again', !OV().classList.contains('show'));
    ok('...and that free note is gone with it',
       C().nodes.filter(function (n) { return n.text === 'keep me'; }).length === 0);

    /* a referenced note leaves the canvas but survives in its category */
    dragCard(refNode.id, panelPoint());
    ok('a referenced note card can be dropped off', C().nodes.length === 1, C().nodes.length);
    ok('...the real note is untouched', work.items.length === workItems, work.items.length);
    ok('...it is still in its category', Store.itemById(work.id, refNode.itemId) !== null);
    ok('...and its connector went with it', C().edges.length === 0, C().edges.length);

    /* a category card leaves the canvas but the category survives */
    dragCard(listNode.id, panelPoint());
    ok('a category card can be dropped off', C().nodes.length === 0, C().nodes.length);
    ok('...the category still exists', Store.listById(work.id) !== null);
    ok('...with all its notes', Store.listById(work.id).items.length === workItems);

    /* dropping anywhere else just moves the card */
    var keep = Store.addNode({ kind: 'note', x: 400, y: 200, w: 210, h: 120, text: 'stay', color: '#6ee7a0' });
    Canvas.render();
    var vr = VP().getBoundingClientRect();
    dragCard(keep.id, { x: vr.left + vr.width * 0.7, y: vr.top + vr.height * 0.6 });
    ok('dropping on open canvas keeps the card', C().nodes.length === 1, C().nodes.length);
    ok('...and it moved', keep.x !== 400, keep.x);
    ok('...target hidden again', !OV().classList.contains('show'));

    /* with every panel shut there is nothing to drop onto */
    Store.mutate(function (s) { s.settings.panels = { lists: false, presets: false, canvas: false, today: false }; }, ['panels']);
    ok('no panels means no target', Remove.box() === null);
    var before = C().nodes.length;
    dragCard(keep.id, { x: vr.left + 30, y: vr.top + 40 });
    ok('a card dragged to the far left is safe', C().nodes.length === before, C().nodes.length);

    /* ============================================================
       PART 3 — board columns
       ============================================================ */
    Store.reset();
    Store.mutate(function (s) { s.settings.panels = { lists: true, presets: false, canvas: false, today: false }; }, ['panels']);
    Store.setView('board');
    var lists = Store.get().lists;
    lists.forEach(function (l) { if (!Store.isOpen(l.id)) Store.openList(l.id); });
    var victim = lists[1];
    var victimItems = victim.items.length;
    ok('columns are open', Store.get().board.length === 4, Store.get().board.length);

    var col = document.querySelector('#board .list[data-list-id="' + victim.id + '"]');
    dragDnd(col.querySelector('.list-head'), panelPoint());
    ok('a column dropped on the panels closes', Store.isOpen(victim.id) === false);
    ok('...the category survives', Store.listById(victim.id) !== null);
    ok('...with its notes', Store.listById(victim.id).items.length === victimItems);
    ok('...and it is back in the Categories list',
       !!document.querySelector('#list-index .cat[data-list-id="' + victim.id + '"]'));
    ok('...target hidden after the drop', !OV().classList.contains('show'));

    /* dragging a category into a preset box must still work, not be hijacked */
    Store.mutate(function (s) { s.settings.panels.presets = true; }, ['panels']);
    document.getElementById('panel-presets').classList.add('open');
    var preset = Store.addPreset('Group');
    Presets.render();
    var catRow = document.querySelector('#list-index .cat[data-list-id="' + victim.id + '"]');
    var dropBox = document.querySelector('.preset[data-preset-id="' + preset.id + '"] .preset-drop');
    dragDnd(catRow, centre(dropBox));
    ok('a category can still be dropped into a preset', preset.listIds.indexOf(victim.id) !== -1,
       JSON.stringify(preset.listIds));
    ok('...and was not swallowed by the remove target', Store.listById(victim.id) !== null);

    /* a note dragged between columns is unaffected */
    var a = Store.get().lists[2], b = Store.get().lists[0];
    var aCount = a.items.length, bCount = b.items.length;
    var noteEl = document.querySelector('#board .list[data-list-id="' + a.id + '"] .note');
    var targetBody = document.querySelector('#board .list[data-list-id="' + b.id + '"] .list-body');
    dragDnd(noteEl, centre(targetBody));
    ok('notes still move between columns', b.items.length === bCount + 1 && a.items.length === aCount - 1,
       a.items.length + '/' + b.items.length);

  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }

  document.title = 'REMOVE ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre');
  pre.id = 'removeresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 500);
