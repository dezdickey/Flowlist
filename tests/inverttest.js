var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var cv = function () { return Store.activeCanvas(); };
var swap = function () { return document.getElementById('ctool-invert'); };
var swatches = function () { return [].slice.call(document.querySelectorAll('#ctool-colors .cswatch')); };
var inks = function () { return cv().strokes.map(function (s) { return s.color; }); };
var arrows = function () { return cv().edges.map(function (e) { return e.color; }); };
var drawn = function () {
  return [].slice.call(document.querySelectorAll('#csvg-strokes .cstroke'))
    .map(function (p) { return p.getAttribute('stroke'); });
};

setTimeout(function () {
  try {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    var noAnim = document.createElement('style');
    noAnim.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
    document.head.appendChild(noAnim);
    Store.reset();
    Store.setView('canvas');
    Store.clearCanvas();

    /* ============================================================
       the button
       ============================================================ */
    ok('there is a swap button with the colours', !!swap());
    eq('...at the end of the row', swap().previousElementSibling.title, 'Black');
    eq('...saying what it does', swap().title, 'Swap black and white in everything drawn here');
    ok('...inside the colour group', swap().parentElement.id === 'ctool-colors');
    ok('...with half of it filled in, so it reads as an inversion',
       swap().innerHTML.indexOf('fill="currentColor"') !== -1);

    /* ============================================================
       swapping what is drawn
       ============================================================ */
    Store.addStroke({ color: '#ffffff', width: 4, pts: [0, 0, 10, 10] });
    Store.addStroke({ color: '#000000', width: 4, pts: [0, 20, 10, 30] });
    Store.addStroke({ color: '#5cc8ff', width: 2, pts: [0, 40, 10, 50] });
    eq('three marks to begin with', cv().strokes.length, 3);

    swap().click();
    eq('the white one is now black', inks()[0], '#000000');
    eq('the black one is now white', inks()[1], '#ffffff');
    eq('the blue one is left alone', inks()[2], '#5cc8ff');
    eq('...and the canvas is repainted', drawn()[0], '#000000');
    eq('...both ways', drawn()[1], '#ffffff');

    swap().click();
    eq('pressing it again puts the first back', inks()[0], '#ffffff');
    eq('...and the second', inks()[1], '#000000');
    eq('...and never touched the third', inks()[2], '#5cc8ff');

    /* ============================================================
       arrows go with them
       ============================================================ */
    var a = cv().nodes;
    Store.addEdge({ x: 0, y: 0 }, { x: 60, y: 60 }, '#ffffff', 2);
    Store.addEdge({ x: 0, y: 80 }, { x: 60, y: 140 }, '#000000', 2);
    Store.addEdge({ x: 0, y: 160 }, { x: 60, y: 220 }, '#f2c94c', 2);
    swap().click();
    eq('a white arrow turns black', arrows()[0], '#000000');
    eq('a black arrow turns white', arrows()[1], '#ffffff');
    eq('a yellow one stays yellow', arrows()[2], '#f2c94c');
    swap().click();
    eq('and back again', arrows()[0], '#ffffff');

    /* ============================================================
       the pen turns round too
       ============================================================ */
    swatches()[9].click();                       // black
    ok('black is in hand', swatches()[9].classList.contains('on'));
    swap().click();
    ok('the pen is now white', swatches()[8].classList.contains('on'),
       'on: ' + swatches().map(function (s, i) { return s.classList.contains('on') ? i : ''; }).join(''));
    ok('...and no longer black', !swatches()[9].classList.contains('on'));
    Store.addStroke({ color: '#5cc8ff', width: 2, pts: [0, 0, 5, 5] });   // marker of the moment
    swap().click();
    ok('and back to black on the next press', swatches()[9].classList.contains('on'));

    swatches()[0].click();                       // a colour that is neither
    var was = swatches()[0].style.getPropertyValue('--c');
    swap().click();
    ok('a pen that is neither black nor white is left where it is',
       swatches()[0].classList.contains('on'), was);
    swap().click();

    /* ============================================================
       what it does not touch
       ============================================================ */
    var note = Store.addNode({ kind: 'note', x: 0, y: 0, w: 210, h: 120, text: 'hi', color: '#ffffff' });
    swap().click();
    eq('a white note card keeps its colour', note.color, '#ffffff');
    swap().click();

    /* only this canvas */
    var other = Store.addCanvas('Somewhere else');
    Store.openCanvas(other.id);
    Store.addStroke({ color: '#ffffff', width: 4, pts: [0, 0, 9, 9] });
    var mine = other.strokes[0];
    Store.openCanvas(Store.get().canvases[0].id);
    swap().click();
    eq('the other canvas is not touched', mine.color, '#ffffff');

    /* nothing to do says so */
    Store.openCanvas(other.id);
    Store.clearCanvas();
    Store.addStroke({ color: '#6ee7a0', width: 2, pts: [0, 0, 8, 8] });
    swap().click();
    ok('with nothing black or white it says so',
       document.getElementById('toast').textContent.indexOf('Nothing is drawn') === 0,
       document.getElementById('toast').textContent);
    eq('...and changes nothing', cv().strokes[0].color, '#6ee7a0');

    /* it is saved */
    Store.addStroke({ color: '#000000', width: 4, pts: [0, 30, 8, 38] });
    swap().click();
    Store.flush();
    var saved = JSON.parse(localStorage.getItem('flowlist.state.v1'));
    var savedCv = saved.canvases.filter(function (c) { return c.id === other.id; })[0];
    eq('the swap is written down', savedCv.strokes[1].color, '#ffffff');
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }
  document.title = 'INVERT ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre'); pre.id = 'invresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2400);
