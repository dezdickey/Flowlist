/* ============================================================
   Flowlist — DND
   One pointer-driven drag engine for every draggable thing:
   notes (within/between lists, into Today), whole lists on the
   board, categories into presets, preset members, widgets.

   Zones register themselves with a kind + accept list. While a
   drag is live the store is frozen so no re-render fights the
   pointer; a placeholder shows exactly where the drop lands.
   ============================================================ */
const DND = (function () {
  const ghost = document.getElementById('dnd-ghost');
  const zones = [];          // { el, kind, accepts[], axis, itemSelector, onDrop, canAccept }
  let drag = null;           // live drag session
  let ph = null;             // placeholder element
  let lastPt = { x: 0, y: 0 };   // where the pointer was last — free-form zones need it

  /* ---------- lifecycle hooks ---------- */
  const hooks = { start: [], end: [] };
  function on(name, fn) { (hooks[name] = hooks[name] || []).push(fn); }
  function fire(name, arg) { (hooks[name] || []).forEach(fn => fn(arg)); }

  /* ---------- zone registry ---------- */
  function zone(el, cfg) {
    if (!el) return;
    const existing = zones.findIndex(z => z.el === el);
    const entry = Object.assign({ el, axis: 'y', itemSelector: '[data-dnd-item]' }, cfg);
    if (existing !== -1) zones[existing] = entry; else zones.push(entry);
  }
  function clearZones(predicate) {
    for (let i = zones.length - 1; i >= 0; i--) {
      if (!document.body.contains(zones[i].el) || (predicate && predicate(zones[i]))) zones.splice(i, 1);
    }
  }

  /* ---------- start ---------- */
  /**
   * @param {PointerEvent} e
   * @param {Object} opts { el, kind, payload, axis, onCancel }
   */
  /* ============================================================
     PICKING SOMETHING UP

     With a mouse, moving five pixels means you meant to drag: nothing
     else moves the pointer while a button is held.

     A finger is not like that. Every swipe moves further than five
     pixels, so on a phone that rule turned every scroll and every
     sideways flick into a drag — and the note was quietly put down in
     whatever category happened to be under the finger, usually one off
     the side of the screen. It looked exactly like the note had been
     deleted.

     So with a finger, only holding still picks anything up. Every
     movement — any direction, any speed — is a scroll or a swipe, and
     the drag is dropped the moment one starts.

     Reading a short flick as a reorder was tried and taken out again: it
     could not be told apart from scrolling a list, and scrolling is what
     you do far more often.
     ============================================================ */
  const HOLD_MS = 380;      // how long a finger holds still before it picks up
  const HOLD_SLOP = 10;     // how far it may stray in that time
  const LIFT_PX = 2;        // how far a mouse moves before the thing is in your hand

  /* ============================================================
     KEEPING HOLD OF THE GESTURE

     Once a note is in your hand, the browser must be told to leave the
     touch alone. Until it is, the first movement after picking one up
     looks to Chrome like the start of a scroll — and when it decides
     that, it takes the pointer away and sends `pointercancel`, which
     lands here as "they let go". The note was dropped the instant it
     was moved.

     Preventing the touchmove is what settles it. It cannot be done any
     earlier: before the hold is up, this same movement genuinely IS a
     scroll and has to be left to happen.

     `touch-action` would be the tidier control, but it is read once
     when the gesture begins and cannot be changed part-way through.
     ============================================================ */
  window.addEventListener('touchmove', e => {
    if (drag && drag.lifted && e.cancelable) e.preventDefault();
  }, { passive: false });

  function start(e, opts) {
    if (drag || e.button !== 0) return;
    const el = opts.el;
    const rect = el.getBoundingClientRect();
    const byTouch = e.pointerType === 'touch';

    /* Where the pointer is known to be starts here, not wherever the last
       drag left off. Letting go compares against it to tell a flick from a
       still hand — and a finger that held still and let go without moving
       was being compared against some other drag's last position, read as
       having travelled, and put down one place off. */
    lastPt = { x: e.clientX, y: e.clientY };

    drag = {
      kind: opts.kind,
      payload: opts.payload,
      axis: opts.axis || 'y',
      el,
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
      w: rect.width,
      h: rect.height,
      startX: e.clientX,
      startY: e.clientY,
      lifted: false,
      zone: null,
      index: 0,
      byTouch: byTouch,
      waiting: byTouch,          /* still waiting out the hold */
      holdTimer: null,
      onCancel: opts.onCancel
    };

    if (byTouch) {
      drag.holdTimer = setTimeout(() => {
        if (!drag || !drag.waiting) return;
        drag.waiting = false;
        lift();
        moveGhost(drag.startX, drag.startY);
        /* a small tick, so it is obvious the thing is now in your hand */
        if (navigator.vibrate) { try { navigator.vibrate(14); } catch (err) {} }
      }, HOLD_MS);
    }

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    /* A cancel is the gesture being taken away — the system stepping in,
       a call arriving — not someone letting go. Putting the note down
       wherever it happened to be at that moment would be inventing a
       decision nobody made, so it goes back instead. */
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onKey);
  }

  function lift() {
    drag.lifted = true;
    drag.liftedAt = Date.now();

    /* Where it stood before it was picked up, so a flick can move it one
       place from here rather than dropping it back where it started.

       Counted among its own kind, not among every child: a list body holds
       more than notes, and counting those in would shift the index and
       send the note somewhere else entirely. */
    const parent = drag.el.parentNode;
    const mine = (drag.el.className || '').split(' ')[0];
    drag.fromIndex = (parent && mine)
      ? Array.prototype.filter.call(parent.children, c => c.classList.contains(mine))
          .indexOf(drag.el)
      : -1;

    Store.freeze(true);
    document.body.classList.add('dnd-active');

    // a drag that began on a textarea must not also drag-select its text
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) a.blur();
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();

    const clone = drag.el.cloneNode(true);
    clone.style.width = drag.w + 'px';
    clone.style.height = drag.kind === 'list' ? Math.min(drag.h, 420) + 'px' : 'auto';
    ghost.innerHTML = '';
    ghost.appendChild(clone);
    ghost.classList.add('on');

    ph = document.createElement('div');
    ph.className = 'dnd-ph';
    if (drag.axis === 'y') { ph.style.height = drag.h + 'px'; ph.style.width = '100%'; }
    else { ph.style.width = drag.w + 'px'; ph.style.alignSelf = 'stretch'; }

    drag.el.classList.add('dragging-src');
    moveGhost(drag.startX, drag.startY);
    fire('start', { kind: drag.kind, payload: drag.payload });
  }

  function moveGhost(x, y) {
    ghost.style.transform = 'translate(' + (x - drag.offX) + 'px,' + (y - drag.offY) + 'px)';
  }

  /* ---------- move ---------- */
  function onMove(e) {
    if (!drag) return;

    /* A finger still waiting out the hold. Any real movement means this
       was a scroll or a swipe, so let go of it completely. */
    if (drag.waiting) {
      if (Math.abs(e.clientX - drag.startX) > HOLD_SLOP ||
          Math.abs(e.clientY - drag.startY) > HOLD_SLOP) letGo();
      return;                  /* and never preventDefault, or it will not scroll */
    }

    if (!drag.lifted) {
      /* A mouse means it: nothing else moves the pointer while a button is
         held, so two pixels is enough to be sure. Five made picking a note up
         feel like it had to be tugged before it would come. */
      if (Math.abs(e.clientX - drag.startX) < LIFT_PX && Math.abs(e.clientY - drag.startY) < LIFT_PX) return;
      lift();
    }
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
    lastPt = { x: e.clientX, y: e.clientY };

    const target = findZone(e.clientX, e.clientY);
    if (target !== drag.zone) {
      if (drag.zone) drag.zone.el.classList.remove('dnd-over');
      drag.zone = target;
      if (target) target.el.classList.add('dnd-over');
      else if (ph.parentNode) ph.parentNode.removeChild(ph);
    }
    if (drag.zone) placeIn(drag.zone, e.clientX, e.clientY);
    autoScroll(e.clientX, e.clientY);
  }

  /* A zone may be aimed at over a bigger area than the one its items live
     in: `hit`. An hour in the Do Today timeline keeps its notes in the
     slot, but the hour is the whole row — label and all — and a note let
     go over "11 AM" plainly means eleven. Without this the label belonged
     to the dock behind it, and the drop quietly did nothing. */
  const hitOf = z => z.hit || z.el;

  function findZone(x, y) {
    const under = document.elementsFromPoint(x, y);   // innermost first
    const ok = z => (!z.accepts || z.accepts.indexOf(drag.kind) !== -1) &&
                    (!z.canAccept || z.canAccept(drag.payload));

    // exact hits win, so a nested zone (an hour slot inside the Today dock)
    // beats its own container
    for (const el of under) {
      const z = zones.find(z => hitOf(z) === el && ok(z));
      if (z) return z;
    }
    for (const el of under) {
      const z = zones.find(z => hitOf(z).contains(el) && ok(z));
      if (z) return z;
    }
    return null;
  }

  function placeIn(z, x, y) {
    // some zones are a plain target, not an ordered list — no gap to show
    if (z.noPlaceholder) {
      drag.index = 0;
      if (ph.parentNode) ph.parentNode.removeChild(ph);
      return;
    }
    const items = Array.from(z.el.querySelectorAll(':scope > ' + z.itemSelector))
      .filter(el => el !== ph && el !== drag.el);
    const vertical = z.axis === 'y';
    let index = items.length;

    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      const mid = vertical ? r.top + r.height / 2 : r.left + r.width / 2;
      if ((vertical ? y : x) < mid) { index = i; break; }
    }

    drag.index = index;
    const ref = items[index] || null;
    if (ph.parentNode !== z.el || ph.nextElementSibling !== ref) {
      /* where everything sits before the gap moves */
      const was = items.map(el => el.getBoundingClientRect());

      if (vertical) { ph.style.height = drag.h + 'px'; ph.style.width = ''; }
      else { ph.style.width = drag.w + 'px'; ph.style.height = ''; }
      /* a zone can end in something that is not one of its items — the
         Tomorrow section under Do Today — and the gap for "last" goes above it */
      z.el.insertBefore(ph, ref || z.el.querySelector(':scope > [data-dnd-tail]'));

      slide(items, was);
    }
  }

  /* ============================================================
     SLIDING, RATHER THAN JUMPING

     Moving the gap re-lays the whole column out at once, so everything
     below it appears in its new place having never travelled there. This
     puts each one back where it just was and lets it go, which reads as
     the row sliding aside to make room.

     It is a transform and nothing else, so the compositor carries it —
     the same rule the rest of the app is held to.
     ============================================================ */
  const SLIDE_MS = 170;

  function slide(items, was) {
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      const now = el.getBoundingClientRect();
      const dx = was[i].left - now.left;
      const dy = was[i].top - now.top;
      if (!dx && !dy) continue;
      /* it has not moved far enough to be worth animating */
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      /* read once so the browser takes the starting point seriously */
      void el.offsetWidth;
      el.style.transition = 'transform ' + SLIDE_MS + 'ms cubic-bezier(.2,.8,.3,1)';
      el.style.transform = '';

      /* tidy up after, so nothing is left with a transition on it */
      clearTimeout(el._slideT);
      el._slideT = setTimeout(() => {
        el.style.transition = '';
        el.style.transform = '';
      }, SLIDE_MS + 30);
    }
  }

  /* ============================================================
     CARRYING SOMETHING PAST THE EDGE

     On a wide screen the board just slides while you hold a note near
     the edge. On a phone it cannot: the columns are snapped one to a
     screen, and nudging the scroll a few pixels at a time only fights
     the snap and springs back.

     So on a phone it steps — one whole column, smoothly, then waits.
     The wait is the important part: without it, holding near the edge
     would race through every category before you could look at any of
     them.
     ============================================================ */
  let scrollRAF = null;
  let lastHop = 0;
  const HOP_MS = 700;          // how long to look at a column before the next

  /** Which column is nearest the middle of the board right now. */
  function centredColumn(board) {
    const cols = Array.from(board.querySelectorAll('.list'));
    const mid = board.getBoundingClientRect().left + board.clientWidth / 2;
    let best = Infinity, at = 0;
    cols.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < best) { best = d; at = i; }
    });
    return { cols, at };
  }

  function hopColumn(board, dir) {
    const now = Date.now();
    if (now - lastHop < HOP_MS) return false;
    const { cols, at } = centredColumn(board);
    const next = cols[at + dir];
    if (!next) return false;
    lastHop = now;
    next.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    return true;
  }
  /** The nearest thing above this element that can actually scroll. */
  function scrollableFrom(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 4) {
        const how = getComputedStyle(n).overflowY;
        if (how === 'auto' || how === 'scroll') return n;
      }
    }
    return null;
  }

  function autoScroll(x, y) {
    cancelAnimationFrame(scrollRAF);
    const board = document.getElementById('board');
    const zEl = drag.zone && drag.zone.el;
    /* The zone itself is often too small to scroll — an hour slot in Do
       Today is a few pixels tall. What has to move is whatever holds it,
       so walk up until something can. */
    const scroller = scrollableFrom(zEl);
    const bRect = board.getBoundingClientRect();

    // only pan the board while the drop target is actually on it — otherwise
    // dragging out to the Today dock (which sits past the board's right edge)
    // would scroll the board the whole way there
    const overBoard = !!zEl && (zEl === board || board.contains(zEl));
    /* a phone shows one column at a time and snaps between them */
    const onePerScreen = document.body.classList.contains('phone');

    const step = () => {
      if (!drag) return;
      let again = false;
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        /* the closer to the edge, the faster it goes, so a long list can
           be crossed without holding still at the very edge for ever */
        const near = 56;
        if (y < r.top + near) {
          scroller.scrollTop -= Math.max(6, (r.top + near - y) * 0.45);
          again = true;
        } else if (y > r.bottom - near) {
          scroller.scrollTop += Math.max(6, (y - (r.bottom - near)) * 0.45);
          again = true;
        }
      }
      if (overBoard && x > bRect.left && x < bRect.right) {
        const edge = onePerScreen ? 74 : 60;
        const dir = x < bRect.left + edge ? -1 : (x > bRect.right - edge ? 1 : 0);
        if (dir) {
          if (onePerScreen) hopColumn(board, dir);
          else board.scrollLeft += dir * 11;
          again = true;
        }
      }
      if (again) scrollRAF = requestAnimationFrame(step);
    };
    step();
  }

  /* ---------- end ---------- */
  /** Drop the whole thing without touching anything, and stop listening. */
  function letGo() {
    if (!drag) return;
    clearTimeout(drag.holdTimer);
    drag = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', onKey);
  }

  function onKey(e) { if (e.key === 'Escape') cancel(); }

  function cancel() {
    if (!drag) return;
    const d = drag;
    const lifted = d.lifted;
    teardown();
    if (d.onCancel) d.onCancel();
    // teardown already restored the DOM; only a lifted drag left anything to undo
    if (lifted) Store.emit(['board', 'today', 'presets', 'widgets', 'lists']);
  }

  function onUp(e) {
    if (!drag) return;

    /* Where it lands is where the gap is — the gap is what was shown, and
       that is the promise. With one exception: a quick flick can let go a
       column away from the last move the browser reported, before any gap
       was drawn there, and a note swept across to Do Today was put down in
       the list column it passed on the way. So if the pointer has really
       travelled since the last move, look again where it was let go.

       Not otherwise. Moving the gap moves everything around it: dropping
       it into 11 AM pulls the rows above up, and a pointer that has not
       budged can end up on the border with 12 PM. Looking again there
       would drop it at 12 while the gap sat plainly under 11. */
    const travelled = e && typeof e.clientX === 'number' &&
      Math.hypot(e.clientX - lastPt.x, e.clientY - lastPt.y) > 3;
    if (drag.lifted && travelled) {
      const there = findZone(e.clientX, e.clientY);
      if (there !== drag.zone) {
        if (drag.zone) drag.zone.el.classList.remove('dnd-over');
        drag.zone = there;
      }
      if (there) placeIn(there, e.clientX, e.clientY);
    }

    const d = drag;
    const z = d.zone;
    const index = d.index;
    const lifted = d.lifted;
    teardown();

    // A press that never passed the lift threshold is a plain click, not a
    // drag. Repainting here would rebuild the element under the user's cursor
    // and steal focus from the textarea they just clicked into.
    if (!lifted) return;

    if (z && z.onDrop) z.onDrop(d.payload, index, z.el);
    else Store.emit(['board', 'today', 'presets', 'widgets', 'lists']);
  }

  function teardown() {
    lastHop = 0;
    if (drag && drag.holdTimer) clearTimeout(drag.holdTimer);
    /* anything caught mid-slide is put straight, so nothing is left
       sitting under a transform that will never finish */
    if (drag && drag.zone && drag.zone.el) {
      drag.zone.el.querySelectorAll('[style*="transform"]').forEach(el => {
        clearTimeout(el._slideT);
        el.style.transition = '';
        el.style.transform = '';
      });
    }
    if (drag && drag.lifted) fire('end', { kind: drag.kind });
    cancelAnimationFrame(scrollRAF);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', onKey);
    if (drag) {
      drag.el.classList.remove('dragging-src');
      if (drag.zone) drag.zone.el.classList.remove('dnd-over');
    }
    if (ph && ph.parentNode) ph.parentNode.removeChild(ph);
    ph = null;
    ghost.classList.remove('on');
    ghost.innerHTML = '';
    document.body.classList.remove('dnd-active');
    document.querySelectorAll('.dnd-over').forEach(el => el.classList.remove('dnd-over'));
    Store.freeze(false);
    drag = null;
  }

  const isDragging = () => !!(drag && drag.lifted);

  /** Where the pointer was on the last move — for zones that place things
      at a point rather than at an index (the canvas). */
  const lastPoint = () => lastPt;

  return { zone, clearZones, start, isDragging, cancel, lastPoint, on };
})();
