/* ============================================================
   Flowlist — asking the browser to keep a copy

   The worker itself is site/sw.js; this is only the request to install
   it. It has to be a separate file, and it has to sit at the root: a
   worker can only look after the folder it was served from and below,
   so one folded into the page could not look after anything.

   That is also why this does nothing for the single file opened from
   disk. Workers need a secure origin — https, or localhost — and a file
   on a phone's storage is neither. Nothing is lost by that: a file on
   the phone was never going to the network anyway. This is for the
   installed copy, where the page comes from a server and would
   otherwise be fetched on every launch.

   Failure here is not worth a word to anybody. The app runs perfectly
   well fetching itself each time; it is just slower, and no use with no
   signal. So a refusal is swallowed and the board carries on.
   ============================================================ */
const Offline = (function () {

  /**
   * Is this the Android app rather than a browser?
   *
   * The app's web view puts a word on the end of its user agent to say
   * so — see android/java/.../MainActivity.java. Two things hang off the
   * answer, and both are about not doing work that is already done:
   * there is nothing to keep a copy of, because the page is inside the
   * app, and nothing to ask for the screen about, because the window
   * already fills it.
   *
   * A user agent can be lied about, and it does not matter here. The
   * worst a lie buys is a service worker that is not needed and a
   * fullscreen request that is refused.
   */
  function native() {
    try { return (navigator.userAgent || '').indexOf('FlowlistApp/') !== -1; }
    catch (e) { return false; }
  }

  /** Can a worker be registered here at all? */
  function possible() {
    if (!('serviceWorker' in navigator)) return false;
    if (native()) return false;        /* the page is already on the device */
    /* the secure-origin rule, which localhost is deliberately exempt from */
    return location.protocol === 'https:' ||
           location.hostname === 'localhost' ||
           location.hostname === '127.0.0.1';
  }

  /**
   * Ask once. The browser decides whether this is a new worker or the
   * one it already has, and does the right thing either way.
   */
  function start() {
    if (!possible()) return false;
    try {
      const p = navigator.serviceWorker.register('sw.js', { scope: './' });
      if (p && p.catch) p.catch(() => {});
    } catch (e) { return false; }
    return true;
  }

  /** Is one looking after this page right now? */
  function keeping() {
    try { return !!(navigator.serviceWorker && navigator.serviceWorker.controller); }
    catch (e) { return false; }
  }

  return { native, possible, start, keeping };
})();
