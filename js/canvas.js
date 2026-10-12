/* ============================================================
   Flowlist — Canvas
   A pannable, zoomable surface per canvas: freehand strokes and
   arrows drawn into one SVG layer, cards (free notes, notes
   pulled from a category, whole categories) as DOM on top, and
   connectors between cards that follow them as they move.

   World coordinates are what gets stored. Screen = world * zoom
   + pan, so everything keeps its meaning at any scale.
   ============================================================ */
const Canvas = (function () {
  const wrap = document.getElementById('canvas-wrap');
  const viewport = document.getElementById('canvas-viewport');
  const world = document.getElementById('canvas-world');
  const svg = document.getElementById('canvas-svg');
  const gStrokes = document.getElementById('csvg-strokes');
  const gEdges = document.getElementById('csvg-edges');
  const gLive = document.getElementById('csvg-live');
  const nodesEl = document.getElementById('canvas-nodes');
  const indexEl = document.getElementById('canvas-index');
  const hintEl = document.getElementById('canvas-hint');

  const TOOLS = [
    { key: 'select', name: 'Select & pan', icon: 'cursor', hint: 'Drag a card to move it. Drag empty space — or hold the scroll wheel anywhere — to pan. Drag a card&rsquo;s side dot onto another card to connect them.' },
    { key: 'pen',    name: 'Draw',         icon: 'pencil', hint: 'Draw freehand. Pick a colour and thickness on the left.' },
    { key: 'arrow',  name: 'Arrow',        icon: 'arrowR', hint: 'Drag to pull an arrow. Start on a card and end on another to link them.' },
    { key: 'erase',  name: 'Erase',        icon: 'eraser', hint: 'Click a stroke, arrow or card to remove it.' },
    { key: 'sweep',  name: 'Rub out',      hint: 'Hold the button down and drag over things to rub them out. Every swipe of the pen is its own mark, so you only lose what the brush touches.',
      svg: '<svg viewBox="0 0 24 24" class="ic">' +
        '<path d="M10.5 19H21M7.2 15.4l6-6a2 2 0 0 1 2.8 0l3 3a2 2 0 0 1 0 2.8L16.2 19h-5.4l-3.6-3.6z"/>' +
        '<path d="M2.4 9.6h3.2M1.9 13.6h4M3.4 17.6h2.2" opacity=".5"/></svg>' }
  ];
  /* the drawing palette: eight from the category colours, then white and black */
  const COLORS = Store.PALETTE.slice(0, 8).concat(['#ffffff', '#000000']);
  const COLOR_NAMES = { '#ffffff': 'White', '#000000': 'Black' };
  const WIDTHS = [2, 4, 8, 14];

  let tool = 'select';
  let color = '#5cc8ff';
  let width = 4;
  let live = null;      // in-progress stroke / arrow / node drag / pan
  let selected = null;  // selected node id
  let lastPt = null;    // last pointer position over the canvas — where a paste lands

  const S = () => Store.get();
  const active = () => Store.activeCanvas();

  /* ============================================================
     COORDINATES
     ============================================================ */
  function toWorld(clientX, clientY) {
    const c = active();
    const r = viewport.getBoundingClientRect();
    return {
      x: (clientX - r.left - c.pan.x) / c.zoom,
      y: (clientY - r.top - c.pan.y) / c.zoom
    };
  }
  function applyTransform() {
    const c = active();
    if (!c) return;
    world.style.transform = 'translate(' + c.pan.x + 'px,' + c.pan.y + 'px) scale(' + c.zoom + ')';
    viewport.style.setProperty('--grid-size', (34 * c.zoom) + 'px');
    viewport.style.setProperty('--grid-x', (c.pan.x % (34 * c.zoom)) + 'px');
    viewport.style.setProperty('--grid-y', (c.pan.y % (34 * c.zoom)) + 'px');
    const z = document.getElementById('zoom-label');
    if (z) z.textContent = Math.round(c.zoom * 100) + '%';
  }

  /* ============================================================
     PANEL — the list of canvases
     ============================================================ */
  function renderIndex() {
    const s = S();
    indexEl.innerHTML = '';
    s.canvases.forEach(c => {
      const isActive = c.id === s.activeCanvas && s.view === 'canvas';
      const row = document.createElement('div');
      row.className = 'cat cv-row' + (isActive ? ' is-open' : '');
      row.style.setProperty('--c', c.color);
      const bits = c.nodes.length + c.strokes.length + c.edges.length;
      row.innerHTML =
        '<span class="cat-swatch"></span>' +
        '<span class="cat-name" title="' + UI.esc(c.name) + '">' + UI.esc(c.name) + '</span>' +
        '<span class="cat-meta">' + (bits || '') + '</span>';
      row.onclick = () => Store.openCanvas(c.id);
      row.oncontextmenu = e => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(e.clientX, e.clientY, [
          { label: 'Open', icon: 'layers', onClick: () => Store.openCanvas(c.id) },
          { label: 'Rename', icon: 'pencil', onClick: () => {
              UI.rename(row.getBoundingClientRect(), c.name,
                v => Store.mutate(() => { c.name = v || 'Untitled'; }, ['canvases']));
            } },
          { sep: true },
          { head: 'Colour' },
          { mount: d => d.appendChild(UI.colorBlock(c.color, v =>
              Store.mutate(() => { c.color = v; }, ['canvases']))) },
          { sep: true },
          { label: 'Clear everything on it', icon: 'eraser',
            onClick: () => { if (window.confirm('Clear "' + c.name + '"?')) { Store.openCanvas(c.id); Store.clearCanvas(); } } },
          { label: 'Delete canvas', icon: 'trash', danger: true,
            onClick: () => { if (UI.confirmDelete(c.name)) Store.deleteCanvas(c.id); } }
        ]);
      };
      indexEl.appendChild(row);
    });
  }

  /* ============================================================
     TOOLBAR
     ============================================================ */
  function renderToolbar() {
    const g = id => document.getElementById(id);

    g('ctool-tools').innerHTML = '';
    TOOLS.forEach(t => {
      const b = document.createElement('button');
      b.className = 'ctool' + (tool === t.key ? ' on' : '');
      b.title = t.name;
      b.innerHTML = t.svg || UI.icon(t.icon);
      b.onclick = () => {
        tool = t.key;
        selected = null;
        // the cursor and the hover highlights hang off this, so it moves with the tool
        viewport.dataset.tool = tool;
        if (tool === 'sweep' && lastPt) showRing(lastPt.x, lastPt.y); else hideRing();
        renderToolbar(); renderNodes(); showHint();
      };
      g('ctool-tools').appendChild(b);
    });

    g('ctool-colors').innerHTML = '';
    COLORS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'cswatch' + (color === c ? ' on' : '');
      b.style.setProperty('--c', c);
      b.title = COLOR_NAMES[c] || c;
      b.onclick = () => { color = c; renderToolbar(); };
      g('ctool-colors').appendChild(b);
    });

    /* right at the end of the row of colours, where the two it swaps live */
    const swap = document.createElement('button');
    swap.className = 'ctool cswap';
    swap.id = 'ctool-invert';
    swap.title = 'Swap black and white in everything drawn here';
    swap.innerHTML = '<svg viewBox="0 0 24 24" class="ic">' +
      '<circle cx="12" cy="12" r="8.2"/>' +
      '<path d="M12 3.8a8.2 8.2 0 0 0 0 16.4z" fill="currentColor" stroke="none"/></svg>';
    swap.onclick = invertInk;
    g('ctool-colors').appendChild(swap);

    g('ctool-width').innerHTML = '';
    WIDTHS.forEach(w => {
      const b = document.createElement('button');
      b.className = 'cwidth' + (width === w ? ' on' : '');
      b.title = w + 'px';
      b.innerHTML = '<i style="width:' + Math.min(w + 4, 18) + 'px;height:' + Math.min(w, 12) + 'px"></i>';
      b.onclick = () => { width = w; renderToolbar(); };
      g('ctool-width').appendChild(b);
    });

    g('ctool-add').innerHTML = '';
    [
      { label: 'Note', icon: 'plus', title: 'Drop a note on the canvas', fn: addFreeNote },
      { label: 'List', icon: 'layers', title: 'Place one of your categories', fn: pickList }
    ].forEach(a => {
      const b = document.createElement('button');
      b.className = 'ctool wide';
      b.title = a.title;
      b.innerHTML = UI.icon(a.icon) + '<span>' + a.label + '</span>';
      b.onclick = e => a.fn(e);
      g('ctool-add').appendChild(b);
    });

    g('ctool-zoom').innerHTML =
      '<button class="ctool" id="zoom-out" title="Zoom out">' + UI.icon('minus') + '</button>' +
      '<button class="ctool zoom-label" id="zoom-label" title="Reset to 100%">100%</button>' +
      '<button class="ctool" id="zoom-in" title="Zoom in">' + UI.icon('plus') + '</button>' +
      '<button class="ctool" id="zoom-fit" title="Fit everything on screen">' + UI.icon('expand') + '</button>' +
      '<button class="ctool" id="canvas-focus" title="Hide the side panels">' + UI.icon('focus') + '</button>';

    g('zoom-out').onclick = () => zoomBy(1 / 1.2);
    g('zoom-in').onclick = () => zoomBy(1.2);
    g('zoom-label').onclick = () => setZoom(1);
    g('zoom-fit').onclick = fit;
    g('canvas-focus').onclick = toggleFocus;
    applyTransform();
  }

  /* ============================================================
     BLACK AND WHITE, THE OTHER WAY ROUND

     White marks disappear against a pale theme and black ones against a dark
     one. This swaps every white mark on the canvas for black and every black
     one for white — strokes and arrows alike — and turns the pen round with
     them, so what you draw next matches what you can suddenly see. Since it is
     a straight swap, pressing it again puts everything back.
     ============================================================ */
  const isWhite = c => String(c).toLowerCase() === '#ffffff';
  const isBlack = c => String(c).toLowerCase() === '#000000';
  const flipInk = c => (isWhite(c) ? '#000000' : (isBlack(c) ? '#ffffff' : c));

  function invertInk() {
    const c = active();
    if (!c) return;
    let n = 0;
    Store.canvasEdit(cv => {
      cv.strokes.forEach(s => { const f = flipInk(s.color); if (f !== s.color) { s.color = f; n++; } });
      cv.edges.forEach(e => { const f = flipInk(e.color); if (f !== e.color) { e.color = f; n++; } });
    });
    // the pen goes with them, or the next stroke is invisible all over again
    if (isWhite(color) || isBlack(color)) { color = flipInk(color); renderToolbar(); }
    UI.toast(n
      ? 'Swapped black and white on ' + n + (n === 1 ? ' mark.' : ' marks.')
      : 'Nothing is drawn in black or white here yet.');
  }

  function showHint() {
    const t = TOOLS.find(t => t.key === tool);
    hintEl.innerHTML = t ? t.hint : '';
    hintEl.classList.add('show');
    clearTimeout(showHint._t);
    showHint._t = setTimeout(() => hintEl.classList.remove('show'), 3200);
  }

  /* ============================================================
     ZOOM / PAN
     ============================================================ */
  function setZoom(z, cx, cy) {
    const c = active();
    if (!c) return;
    const next = Math.max(0.25, Math.min(3, z));
    const r = viewport.getBoundingClientRect();
    // keep the point under the cursor (or the middle) pinned while scaling
    const px = cx === undefined ? r.width / 2 : cx - r.left;
    const py = cy === undefined ? r.height / 2 : cy - r.top;
    const wx = (px - c.pan.x) / c.zoom;
    const wy = (py - c.pan.y) / c.zoom;

    Store.canvasEdit(cv => {
      cv.zoom = next;
      cv.pan.x = px - wx * next;
      cv.pan.y = py - wy * next;
    }, { silent: true });
    applyTransform();
    Themes.syncCanvasScale();
  }
  const zoomBy = f => setZoom(active().zoom * f);

  function fit() {
    const c = active();
    if (!c) return;
    const pts = [];
    c.nodes.forEach(n => { pts.push([n.x, n.y], [n.x + n.w, n.y + (n.h || 120)]); });
    c.strokes.forEach(s => { for (let i = 0; i < s.pts.length; i += 2) pts.push([s.pts[i], s.pts[i + 1]]); });
    c.edges.forEach(e => {
      const a = endpoint(c, e.from), b = endpoint(c, e.to);
      if (a) pts.push([a.x, a.y]);
      if (b) pts.push([b.x, b.y]);
    });
    if (!pts.length) { setZoom(1); Store.canvasEdit(cv => { cv.pan = { x: 0, y: 0 }; }, { silent: true }); applyTransform(); return; }

    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    const r = viewport.getBoundingClientRect();
    const pad = 70;
    const z = Math.max(0.25, Math.min(2, Math.min(
      (r.width - pad * 2) / Math.max(1, maxX - minX),
      (r.height - pad * 2) / Math.max(1, maxY - minY)
    )));
    Store.canvasEdit(cv => {
      cv.zoom = z;
      cv.pan.x = r.width / 2 - ((minX + maxX) / 2) * z;
      cv.pan.y = r.height / 2 - ((minY + maxY) / 2) * z;
    }, { silent: true });
    applyTransform();
    Themes.syncCanvasScale();
  }

  /* the board's top bar has the same control; both run the one implementation
     in app.js, which remembers each surface separately */
  const toggleFocus = () => App.toggleFocus();

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    const c = active();
    if (!c) return;
    renderIndex();
    if (S().view !== 'canvas') return;
    renderStrokes(c);
    renderEdges(c);
    renderNodes();
    applyTransform();
    viewport.classList.toggle('grid', !!Store.settings().canvasGrid);
    viewport.dataset.tool = tool;
  }

  function renderStrokes(c) {
    gStrokes.innerHTML = '';
    c.strokes.forEach(s => gStrokes.appendChild(strokeEl(s)));
  }

  function strokeEl(s) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const pts = [];
    for (let i = 0; i < s.pts.length; i += 2) pts.push(s.pts[i] + ',' + s.pts[i + 1]);
    p.setAttribute('points', pts.join(' '));
    p.setAttribute('stroke', s.color);
    p.setAttribute('stroke-width', s.width);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    p.classList.add('cstroke');
    p.dataset.strokeId = s.id;
    return p;
  }

  /** An edge endpoint resolves either to a fixed point or to a node's centre. */
  function endpoint(c, ref) {
    if (!ref) return null;
    if (ref.node) {
      const n = c.nodes.find(x => x.id === ref.node);
      if (!n) return null;
      return { x: n.x + n.w / 2, y: n.y + (n.h || 120) / 2, node: n };
    }
    return { x: ref.x, y: ref.y };
  }

  /** Pull the line back to the edge of a node's box so it doesn't sit under it. */
  function trim(from, to) {
    if (!from.node) return from;
    const n = from.node;
    const hw = n.w / 2, hh = (n.h || 120) / 2;
    const dx = to.x - from.x, dy = to.y - from.y;
    if (!dx && !dy) return from;
    const scale = Math.min(
      hw / Math.max(Math.abs(dx), 0.001),
      hh / Math.max(Math.abs(dy), 0.001)
    );
    return { x: from.x + dx * scale, y: from.y + dy * scale };
  }

  const NS = 'http://www.w3.org/2000/svg';

  /* SVG marker fill can't reliably take the line's colour across browsers, so
     the head is drawn as its own stroked path instead. */
  function arrowHead(tip, fromPt, color, width) {
    const ang = Math.atan2(tip.y - fromPt.y, tip.x - fromPt.x);
    const len = 6 + width * 1.6;
    const spread = 0.42;
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d',
      'M' + (tip.x - Math.cos(ang - spread) * len) + ' ' + (tip.y - Math.sin(ang - spread) * len) +
      ' L' + tip.x + ' ' + tip.y +
      ' L' + (tip.x - Math.cos(ang + spread) * len) + ' ' + (tip.y - Math.sin(ang + spread) * len));
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', width);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    // the head counts as part of the arrow, so either eraser can catch it
    p.classList.add('cedge');
    return p;
  }

  /** The curve plus its head, as one group. */
  function edgeShape(p1, p2, color, width, arrow, curved) {
    const g = document.createElementNS(NS, 'g');
    const line = document.createElementNS(NS, 'path');
    let ctrl = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    if (curved) {
      // a gentle bow reads better than a dead-straight line between boxes
      const nx = -(p2.y - p1.y), ny = (p2.x - p1.x);
      const len = Math.hypot(nx, ny) || 1;
      const bow = Math.min(28, len * 0.12);
      ctrl = { x: ctrl.x + nx / len * bow, y: ctrl.y + ny / len * bow };
      line.setAttribute('d', 'M' + p1.x + ' ' + p1.y + ' Q' + ctrl.x + ' ' + ctrl.y + ' ' + p2.x + ' ' + p2.y);
    } else {
      line.setAttribute('d', 'M' + p1.x + ' ' + p1.y + ' L' + p2.x + ' ' + p2.y);
    }
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', width);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-linecap', 'round');
    line.classList.add('cedge');
    g.appendChild(line);
    if (arrow) g.appendChild(arrowHead(p2, ctrl, color, width));
    return g;
  }

  function renderEdges(c) {
    gEdges.innerHTML = '';
    c.edges.forEach(e => {
      const a = endpoint(c, e.from), b = endpoint(c, e.to);
      if (!a || !b) return;
      const g = edgeShape(trim(a, b), trim(b, a), e.color, e.width, e.arrow, true);
      g.querySelectorAll('.cedge').forEach(p => { p.dataset.edgeId = e.id; });
      gEdges.appendChild(g);
    });
  }

  function renderNodes() {
    const c = active();
    nodesEl.innerHTML = '';
    c.nodes.forEach(n => nodesEl.appendChild(nodeEl(n)));
  }

  function nodeEl(n) {
    const el = document.createElement('div');
    el.className = 'cnode cnode-' + n.kind + (selected === n.id ? ' selected' : '');
    el.dataset.nodeId = n.id;
    el.style.left = n.x + 'px';
    el.style.top = n.y + 'px';
    el.style.width = n.w + 'px';

    if (n.kind === 'list') {
      const list = Store.listById(n.listId);
      if (!list) { el.classList.add('cnode-missing'); el.innerHTML = '<div class="cn-head">Category deleted</div>'; return el; }
      el.style.setProperty('--c', list.color);
      const set = Store.settings();
      const cap = Math.max(1, set.canvasListRows || 8);
      const scrolls = set.canvasListOverflow === 'scroll';
      const items = scrolls ? list.items : list.items.slice(0, cap);
      const hidden = list.items.length - items.length;

      el.innerHTML =
        '<div class="cn-head"><span class="cn-dot"></span><b>' + UI.esc(list.name) + '</b>' +
        '<span class="cn-count">' + list.items.filter(i => !i.done).length + '</span></div>' +
        '<div class="cn-items' + (scrolls && list.items.length > cap ? ' scrolls' : '') + '"' +
          (scrolls ? ' style="max-height:' + (cap * 26 + 8) + 'px"' : '') + '>' +
          (items.length
            ? items.map(i => '<div class="cn-item' + (i.done ? ' done' : '') + '" data-item-id="' + i.id + '">' +
                '<span class="cn-tick"></span><span class="cn-item-text">' + UI.esc(i.text || 'Untitled') + '</span>' +
                '<button class="cn-pop" title="Pull this note onto the canvas">' + UI.icon('arrowUpRight') + '</button></div>').join('')
            : '<div class="cn-empty">empty</div>') +
          (hidden > 0 ? '<div class="cn-more">+' + hidden + ' more</div>' : '') +
        '</div>';

      el.querySelectorAll('.cn-pop').forEach(b => {
        b.onclick = ev => {
          ev.stopPropagation();
          popOut(n, list.id, b.closest('.cn-item').dataset.itemId);
        };
      });
      // drag a row straight out of the card to place it anywhere
      el.querySelectorAll('.cn-item').forEach(row => {
        row.addEventListener('pointerdown', ev => {
          if (ev.button !== 0) return;            // the middle button pans instead
          if (ev.target.closest('.cn-pop')) return;
          ev.stopPropagation();
          DND.start(ev, {
            el: row, kind: 'note', axis: 'y',
            payload: { listId: list.id, itemId: row.dataset.itemId, fromNode: n.id }
          });
        });
      });
    } else if (n.kind === 'ref') {
      const list = Store.listById(n.listId);
      const item = Store.itemById(n.listId, n.itemId);
      if (!item) { el.classList.add('cnode-missing'); el.innerHTML = '<div class="cn-head">Note deleted</div>'; return el; }
      el.style.setProperty('--c', (list && list.color) || '#8fb7ff');
      el.innerHTML =
        '<div class="cn-body' + (item.done ? ' done' : '') + '">' + UI.esc(item.text || 'Untitled') + '</div>' +
        '<div class="cn-foot"><span class="cn-dot"></span>' + UI.esc(list ? list.name : '') +
        (item.hour ? '<span class="cn-time">' + UI.hourLabel(item.hour) + '</span>' : '') + '</div>';
    } else if (n.kind === 'image') {
      /* The file is untouched — the box around it is the only thing that scales. */
      const pic = document.createElement('img');
      pic.className = 'cn-img';
      pic.alt = '';
      pic.draggable = false;        // or the browser starts a drag of its own
      pic.src = n.src || '';
      el.appendChild(pic);
    } else {
      el.style.setProperty('--c', n.color || '#f2c94c');
      // the grip is what you drag; the textarea keeps the pointer for typing
      el.innerHTML = '<div class="cn-grip" title="Drag to move"></div>' +
        '<textarea class="cn-text" placeholder="Type here…" spellcheck="false"></textarea>';
      const ta = el.querySelector('.cn-text');
      ta.value = n.text || '';
      ta.addEventListener('input', () => {
        Store.canvasEdit(() => { n.text = ta.value; }, { silent: true });
      });
      // the textarea only keeps the pointer for typing; with pen/arrow/erase
      // in hand the canvas must still get the event so you can draw over a note
      // the middle button is never typing — it belongs to the canvas, for panning
      ta.addEventListener('pointerdown', ev => { if (tool === 'select' && ev.button === 0) ev.stopPropagation(); });
    }

    // four connector nubs
    if (tool === 'select') {
      ['t', 'r', 'b', 'l'].forEach(side => {
        const h = document.createElement('span');
        h.className = 'cn-port cn-port-' + side;
        h.dataset.side = side;
        el.appendChild(h);
      });
    }

    el.oncontextmenu = ev => { ev.preventDefault(); ev.stopPropagation(); nodeMenu(ev, n); };
    return el;
  }

  function nodeMenu(e, n) {
    const items = [
      { label: 'Bring to front', icon: 'arrowUp', onClick: () => Store.canvasEdit(c => {
          c.nodes = c.nodes.filter(x => x.id !== n.id).concat([n]);
        }) },
      { sep: true }
    ];
    if (n.kind === 'note') {
      items.push({ head: 'Colour' });
      items.push({ mount: d => d.appendChild(UI.colorBlock(n.color, v => Store.canvasEdit(() => { n.color = v; }))) });
      items.push({ sep: true });
    }
    if (n.kind === 'list') {
      items.push({ label: 'Pull every note onto the canvas', icon: 'layers', onClick: () => explode(n) });
      items.push({ label: 'Open this category on the board', icon: 'grid', onClick: () => { Store.setView('board'); Lists.tryOpen(n.listId); } });
      items.push({ sep: true });
    }
    if (n.kind === 'ref') {
      const item = Store.itemById(n.listId, n.itemId);
      if (item) {
        items.push({ label: item.done ? 'Mark not done' : 'Mark done', icon: 'check',
          onClick: () => Store.setDone(n.listId, n.itemId) });
        items.push({ sep: true });
      }
    }
    if (n.kind === 'image') {
      items.push({ head: 'Size' });
      items.push({ label: 'Smaller', icon: 'minus', onClick: () => scaleImage(n, 0.8) });
      items.push({ label: 'Bigger', icon: 'plus', onClick: () => scaleImage(n, 1.25) });
      items.push({ label: 'Its own full size', icon: 'expand', onClick: () => scaleImageTo(n, 1) });
      items.push({ sep: true });
    }
    items.push({ label: 'Remove from canvas', icon: 'trash', danger: true, onClick: () => Store.removeNode(n.id) });
    UI.menu(e.clientX, e.clientY, items);
  }

  /* ============================================================
     ADDING THINGS
     ============================================================ */
  function centreOfView() {
    const r = viewport.getBoundingClientRect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  }

  /** The toolbar button: a note in the middle of whatever you are looking at. */
  function addFreeNote() { addNoteAt(null); }

  function pickList(e) {
    const lists = S().lists;
    if (!lists.length) { UI.toast('No categories yet — make one in the Lists panel.'); return; }
    UI.menu(e.clientX, e.clientY, [{ head: 'Place a category' }].concat(
      lists.map(l => ({
        label: l.name, icon: 'layers',
        onClick: () => {
          const p = centreOfView();
          Store.addNode({ kind: 'list', listId: l.id, x: Math.round(p.x - 120), y: Math.round(p.y - 90), w: 240, h: 180 });
          render();
        }
      }))
    ));
  }

  function dropList(listId, clientX, clientY) {
    const p = toWorld(clientX, clientY);
    Store.addNode({ kind: 'list', listId: listId, x: Math.round(p.x - 120), y: Math.round(p.y - 40), w: 240, h: 180 });
    render();
    UI.toast('Placed on the canvas.');
  }

  /** A single note dropped on the canvas becomes a card at that spot. */
  function dropNote(payload, clientX, clientY) {
    const c = active();
    const existing = c.nodes.find(n => n.kind === 'ref' && n.itemId === payload.itemId);
    const p = toWorld(clientX, clientY);
    if (existing) {
      Store.canvasEdit(() => { existing.x = Math.round(p.x - 95); existing.y = Math.round(p.y - 42); });
      UI.toast('Already here — moved it instead.');
      return;
    }
    const n = Store.addNode({
      kind: 'ref', listId: payload.listId, itemId: payload.itemId,
      x: Math.round(p.x - 95), y: Math.round(p.y - 42), w: 190, h: 84
    });
    // dropped off a category card? keep the thread back to it
    if (payload.fromNode && c.nodes.some(x => x.id === payload.fromNode)) {
      const list = Store.listById(payload.listId);
      Store.addEdge({ node: payload.fromNode }, { node: n.id }, (list && list.color) || '#8fb7ff', 2);
    }
    render();
  }

  function popOut(listNode, listId, itemId) {
    const c = active();
    if (c.nodes.some(n => n.kind === 'ref' && n.itemId === itemId)) { UI.toast('Already on this canvas.'); return; }
    const n = Store.addNode({
      kind: 'ref', listId: listId, itemId: itemId,
      x: Math.round(listNode.x + listNode.w + 70),
      y: Math.round(listNode.y + Math.random() * 90),
      w: 190, h: 84
    });
    Store.addEdge({ node: listNode.id }, { node: n.id }, Store.listById(listId).color, 2);
    render();
  }

  function explode(listNode) {
    const list = Store.listById(listNode.listId);
    if (!list || !list.items.length) { UI.toast('Nothing in that category yet.'); return; }
    const c = active();
    const R = 260 + list.items.length * 8;
    list.items.forEach((item, i) => {
      if (c.nodes.some(n => n.kind === 'ref' && n.itemId === item.id)) return;
      const a = (-Math.PI / 2) + (i / list.items.length) * Math.PI * 2;
      const n = Store.addNode({
        kind: 'ref', listId: list.id, itemId: item.id,
        x: Math.round(listNode.x + listNode.w / 2 + Math.cos(a) * R - 95),
        y: Math.round(listNode.y + 90 + Math.sin(a) * R * 0.62 - 42),
        w: 190, h: 84
      });
      Store.addEdge({ node: listNode.id }, { node: n.id }, list.color, 2);
    });
    render();
    fit();
  }

  /* ============================================================
     PICTURES

     A pasted photo is kept exactly as it arrived — the data URL is never
     re-encoded — and only the box it sits in is scaled. So the size setting
     costs nothing in quality, and a picture dropped in small can be pushed
     back up to its own pixels later with nothing lost.
     ============================================================ */

  /** Where a paste should land: under the pointer, or the middle of the view. */
  function pastePoint(pt) {
    return pt ? toWorld(pt.x, pt.y) : centreOfView();
  }

  function readImage(blob, pt) {
    if (!blob) return;
    const fr = new FileReader();
    fr.onload = () => placeImage(fr.result, pt);
    fr.onerror = () => UI.toast('That picture could not be read.');
    fr.readAsDataURL(blob);
  }

  function placeImage(src, pt) {
    const img = new Image();
    img.onload = () => {
      const scale = Math.max(0.05, (Store.settings().pasteScale || 100) / 100);
      // the width is what the setting scales; the height only ever follows it
      const w = Math.max(24, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(w * (img.naturalHeight / img.naturalWidth)));
      const p = pastePoint(pt);
      const n = Store.addNode({
        kind: 'image', src: src,
        nw: img.naturalWidth, nh: img.naturalHeight,
        x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2), w: w, h: h
      });
      /* A photo is far bigger than anything else here and the browser keeps
         only about 5 MB per site, so find out now rather than quietly losing
         the whole board at some later save. */
      if (!Store.flush()) {
        Store.removeNode(n.id);
        UI.toast('Too big to keep — this browser stores about 5 MB in all.');
        return;
      }
      selected = n.id;
      render();
      UI.toast('Pasted at ' + Math.round(scale * 100) + '%.');
    };
    img.onerror = () => UI.toast('That did not look like a picture.');
    img.src = src;
  }

  /** Ctrl+V anywhere on the canvas. */
  function onPaste(e) {
    if (S().view !== 'canvas') return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    let file = null, words = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) {
        file = file || items[i].getAsFile();
      }
      if (items[i].kind === 'string' && items[i].type === 'text/plain') words = true;
    }
    if (!file) return;
    // mid-sentence in a note and the clipboard has words in it: they meant the words
    const el = document.activeElement;
    if (words && el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    e.preventDefault();
    readImage(file, lastPt);
  }

  /** The right-click version, which has to ask the browser for the clipboard. */
  function pasteFromClipboard(pt) {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      UI.toast('Press Ctrl+V and it will land here.');
      return;
    }
    navigator.clipboard.read().then(items => {
      for (let i = 0; i < items.length; i++) {
        const type = items[i].types.filter(t => t.indexOf('image/') === 0)[0];
        if (type) { items[i].getType(type).then(b => readImage(b, pt)); return; }
      }
      UI.toast('There is no picture on the clipboard.');
    }).catch(() => UI.toast('The browser would not hand the clipboard over — press Ctrl+V instead.'));
  }

  const clampW = w => Math.max(24, Math.min(6000, Math.round(w)));

  /** Scale about the middle, so a picture does not walk off as it grows. */
  function scaleImage(n, f) { scaleImageTo(n, (n.w * f) / (n.nw || n.w)); }

  function scaleImageTo(n, scale) {
    const w = clampW((n.nw || n.w) * scale);
    const h = Math.round(w * ((n.nh || n.h || 1) / (n.nw || n.w || 1)));
    Store.canvasEdit(() => {
      n.x = Math.round(n.x + (n.w - w) / 2);
      n.y = Math.round(n.y + ((n.h || 0) - h) / 2);
      n.w = w; n.h = h;
    });
  }

  /** Right-click on bare canvas. */
  function backgroundMenu(e) {
    lastPt = { x: e.clientX, y: e.clientY };
    const pt = lastPt;
    UI.menu(e.clientX, e.clientY, [
      { label: 'Paste a picture here', icon: 'image', onClick: () => pasteFromClipboard(pt) },
      { label: 'Add a note here', icon: 'plus', onClick: () => addNoteAt(pt) },
      { sep: true },
      { label: 'Fit everything on screen', icon: 'expand', onClick: fit },
      { label: 'Back to 100%', icon: 'canvas', onClick: () => setZoom(1) }
    ]);
  }

  function addNoteAt(pt) {
    const p = pastePoint(pt);
    const n = Store.addNode({ kind: 'note', x: Math.round(p.x - 105), y: Math.round(p.y - 60), w: 210, h: 120, text: '', color: color });
    selected = n.id;
    render();
    requestAnimationFrame(() => {
      const ta = nodesEl.querySelector('[data-node-id="' + n.id + '"] .cn-text');
      if (ta) ta.focus();
    });
  }

  /* ============================================================
     POINTER INTERACTION
     ============================================================ */
  function onPointerDown(e) {
    if (e.pointerType === 'touch') {
      dropStale(e.timeStamp || Date.now());
      lastTouchAt = e.timeStamp || Date.now();
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      capture(e);
      if (touches.size >= 2) { startPinch(); return; }
      if (pinchLock) return;          /* a leftover finger must not draw */
    }
    /* Holding the scroll wheel down drags the canvas about, whichever tool is
       in hand and wherever it started — the same as dragging empty space. */
    if (e.button === 1) { startPan(e); return; }
    if (e.button !== 0) return;
    const c = active();
    if (!c) return;

    const nodeDom = e.target.closest('.cnode');
    const port = e.target.closest('.cn-port');
    const strokeDom = e.target.closest('.cstroke');
    const edgeDom = e.target.closest('.cedge');

    if (tool === 'erase') {
      if (strokeDom) Store.removeStroke(strokeDom.dataset.strokeId);
      else if (edgeDom) Store.removeEdge(edgeDom.dataset.edgeId);
      else if (nodeDom) Store.removeNode(nodeDom.dataset.nodeId);
      return;
    }

    if (tool === 'sweep') { startSweep(e); return; }

    if (tool === 'pen') { startStroke(e); return; }

    if (tool === 'arrow') { startArrow(e, nodeDom ? nodeDom.dataset.nodeId : null); return; }

    /* select tool */
    if (port && nodeDom) { startArrow(e, nodeDom.dataset.nodeId); return; }
    if (nodeDom) {
      // over a scrolling item list, leave the pointer alone so it can scroll —
      // the card is still draggable by its header
      const box = e.target.closest('.cn-items');
      if (box && box.scrollHeight > box.clientHeight + 2) return;
      startNodeDrag(e, nodeDom);
      return;
    }
    selected = null;
    renderNodes();
    startPan(e);
  }

  /* ============================================================
     RUBBING OUT BY DRAGGING

     Hold the button down and drag: whatever the brush passes over goes.

     The unit is one thing, not one area — a stroke is a single swipe of the
     pen, from putting it down to lifting it up, so a house drawn in six
     swipes loses only the swipes you actually touch. Cards and arrows go the
     same way, one at a time.

     Nothing is written to the store until the button comes up, so a whole
     sweep is one change; the marks leave the screen as you touch them.
     ============================================================ */
  const SWEEP_R = 8;      // how far from the middle of the brush still counts
  const SWEEP_STEP = 5;   // sample this often along the drag, in screen px
  const ring = document.getElementById('sweep-ring');

  function showRing(x, y) {
    const r = viewport.getBoundingClientRect();
    ring.style.left = (x - r.left) + 'px';
    ring.style.top = (y - r.top) + 'px';
    ring.classList.add('on');
  }
  const hideRing = () => ring.classList.remove('on');

  function startSweep(e) {
    live = { kind: 'sweep', strokes: [], edges: [], nodes: [], px: e.clientX, py: e.clientY };
    viewport.classList.add('sweeping');
    sweepAt(e.clientX, e.clientY);
    capture(e);
  }

  /**
   * What the brush covers at one spot. Only the topmost thing at each sample
   * is taken, so something lying under a card is not carried off with it.
   */
  function sweepAt(x, y) {
    const around = [[0, 0], [SWEEP_R, 0], [-SWEEP_R, 0], [0, SWEEP_R], [0, -SWEEP_R]];
    around.forEach(o => {
      const els = document.elementsFromPoint(x + o[0], y + o[1]);
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (!el || !el.classList) continue;
        if (el.classList.contains('cstroke')) { take(live.strokes, el.dataset.strokeId, el); return; }
        if (el.classList.contains('cedge')) { take(live.edges, el.dataset.edgeId, el.parentNode); return; }
        const card = el.closest ? el.closest('.cnode') : null;
        if (card) { take(live.nodes, card.dataset.nodeId, card); return; }
      }
    });
  }

  /** Off the screen at once; out of the canvas when the button comes up. */
  function take(bucket, id, dom) {
    if (!id || bucket.indexOf(id) !== -1) return;
    bucket.push(id);
    if (dom && dom.parentNode) dom.parentNode.removeChild(dom);
  }

  function commitSweep(l) {
    if (!l.strokes.length && !l.edges.length && !l.nodes.length) { render(); return; }
    Store.canvasEdit(c => {
      c.strokes = c.strokes.filter(s => l.strokes.indexOf(s.id) === -1);
      c.nodes = c.nodes.filter(n => l.nodes.indexOf(n.id) === -1);
      // an arrow with nothing left to hold on to goes as well
      c.edges = c.edges.filter(e => l.edges.indexOf(e.id) === -1 &&
        l.nodes.indexOf(e.from.node) === -1 && l.nodes.indexOf(e.to.node) === -1);
    });
    // the one thing worth saying, because it is the one thing people worry about
    if (l.nodes.length) UI.toast('Off the canvas — the notes themselves are untouched.');
  }

  /* ---------- pan ---------- */
  function startPan(e) {
    const c = active();
    live = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: c.pan.x, oy: c.pan.y };
    viewport.classList.add('panning');
    capture(e);
  }

  /* ---------- freehand ---------- */
  function startStroke(e) {
    const p = toWorld(e.clientX, e.clientY);
    live = { kind: 'stroke', pts: [round(p.x), round(p.y)] };
    live.el = strokeEl({ id: 'live', color: color, width: width, pts: live.pts });
    gLive.appendChild(live.el);
    capture(e);
  }

  /* ---------- arrow ---------- */
  function startArrow(e, fromNodeId) {
    const p = toWorld(e.clientX, e.clientY);
    live = {
      kind: 'arrow',
      from: fromNodeId ? { node: fromNodeId } : { x: round(p.x), y: round(p.y) },
      to: { x: round(p.x), y: round(p.y) }
    };
    capture(e);
  }

  /* ---------- node drag ---------- */
  function startNodeDrag(e, dom) {
    const c = active();
    const n = c.nodes.find(x => x.id === dom.dataset.nodeId);
    if (!n) return;
    const p = toWorld(e.clientX, e.clientY);
    live = {
      kind: 'node', node: n, dom: dom, dx: p.x - n.x, dy: p.y - n.y, moved: false,
      startX: n.x, startY: n.y,        /* so a pinch can put it back */
      gw: dom.offsetWidth, ghostOn: false
    };
    selected = n.id;
    dom.classList.add('dragging');
    Remove.arm('canvas');   // the open panels become a "take it off" target
    capture(e);
  }

  /* The canvas clips at its own edge, so a card dragged over the panels would
     vanish under them. Once it crosses the line we float a copy on top so you
     can still see what you are about to drop. */
  const ghostEl = document.getElementById('dnd-ghost');

  function showCardGhost(x, y) {
    if (!live) return;
    if (!live.ghostOn) {
      const clone = live.dom.cloneNode(true);
      // cloneNode copies a textarea's markup, not what was typed into it
      const src = live.dom.querySelectorAll('textarea');
      const dst = clone.querySelectorAll('textarea');
      src.forEach((t, i) => { if (dst[i]) dst[i].value = t.value; });
      clone.classList.remove('dragging', 'about-to-go', 'selected');
      clone.style.position = 'static';
      clone.style.left = clone.style.top = 'auto';
      clone.style.width = live.gw + 'px';
      ghostEl.innerHTML = '';
      ghostEl.appendChild(clone);
      ghostEl.classList.add('on');
      live.ghostOn = true;
    }
    ghostEl.style.transform = 'translate(' + (x - live.gw / 2) + 'px,' + (y - 16) + 'px)';
  }

  function hideCardGhost() {
    ghostEl.classList.remove('on');
    ghostEl.innerHTML = '';
    if (live) live.ghostOn = false;
  }

  function capture(e) {
    // a pointer that is already gone (or synthetic) has no capture to take
    try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (e.cancelable) e.preventDefault();
  }

  /* ============================================================
     TWO FINGERS

     Any two fingers on the canvas mean zoom, whatever tool is in hand.
     The first finger may already be part-way through a stroke or dragging
     a card when the second lands, so that half-finished thing is undone
     before the pinch starts — a pinch should never leave a stray mark or
     a card in the wrong place.

     Moving both fingers together pans at the same time, so getting
     somewhere and getting closer to it are one gesture rather than two.
     ============================================================ */
  const touches = new Map();      // live touch pointers, by id
  let pinch = null;               // set while two or more are down
  let pinchLock = false;          // stays on until every finger has lifted
  let lastTouchAt = 0;

  /* A finger that never reports lifting — the browser swallowing the end of
     a gesture, a phone deciding the touch belonged to something else —
     would leave the tally above permanently non-empty, and the canvas
     unable to draw until the page was reloaded. If nothing has been heard
     from any finger in a good while, the ones on the books are gone. */
  const STALE_MS = 4000;
  function dropStale(now) {
    if (!touches.size) return;
    if (now - lastTouchAt < STALE_MS) return;
    touches.clear();
    pinch = null;
    pinchLock = false;
    viewport.classList.remove("pinching");
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  /** Undo whatever one finger had started, leaving nothing behind. */
  function cancelLive() {
    if (!live) return;
    const l = live;
    live = null;
    viewport.classList.remove('panning', 'sweeping');
    gLive.innerHTML = '';
    nodesEl.querySelectorAll('.cnode.link-target').forEach(el => el.classList.remove('link-target'));

    if (l.kind === 'node') {
      l.dom.classList.remove('dragging', 'about-to-go');
      hideCardGhost();
      Remove.disarm();
      /* put the card back: a pinch is not a move */
      if (l.moved && l.startX !== undefined) {
        Store.canvasEdit(cv => {
          const n = (cv.nodes || []).find(n => n.id === l.node.id);
          if (n) { n.x = l.startX; n.y = l.startY; }
        });
        return;
      }
    }
    if (l.kind === 'sweep') { commitSweep(l); return; }   // already rubbed out; keep it
    render();
  }

  function firstTwo() {
    const it = touches.values();
    return [it.next().value, it.next().value];
  }

  function startPinch() {
    const c = active();
    if (!c) return;
    cancelLive();
    const [a, b] = firstTwo();
    pinch = {
      d0: Math.max(1, dist(a, b)),
      m0: mid(a, b),
      z0: c.zoom,
      pan0: { x: c.pan.x, y: c.pan.y }
    };
    pinchLock = true;
    viewport.classList.add('pinching');
  }

  function movePinch() {
    if (!pinch || touches.size < 2) return;
    const c = active();
    if (!c) return;
    const [a, b] = firstTwo();
    const m1 = mid(a, b);
    const z1 = Math.max(0.25, Math.min(3, pinch.z0 * (dist(a, b) / pinch.d0)));

    const r = viewport.getBoundingClientRect();
    /* the world point that sat under the middle of the two fingers when
       they went down stays under the middle of them now */
    const wx = (pinch.m0.x - r.left - pinch.pan0.x) / pinch.z0;
    const wy = (pinch.m0.y - r.top - pinch.pan0.y) / pinch.z0;

    Store.canvasEdit(cv => {
      cv.zoom = z1;
      cv.pan.x = (m1.x - r.left) - wx * z1;
      cv.pan.y = (m1.y - r.top) - wy * z1;
    }, { silent: true });
    applyTransform();
    Themes.syncCanvasScale();
  }

  function endPinch() {
    if (!pinch) return;
    pinch = null;
    viewport.classList.remove('pinching');
    Store.canvasEdit(() => {});     // commit where we ended up
  }

  function onPointerMove(e) {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      lastTouchAt = e.timeStamp || Date.now();
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch) { movePinch(); return; }
    }
    lastPt = { x: e.clientX, y: e.clientY };    // remember it, for pasting
    if (tool === 'sweep') showRing(e.clientX, e.clientY);
    if (!live) return;
    const c = active();

    if (live.kind === 'sweep') {
      // walk the gap since the last event, so a quick flick cannot jump over things
      const dx = e.clientX - live.px, dy = e.clientY - live.py;
      const steps = Math.min(60, Math.max(1, Math.round(Math.hypot(dx, dy) / SWEEP_STEP)));
      for (let i = 1; i <= steps; i++) sweepAt(live.px + dx * i / steps, live.py + dy * i / steps);
      live.px = e.clientX; live.py = e.clientY;
      return;
    }

    if (live.kind === 'pan') {
      Store.canvasEdit(cv => {
        cv.pan.x = live.ox + (e.clientX - live.sx);
        cv.pan.y = live.oy + (e.clientY - live.sy);
      }, { silent: true });
      applyTransform();
      return;
    }

    if (live.kind === 'stroke') {
      const p = toWorld(e.clientX, e.clientY);
      const n = live.pts.length;
      // skip points that barely moved — keeps the stored path small
      if (n >= 2 && Math.hypot(p.x - live.pts[n - 2], p.y - live.pts[n - 1]) < 2 / c.zoom) return;
      live.pts.push(round(p.x), round(p.y));
      const out = [];
      for (let i = 0; i < live.pts.length; i += 2) out.push(live.pts[i] + ',' + live.pts[i + 1]);
      live.el.setAttribute('points', out.join(' '));
      return;
    }

    if (live.kind === 'arrow') {
      const p = toWorld(e.clientX, e.clientY);
      live.to = { x: round(p.x), y: round(p.y) };
      const hoverDom = document.elementFromPoint(e.clientX, e.clientY);
      const overNode = hoverDom && hoverDom.closest ? hoverDom.closest('.cnode') : null;
      live.overNode = (overNode && overNode.dataset.nodeId !== (live.from.node || '')) ? overNode.dataset.nodeId : null;
      nodesEl.querySelectorAll('.cnode.link-target').forEach(el => el.classList.remove('link-target'));
      if (live.overNode) nodesEl.querySelector('[data-node-id="' + live.overNode + '"]').classList.add('link-target');

      const a = endpoint(c, live.from) || live.from;
      const b = live.overNode ? endpoint(c, { node: live.overNode }) : live.to;
      gLive.innerHTML = '';
      gLive.appendChild(edgeShape(trim(a, b), trim(b, a), color, width, true, false));
      return;
    }

    if (live.kind === 'node') {
      const p = toWorld(e.clientX, e.clientY);
      live.moved = true;
      Store.canvasEdit(() => {
        live.node.x = round(p.x - live.dx);
        live.node.y = round(p.y - live.dy);
      }, { silent: true });
      live.dom.style.left = live.node.x + 'px';
      live.dom.style.top = live.node.y + 'px';
      renderEdges(c);   // connectors follow the card
      const overPanels = Remove.hover(e.clientX, e.clientY);
      live.dom.classList.toggle('about-to-go', overPanels);
      if (overPanels) showCardGhost(e.clientX, e.clientY);
      else if (live.ghostOn) hideCardGhost();
    }
  }

  function onPointerUp(e) {
    if (e.pointerType === 'touch') {
      lastTouchAt = e.timeStamp || Date.now();
      touches.delete(e.pointerId);
      if (pinch && touches.size < 2) endPinch();
      if (touches.size === 0) pinchLock = false;
      else if (pinchLock) return;
    }
    if (!live) return;
    const l = live;
    live = null;
    viewport.classList.remove('panning', 'sweeping');
    gLive.innerHTML = '';
    nodesEl.querySelectorAll('.cnode.link-target').forEach(el => el.classList.remove('link-target'));

    if (l.kind === 'pan') { Store.canvasEdit(() => {}); return; }

    if (l.kind === 'sweep') { commitSweep(l); return; }

    if (l.kind === 'stroke') {
      if (l.pts.length >= 4) Store.addStroke({ color: color, width: width, pts: l.pts });
      else render();
      return;
    }

    if (l.kind === 'arrow') {
      const to = l.overNode ? { node: l.overNode } : l.to;
      const far = l.from.node
        ? !!l.overNode
        : Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y) > 12;
      if (far || l.overNode) Store.addEdge(l.from, to, color, width);
      else render();
      if (tool === 'select') UI.toast('Linked.');
      return;
    }

    if (l.kind === 'node') {
      l.dom.classList.remove('dragging', 'about-to-go');
      const overPanels = Remove.isOver(e.clientX, e.clientY);
      hideCardGhost();
      Remove.disarm();
      if (overPanels && l.moved) {
        const kind = l.node.kind;
        Store.removeNode(l.node.id);
        selected = null;
        UI.toast(kind === 'list'
          ? 'Off the canvas — the category is untouched.'
          : 'Off the canvas — the note is still in its category.');
        return;
      }
      Store.canvasEdit(() => {});   // commit the position and repaint
    }
  }

  const round = v => Math.round(v * 10) / 10;

  /* ============================================================
     WHEEL
     ============================================================ */
  function onWheel(e) {
    // anything scrollable under the pointer — a category card's list, the text
    // inside a note — gets the wheel first, and only hands it back at its end
    const box = e.target.closest && e.target.closest('.cn-items, .cn-text');
    if (box && !e.ctrlKey && !e.metaKey && box.scrollHeight > box.clientHeight + 2) {
      const atTop = box.scrollTop <= 0;
      const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
      if (!((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atEnd))) return;
    }
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      setZoom(active().zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
    } else {
      Store.canvasEdit(cv => {
        cv.pan.x -= e.deltaX;
        cv.pan.y -= e.deltaY;
      }, { silent: true });
      applyTransform();
    }
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    Store.on('canvas', render);
    Store.on('canvases', () => { renderIndex(); render(); });
    Store.on('view', render);
    Store.on('lists', renderIndex);
    Store.on('*', render);

    document.getElementById('btn-add-canvas').onclick = e => {
      const c = Store.addCanvas('Untitled');
      UI.rename(e.target.getBoundingClientRect(), '',
        v => Store.mutate(() => { c.name = v || 'Untitled'; }, ['canvases']), 'Name this canvas');
    };
    document.getElementById('btn-back-to-board').onclick = () => Store.setView('board');

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerUp);
    viewport.addEventListener('pointerleave', hideRing);
    viewport.addEventListener('wheel', onWheel, { passive: false });

    /* Right-click on bare canvas: paste, add, fit. Cards keep their own menu. */
    viewport.addEventListener('contextmenu', e => {
      if (e.target.closest('.cnode')) return;
      e.preventDefault();
      backgroundMenu(e);
    });
    /* The browser's own middle-click autoscroll would fight the pan, so it is
       turned away before it can put its compass on the screen. */
    viewport.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
    viewport.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
    document.addEventListener('paste', onPaste);
    viewport.addEventListener('dblclick', e => {
      if (e.target.closest('.cnode')) return;
      const p = toWorld(e.clientX, e.clientY);
      const n = Store.addNode({ kind: 'note', x: Math.round(p.x - 105), y: Math.round(p.y - 60), w: 210, h: 120, text: '', color: color });
      selected = n.id;
      render();
      requestAnimationFrame(() => {
        const ta = nodesEl.querySelector('[data-node-id="' + n.id + '"] .cn-text');
        if (ta) ta.focus();
      });
    });

    window.addEventListener('keydown', e => {
      if (S().view !== 'canvas') return;
      if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
      const map = { v: 'select', p: 'pen', a: 'arrow', e: 'erase', s: 'sweep' };
      const ids = { v: 'canvasSelect', p: 'canvasPen', a: 'canvasArrow', e: 'canvasErase', s: 'canvasSweep', f: 'canvasFit' };
      const k = e.key.toLowerCase();
      if (ids[k] && !Keys.on(ids[k])) return;           // switched off in Settings
      if (map[k]) {
        tool = map[k]; selected = null;
        renderToolbar(); renderNodes(); showHint();
        viewport.dataset.tool = tool;
        if (tool === 'sweep' && lastPt) showRing(lastPt.x, lastPt.y); else hideRing();
      }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && Keys.on('canvasDelete')) { Store.removeNode(selected); selected = null; }
      else if (k === 'f') fit();
    });

    // a category dragged out of the Lists panel lands on the canvas
    // a category — or a single note — dragged out of the Lists panel, or a row
    // dragged off a category card, lands wherever it was dropped
    DND.zone(viewport, {
      kind: 'canvas', accepts: ['category', 'note'], axis: 'y', itemSelector: '.cnode',
      canAccept: () => S().view === 'canvas',
      onDrop: payload => {
        const p = DND.lastPoint();
        if (payload.itemId) dropNote(payload, p.x, p.y);
        else dropList(payload.listId, p.x, p.y);
      }
    });

    renderToolbar();
    render();
  }

  return { init, render, renderIndex, renderToolbar, setZoom, fit, applyTransform, toggleFocus,
           getZoom: () => (active() ? active().zoom : 1) };
})();
