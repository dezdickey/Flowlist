/*
 * Running inside the Android app.
 *
 * The APK is the same board in a window Android draws edge to edge. Two
 * things in the page therefore have nothing left to do, and both would
 * fail quietly rather than loudly if left alone — which is worse, not
 * better, because a quiet failure on every launch is invisible:
 *
 *   · the service worker, whose whole job is keeping a copy of a page
 *     that is already inside the app
 *   · the fullscreen request, for a screen the window already fills
 *
 * The web view says where it is by putting a word on the end of its user
 * agent. That is what is faked here.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var realUA = navigator.userAgent;
function pretendApp(on) {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    get: function () { return on ? realUA + ' FlowlistApp/1' : realUA; }
  });
}
function tap() {
  window.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch'
  }));
}
function drawerText() {
  var d = document.getElementById('drawer-body') ||
          document.querySelector('.drawer-body, #settings-body');
  return d ? d.textContent : '';
}

setTimeout(function () {
  try {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');

    var asked = 0;
    document.documentElement.requestFullscreen = function () {
      asked++; return Promise.resolve();
    };

    /* ---------- 1. in a browser, it is not the app ---------- */
    pretendApp(false);
    ok('a browser is not the app', Offline.native() === false);
    ok('...and fullscreen agrees', Fullscreen.inApp() === false);

    /* ---------- 2. inside the app ---------- */
    pretendApp(true);
    ok('the app is recognised', Offline.native() === true);
    ok('...by the fullscreen side too', Fullscreen.inApp() === true);

    /* --- no worker: there is nothing to keep a copy of --- */
    ok('no worker is wanted inside the app', Offline.possible() === false);
    ok('...and none is asked for', Offline.start() === false);

    /* --- no fullscreen: the window already fills the screen --- */
    asked = 0;
    Fullscreen.reset();
    try { localStorage.removeItem('flowlist.fullscreen'); } catch (e) {}
    ok('the screen counts as already full', Fullscreen.isOn() === true);
    ok('...so nothing waits for a touch', Fullscreen.arm(true) === false);
    tap(); tap();
    eq('...and no touch asks for it', asked, 0);
    ok('...with nothing left waiting', Fullscreen.disarm() === false);

    /* --- and Settings explains instead of showing a dead switch --- */
    Themes.renderSettings();
    var t = drawerText();
    ok('Settings does not offer a switch that would do nothing',
       t.indexOf('Fill the screen') === -1, t.slice(0, 100));
    ok('...it says why instead',
       t.indexOf('edge to edge') !== -1, t.slice(0, 160));

    /* ---------- 3. and back out again ---------- */
    pretendApp(false);
    Fullscreen.reset();
    ok('a browser is still offered the switch', (function () {
      Themes.renderSettings();
      return drawerText().indexOf('Fill the screen') !== -1;
    })());

    /* ---------- 4. the app the APK actually carries ---------- */
    ok('the page declares itself for the worker',
       !!document.querySelector('meta[name="flowlist-app"]'));
    ok('...and carries its own fonts, so it needs no network to look right',
       Array.prototype.some.call(document.styleSheets, function (s) {
         try {
           return Array.prototype.some.call(s.cssRules, function (r) {
             return r instanceof CSSFontFaceRule &&
                    /data:font/.test(r.style.getPropertyValue('src'));
           });
         } catch (e) { return false; }
       }));

  } catch (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }
  pretendApp(false);
  document.title = 'APP ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre'); pre.id = 'appresults';
  pre.textContent = '\n' + OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
