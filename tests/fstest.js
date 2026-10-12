/*
 * Filling the screen.
 *
 * The awkward part of this feature is that it cannot be tested by simply
 * calling it: a browser refuses fullscreen outside a real gesture, and a
 * synthetic event is never a real gesture. So what is checked here is
 * what the app *asks for* — the browser's own answer is its business.
 *
 * That is why js/fullscreen.js looks the two calls up when it needs them
 * instead of keeping them from load: it lets a stand-in be put in the way.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var KEY = 'flowlist.fullscreen';
var realAsk = HTMLElement.prototype.requestFullscreen;
var asked = 0, dropped = 0, lastOpts = null, pretendOn = false;

/* stand-ins for the two calls, and for the state they would change */
function stub() {
  document.documentElement.requestFullscreen = function (o) {
    asked++; lastOpts = o; return Promise.resolve();
  };
  document.exitFullscreen = function () { dropped++; return Promise.resolve(); };
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true, get: function () { return pretendOn ? document.documentElement : null; }
  });
}
function forget() { try { localStorage.removeItem(KEY); } catch (e) {} }
function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }

function tap() {
  window.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch'
  }));
}
function key() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
}

setTimeout(function () {
  try {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');

    /* ---------- 1. is it there at all ---------- */
    ok('this browser can do it', Fullscreen.supported());
    ok('...and the real call is the one it found', !!realAsk);

    stub();
    Fullscreen.reset();
    forget();

    /* ---------- 2. the setting ---------- */
    ok('never asked means yes', Fullscreen.wanted());
    Fullscreen.want(false);
    eq('turning it off is written down', stored(), '0');
    ok('...and read back', !Fullscreen.wanted());
    Fullscreen.want(true);
    eq('turning it on is written down', stored(), '1');
    ok('...and read back', Fullscreen.wanted());

    /* ---------- 3. going in ---------- */
    asked = 0; pretendOn = false;
    ok('entering asks for the screen', Fullscreen.enter());
    eq('...once', asked, 1);
    ok('...with the navigation bar hidden too',
       !!lastOpts && lastOpts.navigationUI === 'hide', JSON.stringify(lastOpts));

    pretendOn = true;
    ok('asking again while already there does nothing', Fullscreen.enter() === false);
    eq('...and does not ask twice', asked, 1);

    /* ---------- 4. and out ---------- */
    dropped = 0;
    ok('leaving gives the screen back', Fullscreen.exit());
    eq('...once', dropped, 1);
    pretendOn = false;
    ok('leaving when not there does nothing', Fullscreen.exit() === false);
    eq('...and does not ask twice', dropped, 1);

    /* the switch in Settings acts at once, because it is inside a click */
    asked = 0; dropped = 0; pretendOn = false;
    Fullscreen.want(true);
    eq('the switch turned on enters straight away', asked, 1);
    pretendOn = true;
    Fullscreen.want(false);
    eq('...and turned off leaves straight away', dropped, 1);
    eq('...and the choice is kept', stored(), '0');
    pretendOn = false;

    /* ---------- 5. the first tap ---------- */
    asked = 0;
    Fullscreen.reset(); forget();
    ok('it does not wait for a tap in the wide shape',
       Fullscreen.arm() === false || Mobile.isPhone());

    Fullscreen.reset(); forget();
    ok('asked to, it waits', Fullscreen.arm(true) === true);
    eq('...and asks for nothing yet', asked, 0);
    tap();
    eq('the first tap asks for the screen', asked, 1);
    tap(); tap();
    eq('...and the ones after it do not', asked, 1);

    /* a key does just as well */
    asked = 0;
    Fullscreen.reset();
    Fullscreen.arm(true);
    key();
    eq('a key press will do instead', asked, 1);
    tap();
    eq('...and then the tap is not needed', asked, 1);

    /* it only waits once */
    Fullscreen.reset();
    ok('it waits when asked', Fullscreen.arm(true) === true);
    ok('...and not twice over', Fullscreen.arm(true) === false);

    /* and it respects the switch */
    asked = 0;
    Fullscreen.reset();
    Fullscreen.want(false);
    Fullscreen.reset();
    ok('turned off, it does not wait at all', Fullscreen.arm(true) === false);
    tap();
    eq('...and a tap asks for nothing', asked, 0);
    forget();

    /* ---------- 6. the switch is in Settings ---------- */
    Themes.renderSettings();
    var body = document.getElementById('drawer-body') ||
               document.querySelector('.drawer-body, #settings-body');
    var text = body ? body.textContent : document.body.textContent;
    ok('Settings offers it', text.indexOf('Fill the screen') !== -1);
    ok('...next to the shape it belongs with', text.indexOf('Shape') !== -1);

    /* ---------- 7. and the installable copy is declared ---------- */
    var man = document.querySelector('link[rel="manifest"]');
    ok('the page points at a manifest', !!man);
    eq('...and asks for it with the gate cookie',
       man && man.getAttribute('crossorigin'), 'use-credentials');
    var tc = document.querySelector('meta[name="theme-color"]');
    ok('there is a theme colour for the installed window', !!tc);

  } catch (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }

  forget();
  document.title = 'FS ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre'); pre.id = 'fsresults';
  pre.textContent = '\n' + OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
