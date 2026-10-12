/*
 * The copy that lives on the phone.
 *
 * A service worker cannot be run inside a test page — it needs its own
 * thread and a secure origin, and the harness has neither. So sw.js is
 * read as text and its functions are run here against stand-ins for
 * `caches` and `fetch`. That is enough to pin the things that matter,
 * and the one that matters most is not about speed at all:
 *
 *   Once the ninety-day gate pass runs out, a background check for a
 *   newer copy comes back 200 OK with the LOGIN PAGE in it. Saving that
 *   over the app would replace the installed app with a password box
 *   for good — no error, and no way back but clearing browser storage.
 *   The marker check is what stops that, and it is checked hard below.
 *
 * The other half is the registration side, js/offline.js, which is
 * ordinary code and is exercised directly.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

/* file:// will not answer fetch(), but it will answer this */
function slurp(url) {
  return new Promise(function (res, rej) {
    var x = new XMLHttpRequest();
    x.open('GET', url);
    x.onload = function () { res(x.responseText); };
    x.onerror = function () { rej(new Error('could not read ' + url)); };
    try { x.send(); } catch (e) { rej(e); }
  });
}

/* ---------- a world for the worker to run in ---------- */

function makeCache() {
  var held = {};
  return {
    held: held,
    match: function (k) { return Promise.resolve(held[String(k)]); },
    put: function (k, v) { held[String(k)] = v; return Promise.resolve(); },
    addAll: function (ks) { ks.forEach(function (k) { held[String(k)] = reply('shell'); }); return Promise.resolve(); }
  };
}

function reply(body, opts) {
  opts = opts || {};
  var o = {
    ok: opts.ok !== false,
    status: opts.status || 200,
    body: body,
    clone: function () { return o; },
    text: function () { return Promise.resolve(body); }
  };
  return o;
}

/** Run sw.js in a scope of our own making and hand back what it defined. */
function loadWorker(text, world) {
  var handlers = {};
  var fakeSelf = {
    addEventListener: function (t, fn) { handlers[t] = fn; },
    location: { origin: 'https://flowlist.pages.dev' },
    clients: { claim: function () { return Promise.resolve(); } },
    caches: world.caches
  };
  var make = new Function('self', 'caches', 'fetch', 'Response', 'URL', 'Promise',
    text + '\n;return { VERSION: VERSION, MARK: MARK, PAGE: PAGE, SHELL: SHELL,' +
           ' openApp: openApp, catchUp: catchUp, fromCache: fromCache };');
  var api = make(fakeSelf, world.caches, world.fetch, world.Response, URL, Promise);
  api.on = handlers;
  return api;
}

function evt(request) {
  return {
    request: request, answered: undefined, waited: undefined,
    respondWith: function (p) { this.answered = p; },
    waitUntil: function (p) { this.waited = p; }
  };
}
function req(url, opts) {
  opts = opts || {};
  return { url: url, method: opts.method || 'GET', mode: opts.mode || 'no-cors' };
}

setTimeout(function () {
  var sp = document.getElementById('splash'); if (sp) sp.remove();
  document.body.classList.remove('booting'); document.body.classList.add('loaded');

  /* ---------- 1. the registration half ---------- */
  ok('there is a way to ask for a worker', typeof Offline.start === 'function');
  ok('...and to ask whether one is looking after us', typeof Offline.keeping === 'function');
  var onDisk = location.protocol === 'file:';
  ok('a page opened from disk cannot have one',
     !onDisk || Offline.possible() === false, location.protocol);
  ok('...and asking anyway is refused quietly',
     !onDisk || Offline.start() === false);
  ok('asking never throws', (function () {
    try { Offline.start(); return true; } catch (e) { return false; }
  })());
  ok('nothing is looking after a page opened from disk',
     !onDisk || Offline.keeping() === false);

  /* ---------- 2. the worker itself ---------- */
  var sw, cache, world;

  slurp('sw.js').then(function (src) {
    ok('sw.js was read', src.length > 500, src.length);
    ok('...and it looks for the marker before saving anything',
       src.indexOf('flowlist-app') !== -1);

    cache = makeCache();
    world = {
      caches: {
        open: function () { return Promise.resolve(cache); },
        keys: function () { return Promise.resolve(['flowlist-1', 'flowlist-old']); },
        delete: function (n) { world.deleted.push(n); return Promise.resolve(true); }
      },
      deleted: [],
      Response: function (b, o) { return reply(b, o); },
      fetch: function (u, o) {
        world.asked.push(String(u));
        return world.next ? world.next(u, o) : Promise.resolve(reply('network'));
      },
      asked: [], next: null
    };
    sw = loadWorker(src, world);

    /* --- what it keeps --- */
    ok('it saves the page itself', sw.SHELL.indexOf(sw.PAGE) !== -1, sw.SHELL.join(' '));
    ok('...the manifest', sw.SHELL.join(' ').indexOf('manifest') !== -1);
    ok('...and both icons',
       sw.SHELL.join(' ').indexOf('icon-192') !== -1 &&
       sw.SHELL.join(' ').indexOf('icon-512') !== -1);

    /* --- what it refuses to touch --- */
    var e1 = evt(req('https://flowlist.pages.dev/', { method: 'PUT', mode: 'navigate' }));
    sw.on.fetch(e1);
    ok('a write is left alone', e1.answered === undefined);

    var e2 = evt(req('https://demo-default-rtdb.firebaseio.com/rooms/x.json'));
    sw.on.fetch(e2);
    ok('the database is left alone', e2.answered === undefined);

    var e3 = evt(req('https://flowlist.pages.dev/__gate?reset=abc', { mode: 'navigate' }));
    sw.on.fetch(e3);
    ok('the way back in is left alone', e3.answered === undefined);

    var e4 = evt(req('https://flowlist.pages.dev/', { mode: 'navigate' }));
    sw.on.fetch(e4);
    ok('a launch is answered', e4.answered !== undefined);

    /* --- a launch does not wait for the network --- */
    cache.held[sw.PAGE] = reply('<html>the saved app</html>');
    world.next = function () { return new Promise(function () {}); };   /* never settles */
    return sw.openApp(req('https://flowlist.pages.dev/', { mode: 'navigate' }));

  }).then(function (res) {
    eq('a launch is answered from the device', res.body, '<html>the saved app</html>');

    /* --- nothing saved and no signal: a plain answer, not a hang --- */
    var empty = makeCache();
    world.caches.open = function () { return Promise.resolve(empty); };
    world.next = function () { return Promise.reject(new Error('offline')); };
    return sw.openApp(req('https://flowlist.pages.dev/', { mode: 'navigate' }));

  }).then(function (res) {
    eq('nothing saved and no signal gives a plain answer', res.status, 503);

    /* ---------- 3. and the one that matters ---------- */
    cache = makeCache();
    cache.held[sw.PAGE] = reply('<html>the real app ' + sw.MARK + '</html>');
    world.caches.open = function () { return Promise.resolve(cache); };

    world.next = function () {
      return Promise.resolve(reply('<html>the gate: type your password</html>'));
    };
    return sw.catchUp(cache);

  }).then(function (kept) {
    ok('a login page is not saved over the app', kept === false);
    ok('...and the app that was there is still there',
       cache.held[sw.PAGE].body.indexOf(sw.MARK) !== -1, cache.held[sw.PAGE].body);

    world.next = function () { return Promise.resolve(reply('nope', { ok: false, status: 401 })); };
    return sw.catchUp(cache);

  }).then(function (kept) {
    ok('a refusal is not saved either', kept === false);
    ok('...and still leaves the app alone', cache.held[sw.PAGE].body.indexOf('real app') !== -1);

    world.next = function () { return Promise.reject(new Error('offline')); };
    return sw.catchUp(cache);

  }).then(function (kept) {
    ok('no signal saves nothing', kept === false);
    ok('...and still leaves the app alone', cache.held[sw.PAGE].body.indexOf('real app') !== -1);

    world.next = function () {
      return Promise.resolve(reply('<html>a newer app ' + sw.MARK + '</html>'));
    };
    return sw.catchUp(cache);

  }).then(function (kept) {
    ok('a real newer copy is saved', kept === true);
    ok('...and it is the newer one that is held now',
       cache.held[sw.PAGE].body.indexOf('newer app') !== -1, cache.held[sw.PAGE].body);

    /* ---------- 4. old caches are cleared out ---------- */
    var a = evt(null);
    sw.on.activate(a);
    return a.waited;

  }).then(function () {
    ok('an old cache is thrown away', world.deleted.indexOf('flowlist-old') !== -1,
       world.deleted.join(','));
    ok('...and the one in use is not', world.deleted.indexOf(sw.VERSION) === -1);

    /* ---------- 5. the page still declares itself ---------- */
    var mark = document.querySelector('meta[name="flowlist-app"]');
    ok('the page carries the marker the worker looks for', !!mark);
    ok('...and it is the same one', sw.MARK.indexOf('flowlist-app') !== -1);

    /* ---------- 6. and nothing reaches out to Google any more ---------- */
    var out = Array.prototype.map.call(
      document.querySelectorAll('link[href], script[src]'),
      function (e) { return e.getAttribute('href') || e.getAttribute('src'); }).join(' ');
    ok('no stylesheet is fetched from Google', out.indexOf('googleapis') === -1, out.slice(0, 120));
    ok('...and no font file either', out.indexOf('gstatic') === -1);
    var faces = Array.prototype.filter.call(document.styleSheets, function (s) {
      try { return Array.prototype.some.call(s.cssRules, function (r) { return r instanceof CSSFontFaceRule; }); }
      catch (e) { return false; }
    });
    ok('the faces are carried in the page instead', faces.length > 0);

  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'OFFLINE ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'offresults';
    pre.textContent = '\n' + OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
