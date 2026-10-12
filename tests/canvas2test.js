/* card overflow modes + dragging a single note onto the canvas */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function pev(type, x, y, t) {
  (t || window).dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y,
    button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1
  }));
}
function centre(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
/** full DND gesture: press the element, lift, travel, drop */
function dragTo(el, to) {
  var s = centre(el);
  pev('pointerdown', s.x, s.y, el);
  pev('pointermove', s.x + 12, s.y + 12);
  pev('pointermove', to.x, to.y);
  pev('pointermove', to.x, to.y);
  pev('pointerup', to.x, to.y);
}
function C() { return Store.activeCanvas(); }
function VP() { return document.getElementById('canvas-viewport'); }
function screenOf(wx, wy) {
  var c = C(), r = VP().getBoundingClientRect();
  return { x: r.left + c.pan.x + wx * c.zoom, y: r.top + c.pan.y + wy * c.zoom };
}
function setOpt(k, v) { Store.mutate(function (s) { s.settings[k] = v; }, ['canvas']); }

setTimeout(function () {
  try {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');

    Store.reset();
    Store.mutate(function (s) { s.settings.panels = { lists: true, presets: false, canvas: false, today: false }; }, ['panels']);
    Store.setView('canvas');

    // a category with plenty of notes
    var big = Store.addList('Big list');
    for (var i = 1; i <= 12; i++) Store.addNote(big.id, i - 1, 'item number ' + i);
    ok('fixture has 12 notes', big.items.length === 12, big.items.length);

    var node = Store.addNode({ kind: 'list', listId: big.id, x: 80, y: 80, w: 240, h: 200 });
    Canvas.render();
    var dom = function () { return document.querySelector('[data-node-id="' + node.id + '"]'); };
    var rows = function () { return dom().querySelectorAll('.cn-item').length; };
    var box = function () { return dom().querySelector('.cn-items'); };

    /* ---------- +N more mode ---------- */
    setOpt('canvasListOverflow', 'count');
    setOpt('canvasListRows', 8);
    Canvas.render();
    ok('count mode shows only the cap', rows() === 8, rows());
    ok('count mode shows the remainder', dom().querySelector('.cn-more') &&
       dom().querySelector('.cn-more').textContent === '+4 more',
       dom().querySelector('.cn-more') ? dom().querySelector('.cn-more').textContent : 'none');
    ok('count mode does not scroll', !box().classList.contains('scrolls'));

    setOpt('canvasListRows', 3);
    Canvas.render();
    ok('the cap is adjustable', rows() === 3, rows());
    ok('the remainder follows the cap', dom().querySelector('.cn-more').textContent === '+9 more',
       dom().querySelector('.cn-more').textContent);

    /* ---------- scroll mode ---------- */
    setOpt('canvasListOverflow', 'scroll');
    setOpt('canvasListRows', 8);
    Canvas.render();
    ok('scroll mode renders every note', rows() === 12, rows());
    ok('scroll mode hides the +N line', !dom().querySelector('.cn-more'));
    ok('the box is marked scrollable', box().classList.contains('scrolls'));
    ok('the box actually overflows', box().scrollHeight > box().clientHeight + 2,
       box().scrollHeight + ' vs ' + box().clientHeight);
    ok('the card stays a sane height', dom().getBoundingClientRect().height < 320,
       Math.round(dom().getBoundingClientRect().height));

    box().scrollTop = 40;
    ok('it can be scrolled', box().scrollTop > 0, box().scrollTop);

    // a short category does not become scrollable
    var small = Store.addList('Small');
    Store.addNote(small.id, 0, 'only one');
    var sNode = Store.addNode({ kind: 'list', listId: small.id, x: 80, y: 400, w: 240, h: 120 });
    Canvas.render();
    var sBox = document.querySelector('[data-node-id="' + sNode.id + '"] .cn-items');
    ok('a short category is not marked scrollable', !sBox.classList.contains('scrolls'));

    /* the wheel scrolls the card, not the canvas */
    var zoomBefore = C().zoom, panBefore = C().pan.y;
    box().scrollTop = 0;
    box().dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 60 }));
    ok('wheel over a scrolling card leaves the zoom alone', C().zoom === zoomBefore);
    ok('wheel over a scrolling card leaves the pan alone', C().pan.y === panBefore, C().pan.y);

    /* past its end the canvas takes over again */
    box().scrollTop = box().scrollHeight;
    box().dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 60 }));
    ok('at the end the canvas pans again', C().pan.y !== panBefore, C().pan.y);

    /* ---------- dragging a row off a category card ---------- */
    Store.canvasEdit(function (c) { c.pan = { x: 0, y: 0 }; c.zoom = 1; });
    Canvas.applyTransform();
    var edgesBefore = C().edges.length;
    var refsBefore = C().nodes.filter(function (n) { return n.kind === 'ref'; }).length;
    var row = dom().querySelector('.cn-item');
    var rowText = row.textContent.trim();
    dragTo(row, screenOf(760, 520));
    var refs = C().nodes.filter(function (n) { return n.kind === 'ref'; });
    ok('a row dragged off the card becomes its own note', refs.length === refsBefore + 1, refs.length);
    if (refs.length) {
      var made = refs[refs.length - 1];
      ok('...dropped where it was released',
         Math.abs(made.x + made.w / 2 - 760) < 6 && Math.abs(made.y + 42 - 520) < 6,
         made.x + ',' + made.y);
      ok('...still linked to its category', C().edges.length === edgesBefore + 1, C().edges.length);
      ok('...showing the right note',
         document.querySelector('[data-node-id="' + made.id + '"]').textContent.indexOf(rowText.slice(0, 8)) !== -1);
      ok('...and the note stays in the category', big.items.length === 12, big.items.length);
    }

    /* dropping the same note again just repositions it */
    var countNow = C().nodes.length;
    dragTo(dom().querySelector('.cn-item'), screenOf(900, 700));
    ok('dropping the same note twice does not duplicate it', C().nodes.length === countNow, C().nodes.length);

    /* ---------- dragging a note out of the Lists panel ---------- */
    Store.mutate(function (s) { s.settings.panels.lists = true; }, ['panels']);
    document.getElementById('panel-lists').classList.add('open');
    Lists.renderIndex();

    var catRow = document.querySelector('#list-index .cat[data-list-id="' + big.id + '"]');
    ok('the category has a disclosure twist', !!catRow.querySelector('.cat-twist'));
    ok('its notes are hidden to start', document.querySelectorAll('#list-index .cat-note').length === 0);
    catRow.querySelector('.cat-twist').click();
    var panelNotes = document.querySelectorAll('#list-index .cat-note');
    ok('the twist reveals its notes', panelNotes.length === 12, panelNotes.length);
    ok('the twist is marked open',
       document.querySelector('#list-index .cat[data-list-id="' + big.id + '"]').classList.contains('expanded'));

    var beforeRefs = C().nodes.filter(function (n) { return n.kind === 'ref'; }).length;
    var beforeEdges = C().edges.length;
    var panelNote = document.querySelectorAll('#list-index .cat-note')[5];
    var panelText = panelNote.textContent.trim();
    dragTo(panelNote, screenOf(1050, 300));
    var refs2 = C().nodes.filter(function (n) { return n.kind === 'ref'; });
    ok('a note dragged from the panel lands on the canvas', refs2.length === beforeRefs + 1, refs2.length);
    if (refs2.length > beforeRefs) {
      var made2 = refs2[refs2.length - 1];
      ok('...where it was dropped',
         Math.abs(made2.x + made2.w / 2 - 1050) < 6 && Math.abs(made2.y + 42 - 300) < 6,
         made2.x + ',' + made2.y);
      ok('...with no stray connector', C().edges.length === beforeEdges, C().edges.length);
      ok('...showing the right text',
         document.querySelector('[data-node-id="' + made2.id + '"]').textContent.indexOf(panelText.slice(0, 8)) !== -1,
         panelText.slice(0, 20));
    }
    ok('the note is still in its category', big.items.length === 12, big.items.length);

    /* the panel can still be collapsed */
    document.querySelector('#list-index .cat[data-list-id="' + big.id + '"] .cat-twist').click();
    ok('the twist closes again', document.querySelectorAll('#list-index .cat-note').length === 0);

    /* ---------- the same drag still works on the board ---------- */
    Store.setView('board');
    Store.openList(big.id);
    var target = Store.get().lists.filter(function (l) { return l.name === 'Uncategorized'; })[0];
    Store.openList(target.id);
    Lists.renderIndex();
    document.querySelector('#list-index .cat[data-list-id="' + big.id + '"] .cat-twist').click();
    var beforeTarget = target.items.length;
    var pn = document.querySelectorAll('#list-index .cat-note')[0];
    var col = document.querySelector('#board .list[data-list-id="' + target.id + '"] .list-body');
    dragTo(pn, centre(col));
    ok('a panel note can still be dropped into a column', target.items.length === beforeTarget + 1,
       target.items.length + ' was ' + beforeTarget);
    ok('...and left the category it came from', big.items.length === 11, big.items.length);

    /* ---------- the setting persists ---------- */
    setOpt('canvasListOverflow', 'count');
    setOpt('canvasListRows', 5);
    Store.flush();
    var saved = JSON.parse(localStorage.getItem('flowlist.state.v1'));
    ok('the overflow choice is saved', saved.settings.canvasListOverflow === 'count',
       saved.settings.canvasListOverflow);
    ok('the row cap is saved', saved.settings.canvasListRows === 5, saved.settings.canvasListRows);

  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }

  document.title = 'CANVAS2 ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre');
  pre.id = 'canvas2results';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 500);
