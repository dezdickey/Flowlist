/* ============================================================
   Flowlist — filling the screen on a phone

   A browser keeps a bar across the top and usually another across the
   bottom, and on a phone that is a good part of the glass spent on
   things that are not the board. The fullscreen API takes them away,
   and the phone's own status bar with them: the page becomes the whole
   screen until you swipe the system bars back.

   IT CANNOT BE ASKED FOR ON LOAD

   A browser only grants fullscreen during a real gesture — a tap, a
   click, a key — and refuses it at any other time. So the first touch
   after the app opens is the one that does it. On a phone that is
   almost always the tap that unlocks the board, which makes it look as
   though the app simply opens this way.

   AND IT DOES NOT STAY GRANTED

   Switching away from the browser drops fullscreen, every time. Coming
   back, the page is its ordinary self again and the grant is gone with
   the gesture that earned it. So the wait is not a one-off: whenever
   the screen is handed back — the tab hidden and shown, the window
   refocused, the page restored from the back stack, fullscreen ending
   for any reason — another wait is set, and the next touch takes the
   screen again. From the outside it looks like it never stopped.

   Nothing here argues with a deliberate exit. Swiping the bars back
   works as it always did; the board simply fills the screen again the
   next time you touch it. The switch in Settings is the way to stop it
   for good, and it is the only thing `wanted()` listens to.

   WHERE THE SETTING LIVES

   On the device, not in the board. A phone wanting the whole screen
   says nothing about the desktop it shares a board with, and this is
   the sort of thing that would be maddening to have arrive over sync.

   WHAT IT IS NOT

   Not an installed app, and the difference is worth knowing, because it
   is the difference between this working well and working badly:

     · A browser must tell you it has gone fullscreen. That "drag from
       the top to exit" notice is the browser's own, it is required of
       it, and no page can turn it off — a page that could would be a
       page that could pretend to be your whole phone. It is the price
       of doing this from inside a browser, and it is charged every time
       the screen is taken, which is every time you come back.

     · An installed app is not a page asking for anything. It is
       launched in the shape its manifest declares: no browser around
       it, no notice, and nothing to re-take on the way back.

   So this is the good answer for a file opened in a browser, and the
   second-best answer once the hosted copy is installed. See
   site/manifest.webmanifest, which declares fullscreen for exactly this
   reason — and `byDisplay()` below, which is how this module knows to
   keep its hands off when the app is already in that shape.
   ============================================================ */
const Fullscreen = (function () {
  const KEY = 'flowlist.fullscreen';
  const root = document.documentElement;

  /* Looked up when they are needed rather than kept from load. A browser
     is allowed to define these late, and a test needs to be able to put
     its own in the way and watch what gets asked for. */
  const asker = () => root.requestFullscreen || root.webkitRequestFullscreen || null;
  const dropper = () => document.exitFullscreen || document.webkitExitFullscreen || null;

  let enabled = false;     // this device should do it at all
  let waiting = null;      // the gesture listener, when one is set
  let watching = false;    // the standing listeners, installed once

  /** Can this browser do it at all? */
  function supported() { return !!asker(); }

  const media = q => {
    try { return !!(window.matchMedia && matchMedia(q).matches); }
    catch (e) { return false; }
  };

  /**
   * Is this the installed copy, opened from the home screen rather than
   * from inside a browser?
   */
  function installed() {
    try { if (window.navigator && navigator.standalone === true) return true; }  /* iOS */
    catch (e) {}
    return media('(display-mode: standalone)') ||
           media('(display-mode: fullscreen)') ||
           media('(display-mode: minimal-ui)');
  }

  /**
   * Is it already filling the screen because that is the shape it was
   * launched in? An installed app declaring fullscreen arrives that way,
   * with no notice and nothing to ask for — so there is nothing to do
   * here, and asking anyway would only summon the notice for no gain.
   */
  function byDisplay() { return media('(display-mode: fullscreen)'); }

  /**
   * ...or because this is the Android app, whose window is drawn edge
   * to edge by Android itself. Asking a web view for fullscreen on top
   * of that is asking for something already had.
   */
  function inApp() {
    return typeof Offline !== 'undefined' && Offline.native();
  }

  /** Is the screen full right now, by either route? */
  function isOn() { return granted() || byDisplay() || inApp(); }

  /** ...and specifically by the API, which is the only part we can undo. */
  function granted() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  /* ---------- the setting, kept on this device ---------- */

  /** Absent means yes: a phone that has never been told wants the room. */
  function wanted() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw === null ? true : raw === '1';
    } catch (e) { return true; }
  }

  function remember(on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); return true; }
    catch (e) { return false; }
  }

  /* ---------- going in and out ---------- */

  /**
   * Ask for the screen. Only works inside a gesture; outside one the
   * browser refuses, and that refusal is not an error worth showing
   * anybody. It is swallowed — but another wait is set, so the next
   * touch tries again rather than the feature quietly dying.
   */
  function enter() {
    const ask = asker();
    if (!ask || isOn()) return false;
    try {
      const p = ask.call(root, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => { rearm(); });
    } catch (e) { rearm(); return false; }
    return true;
  }

  function exit() {
    const drop = dropper();
    if (!drop || !granted()) return false;
    try {
      const p = drop.call(document);
      if (p && p.catch) p.catch(() => {});
    } catch (e) { return false; }
    return true;
  }

  /**
   * The switch in Settings. Called from a click, so it takes effect at
   * once rather than waiting for the next gesture — and either way it
   * calls off a wait already begun, so a switch turned off before the
   * first touch is not overruled by that touch a moment later.
   */
  function want(on) {
    remember(on);
    disarm();
    if (!on) return exit();
    const did = enter();
    if (!did) rearm();          /* refused for now: take the next touch */
    return did;
  }

  /* ---------- waiting for a touch ---------- */

  /** Take the gesture listeners back off. Safe to call when there are none. */
  function disarm() {
    if (!waiting) return false;
    window.removeEventListener('pointerup', waiting, true);
    window.removeEventListener('keydown', waiting, true);
    waiting = null;
    return true;
  }

  /**
   * Set a wait, if one is wanted and not already set. Any gesture will
   * do — the point is to have the browser's permission, not to send the
   * reader hunting for a button. Both listeners come off as soon as
   * either fires, so a wait costs one touch and nothing after it.
   */
  function rearm() {
    if (!enabled || waiting || !wanted() || isOn()) return false;
    waiting = () => { disarm(); enter(); };
    window.addEventListener('pointerup', waiting, true);
    window.addEventListener('keydown', waiting, true);
    return true;
  }

  /**
   * The standing listeners, put on once. Every one of these is a moment
   * where the screen may just have been handed back: a tab shown again,
   * a window refocused, a page restored from the back stack, or
   * fullscreen ending for any reason at all.
   */
  function watch() {
    if (watching) return false;
    watching = true;
    const back = () => { if (document.visibilityState !== 'hidden') rearm(); };
    document.addEventListener('visibilitychange', back);
    document.addEventListener('fullscreenchange', back);
    document.addEventListener('webkitfullscreenchange', back);
    window.addEventListener('pageshow', back);
    window.addEventListener('focus', back);
    return true;
  }

  /**
   * Start. Called once at boot; after that the standing listeners keep
   * it going by themselves.
   *
   * Nothing here fires in an installed copy, and that is the point. The
   * browser must announce a page taking the screen — "drag from the top
   * to exit" — and it says it every single time, which now means every
   * time you come back to the app. An installed copy has no need to ask:
   * its manifest says fullscreen and it is launched that way, silently.
   * If a phone ever declines that and gives it the ordinary app shape
   * instead, taking the screen by hand would buy the status bar back at
   * the price of that notice on every launch. Not worth it. The switch
   * in Settings is still there for anyone who disagrees; it just is not
   * done to them automatically.
   *
   * @param {Boolean} [force] do it in the wide shape too (for tests)
   */
  function arm(force) {
    if (!asker()) return false;
    /* `typeof`, not `window.Mobile`. Every module here is declared with
       const, and a top-level const does not become a property of window —
       it lives in the global lexical scope instead. window.Mobile was
       therefore always undefined, this line was always true, and the app
       never once armed itself on any device. */
    if (!force && !(typeof Mobile !== 'undefined' && Mobile.isPhone())) return false;
    if (installed() || inApp()) return false;   /* no bars to take, and a notice to avoid */
    enabled = true;
    watch();
    return rearm();
  }

  /** For tests: back to knowing nothing. */
  function reset() { disarm(); enabled = false; }

  return {
    supported, installed, byDisplay, inApp, isOn, wanted, want,
    enter, exit, arm, rearm, disarm, reset
  };
})();
