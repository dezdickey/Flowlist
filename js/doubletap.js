/* ============================================================
   Flowlist — a double tap where a right click would be

   A phone has no right button, so the menu that lives behind one is
   otherwise unreachable. Two quick taps in the same spot open it.

   It has to be careful: a tap that was really the end of a drag, or a
   tap on a button inside the note, must not count. And the two taps
   have to land near each other — two taps on different notes are two
   taps, not a double.
   ============================================================ */
const DoubleTap = (function () {
  const GAP_MS = 320;      // how long the second tap has to arrive
  const NEAR = 26;         // and how close it must land
  const DEAF_MS = 330;     // and how long a new menu ignores the click behind it

  let last = 0, lx = 0, ly = 0, deaf = 0;

  /**
   * @param {Element} el     the thing to watch
   * @param {Function} open  called with { clientX, clientY } to show the menu
   */
  function on(el, open) {
    el.addEventListener('pointerup', e => {
      if (e.pointerType !== 'touch') return;
      if (e.target.closest('button')) return;
      /* the end of a drag is not a tap */
      if (document.body.classList.contains('dnd-active')) { last = 0; return; }

      const now = Date.now();
      const near = Math.abs(e.clientX - lx) < NEAR && Math.abs(e.clientY - ly) < NEAR;
      if (now - last < GAP_MS && near) {
        last = 0;
        e.preventDefault();
        e.stopPropagation();

        /* Put the menu beside the finger rather than under it. */
        open({
          clientX: e.clientX + 8, clientY: e.clientY + 10,
          preventDefault() {}, stopPropagation() {}
        });

        /* A phone sends one more click a moment after the finger lifts,
           and works out what it hit at that moment rather than at the
           moment you touched. The menu has just appeared where the
           finger was, so that stray click landed on whatever item was
           sitting there by then — which is how two taps ended up adding
           a note, and why it depended on where on the note you tapped.

           So a menu opened this way is deaf for a moment. The stray
           click falls through it onto the note behind, where it means
           nothing. Nobody reads a menu and aims at it inside a third of
           a second, so no real tap is lost. */
        const ctx = document.getElementById('ctx');
        if (ctx) {
          ctx.style.pointerEvents = 'none';
          clearTimeout(deaf);
          deaf = setTimeout(() => { ctx.style.pointerEvents = ''; }, DEAF_MS);
        }
      } else {
        last = now; lx = e.clientX; ly = e.clientY;
      }
    });
  }

  return { on };
})();

/* ============================================================
   Flowlist — the menu a phone opens by itself

   Android fires a real `contextmenu` event after a long press, exactly
   as though the right button had been clicked. That is the same gesture
   used here to pick a note up — so holding one to move it also threw
   open the menu behind it, usually the category's rather than the
   note's, since the event carries on up.

   Two taps are the way to that menu now, so the press-and-hold version
   is caught here and thrown away. It is taken in the capture phase, so
   it never reaches the handlers on the elements themselves.

   A mouse is untouched: the last pointer down tells us which it was.
   ============================================================ */
(function () {
  let lastKind = 'mouse';

  window.addEventListener('pointerdown', e => { lastKind = e.pointerType || 'mouse'; }, true);

  window.addEventListener('contextmenu', e => {
    if (lastKind !== 'touch') return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
})();
