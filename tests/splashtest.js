/* the splash duration setting */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function drawerRow(name) { return document.querySelector('[data-slider="' + name + '"]'); }
function done() {
  document.title = 'SPLASH ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre');
  pre.id = 'splashresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}

setTimeout(function () {
  try {
    /* ---------- the element survives boot so it can be replayed ---------- */
    ok('the splash is still in the DOM after boot', !!document.getElementById('splash'));
    ok('...but hidden', getComputedStyle(document.getElementById('splash')).visibility === 'hidden',
       getComputedStyle(document.getElementById('splash')).visibility);
    ok('...and not blocking the page',
       document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) !== null);

    /* ---------- the setting ---------- */
    ok('there is a default hold', Store.settings().splashDelay === 600, Store.settings().splashDelay);

    Themes.openDrawer();
    var row = drawerRow('How long it holds');
    ok('the drawer offers a delay slider', !!row);
    ok('it is measured in ms', row.querySelector('input').step === '50', row.querySelector('input').step);
    ok('it runs from 0', row.querySelector('input').min === '0');
    ok('...up to 6000', row.querySelector('input').max === '6000');
    ok('the readout shows ms and seconds', row.querySelector('.num-val').textContent === '600 ms · 0.6s',
       row.querySelector('.num-val').textContent);

    /* dragging it changes the setting and the readout */
    var inp = row.querySelector('input');
    inp.value = 3450;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    ok('moving it stores the new delay', Store.settings().splashDelay === 3450, Store.settings().splashDelay);
    ok('...and the readout follows', drawerRow('How long it holds').querySelector('.num-val').textContent === '3450 ms · 3.5s',
       drawerRow('How long it holds').querySelector('.num-val').textContent);

    inp.value = 0;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    ok('zero reads as off', row.querySelector('.num-val').textContent === 'off',
       row.querySelector('.num-val').textContent);

    /* ---------- it hides with the splash toggle ---------- */
    var toggles = document.querySelectorAll('#settings-body .toggle-row');
    var splashToggle = null;
    toggles.forEach(function (t) { if (t.textContent.indexOf('Loading splash') !== -1) splashToggle = t; });
    ok('the splash toggle is there', !!splashToggle);
    splashToggle.querySelector('.switch').click();
    ok('turning the splash off hides the delay slider', !drawerRow('How long it holds'));
    ok('...and the setting is off', Store.settings().splash === false);

    var toggles2 = document.querySelectorAll('#settings-body .toggle-row');
    var t2 = null;
    toggles2.forEach(function (t) { if (t.textContent.indexOf('Loading splash') !== -1) t2 = t; });
    t2.querySelector('.switch').click();
    ok('turning it back on brings the slider back', !!drawerRow('How long it holds'));

    /* ---------- preview ---------- */
    Store.mutate(function (s) { s.settings.splashDelay = 900; }, null, { silent: true });
    Themes.renderSettings();
    ok('there is a preview button',
       Array.prototype.some.call(document.querySelectorAll('#settings-body .set-btn'),
         function (b) { return b.textContent === 'Preview it'; }));

    App.previewSplash();
    ok('preview shows the splash', document.body.classList.contains('splash-show'));
    ok('...visible again', getComputedStyle(document.getElementById('splash')).visibility === 'visible');
    ok('...with a phrase on it', document.getElementById('splash-phrase').textContent.length > 5,
       document.getElementById('splash-phrase').textContent);
    var bar = document.querySelector('.splash-bar i');
    ok('...and the bar timed to the delay', bar.style.animationDuration === '780ms', bar.style.animationDuration);

    /* the bar tracks a different delay */
    Store.mutate(function (s) { s.settings.splashDelay = 4000; }, null, { silent: true });
    App.previewSplash();
    ok('a longer delay stretches the bar', document.querySelector('.splash-bar i').style.animationDuration === '3880ms',
       document.querySelector('.splash-bar i').style.animationDuration);

    /* a very short delay still gets a usable bar */
    Store.mutate(function (s) { s.settings.splashDelay = 200; }, null, { silent: true });
    App.previewSplash();
    ok('a tiny delay clamps the bar to something visible',
       document.querySelector('.splash-bar i').style.animationDuration === '280ms',
       document.querySelector('.splash-bar i').style.animationDuration);

    /* ---------- persistence ---------- */
    Store.mutate(function (s) { s.settings.splashDelay = 2750; }, null, { silent: true });
    Store.flush();
    var saved = JSON.parse(localStorage.getItem('flowlist.state.v1'));
    ok('the delay is saved', saved.settings.splashDelay === 2750, saved.settings.splashDelay);

    /* an older save with no delay picks up the default */
    var legacy = JSON.parse(Store.exportJSON());
    delete legacy.settings.splashDelay;
    Store.importJSON(JSON.stringify(legacy));
    ok('an older save gets the default hold', Store.settings().splashDelay === 600,
       Store.settings().splashDelay);

    Themes.closeDrawer();
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }

  /* ---------- the preview clears itself ---------- */
  Store.mutate(function (s) { s.settings.splashDelay = 600; }, null, { silent: true });
  App.previewSplash();
  var wasShowing = document.body.classList.contains('splash-show');
  setTimeout(function () {
    try {
      ok('preview was showing', wasShowing);
      ok('...and clears itself when the delay is up', !document.body.classList.contains('splash-show'));
      ok('...leaving the splash hidden again',
         getComputedStyle(document.getElementById('splash')).visibility === 'hidden');
      ok('...with the app still usable',
         document.querySelectorAll('#board .list').length === Store.get().board.length);
    } catch (e) { FAIL++; OUT.push('THREW(late)  ' + e); }
    done();
  }, 1400);
}, 500);
