/* ============================================================
   Flowlist — the copy that lives on the phone

   Installed to a home screen, the app should open the way an app opens:
   at once, and whether or not there is a signal. That is this file. It
   keeps the app itself on the device, hands it over on every launch
   without asking the network, and only then goes looking for a newer
   one in the background.

   So a launch costs no round trip, and a launch with no signal costs
   nothing at all. The board was always local — it lives in this
   browser's storage and always did — so with the page local too, the
   network is needed for exactly one thing: syncing with the other
   device, when there is a network to do it over.

   THE ONE THING THAT COULD GO BADLY

   The site is behind a password gate, and the pass lasts ninety days.
   When it runs out, a background check for a newer copy is answered
   with the login page — and a login page saved on top of the app is an
   app that is gone until somebody clears the browser's storage. So a
   fetched copy is only kept if it carries the marker that only the real
   app has. See MARK. Nothing else in here matters as much as that.

   WHAT IS NEVER TOUCHED

   Only same-origin GETs are handled. The database is another origin, so
   every read and write of the board goes out as though this file did
   not exist — no caching, no interception, no stale board. Writes are
   not GETs either, so they are doubly untouched. And /__gate is left
   alone: it is the way back in after a lockout, and answering it from a
   cache would be answering the wrong question.

   UPDATING

   Serve from the cache, then quietly fetch and keep the newer copy for
   next time. Nothing is swapped mid-session — the app you opened is the
   app you keep until you close it. VERSION only has to change when an
   old cache should be thrown away rather than updated in place.
   ============================================================ */
const VERSION = 'flowlist-1';

/* only in the real app, never in the gate's login page */
const MARK = 'name="flowlist-app"';

const PAGE = './index.html';
const SHELL = [PAGE, './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== VERSION).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                    /* every write goes out */

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;     /* the database, and all else */
  if (url.pathname.indexOf('/__gate') === 0) return;   /* the way back in */

  if (req.mode === 'navigate') { e.respondWith(openApp(req)); return; }
  e.respondWith(fromCache(req));
});

/**
 * A launch. The cached app goes back immediately — no network, no wait —
 * and a look for a newer one is started but never waited on.
 */
async function openApp(req) {
  const cache = await caches.open(VERSION);
  const held = await cache.match(PAGE);
  if (held) { catchUp(cache); return held; }
  try { return await fetch(req); }
  catch (e) { return new Response('Offline, and nothing saved yet.',
    { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
}

/**
 * Fetch the app again and keep it if it is the app.
 *
 * The check is the whole point: once the ninety-day pass runs out this
 * request comes back 200 OK with the login page in it, and saving that
 * would replace the app with a password box for good.
 */
async function catchUp(cache) {
  try {
    const res = await fetch(PAGE, { cache: 'no-cache', credentials: 'same-origin' });
    if (!res.ok) return false;
    const text = await res.clone().text();
    if (text.indexOf(MARK) === -1) return false;       /* not the app; keep what we have */
    await cache.put(PAGE, res);
    return true;
  } catch (e) { return false; }                        /* no signal: keep what we have */
}

/** Everything else: what is held, then the network to replace it next time. */
async function fromCache(req) {
  const cache = await caches.open(VERSION);
  const held = await cache.match(req);
  const going = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (held) return held;
  const fresh = await going;
  return fresh || new Response('', { status: 504 });
}
