/* ============================================================
   Flowlist — phone layout

   One app, one set of data, two shapes. Everything below is the same
   markup and the same modules as the desktop; `body.phone` restyles it:
   the rail becomes a bar along the bottom, the side panels become
   sheets that come up over the board, and the board itself becomes one
   column at a time that you swipe between.

   Which shape you get is decided once and then remembered:

     auto     — by the size of the window, rechecked as it changes
     phone    — always the phone shape, whatever the device
     desktop  — always the wide shape, even on a phone

   Auto is the default and gets it right without asking. The override is
   there for the times it does not: a big tablet, a phone held sideways,
   or a desktop window dragged narrow that you would rather keep wide.
   ============================================================ */
const Mobile = (function () {

  /* Narrower than this and the wide layout stops being usable: the rail,
     two panels and a column do not fit side by side under about 760px. */
  const NARROW = 760;

  let phone = null;      // what we last applied, so we only touch the DOM on a change

  const mode = () => Store.settings().layout || 'auto';

  /** Does this window want the phone shape? */
  function wants() {
    const m = mode();
    if (m === 'phone') return true;
    if (m === 'desktop') return false;
    return window.innerWidth <= NARROW;
  }

  /**
   * Columns are a fixed width on the desktop and the width of the screen on a
   * phone, so the board can be swiped one column at a time.
   *
   * It has to be a plain number of pixels: --list-w is used inside the flex
   * shorthand, and a calc() substituted into a shorthand by var() does not
   * survive — the column collapses to its borders. Working it out here also
   * means it is right after a resize or a turn of the phone.
   */
  function sizeColumns(isPhone) {
    const s = Store.settings();
    const w = isPhone ? Math.max(240, window.innerWidth - 26) : s.listWidth;
    document.documentElement.style.setProperty('--list-w', w + 'px');
  }

  function apply() {
    const want = wants();
    const first = phone === null;
    const changed = want !== phone;
    phone = want;
    sizeColumns(want);          // every time: a resize changes the number
    if (!changed) return;
    document.body.classList.toggle('phone', want);
    /* each shape has its own layout — put this one's back (js/layouts.js) */
    Layouts.useFor(want ? 'phone' : 'desktop');
    /* A panel is a column on the desktop and a sheet over the board on a
       phone. The layouts you would want are not the same thing at all, so
       arriving in the phone shape starts with the board and nothing over it. */
    if (want) closeSheets(!first);
    /* the board's overflow maths and the preset bands are both measured, so
       they have to be worked out again once the new shape has settled */
    setTimeout(() => {
      Lists.syncGrabline();
      Presets.renderBands();
      Canvas.applyTransform();
    }, 340);
  }

  /**
   * Shut every sheet. Two full-screen sheets cannot both be open, and the
   * board is what you came for.
   */
  function closeSheets(announce) {
    /* The phone clearing its sheets for its own reasons — opening, turning
       into this shape, revealing a note — is not a choice about the layout,
       so it is never carried to the computer. See quietly() in js/layouts.js. */
    Layouts.quietly(() => Store.mutate(s => {
      ['board', 'canvas'].forEach(v => {
        const p = s.settings.panels[v];
        if (p) { p.lists = p.presets = p.canvas = p.today = false; }
      });
    }, announce ? ['panels'] : null, announce ? undefined : { silent: true }));
  }

  /** Called when the column-width slider moves, so it only bites on desktop. */
  const syncWidth = () => sizeColumns(phone === true);

  function init() {
    apply();
    window.addEventListener('resize', apply);
    /* iOS reports the old size for a moment after a turn, so look twice */
    window.addEventListener('orientationchange', () => {
      apply();
      setTimeout(apply, 350);
    });
    Store.on('settings', apply);
  }

  return { init, apply, syncWidth, closeSheets, isPhone: () => phone === true, NARROW };
})();
