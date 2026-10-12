/*
 * Picking things up with a finger.
 *
 * A mouse drags after five pixels, because nothing else moves a pointer
 * while a button is held. A finger moves further than that just scrolling,
 * so the same rule turned every swipe into a drag — and the note was put
 * down in whatever category was under the finger, usually one off the side
 * of the screen. It looked exactly like the note had been deleted.
 *
 * The whole of this suite is about that: a swipe must change nothing.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

function pe(type, x, y, kind, target) {
  (target || window).dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y,
    pointerId: 1, pointerType: kind || 'mouse',
    button: type === 'pointermove' ? -1 : 0,
    buttons: type === 'pointerup' ? 0 : 1
  }));
}
function centre(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* every note on the board, as "category/text", so a move anywhere shows up */
function census() {
  return Store.get().lists.map(function (l) {
    return l.name + ':' + (l.items || []).map(function (i) { return i.text; }).join('|');
  }).join(' // ');
}
function noteCount() {
  return Store.get().lists.reduce(function (n, l) { return n + (l.items || []).length; }, 0);
}

setTimeout(function () {
  Promise.resolve().then(function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    Store.reset();
    Store.get().lists.forEach(function (l) { if (!Store.isOpen(l.id)) Store.openList(l.id); });

    var note = document.querySelector('#board .list .note');
    ok('there is a note to try it on', !!note);
    var before = census();
    var beforeCount = noteCount();
    var p = centre(note);

    /* ---------- the bug: a swipe used to carry the note off ---------- */
    pe('pointerdown', p.x, p.y, 'touch', note);
    pe('pointermove', p.x + 40, p.y + 6, 'touch');
    pe('pointermove', p.x + 150, p.y + 10, 'touch');
    pe('pointerup', p.x + 150, p.y + 10, 'touch');
    eq('a sideways swipe moves nothing', census(), before);
    eq('...and loses nothing', noteCount(), beforeCount);

    /* the same going down the screen, which is how you scroll a list */
    pe('pointerdown', p.x, p.y, 'touch', note);
    pe('pointermove', p.x + 4, p.y + 60, 'touch');
    pe('pointermove', p.x + 6, p.y + 200, 'touch');
    pe('pointerup', p.x + 6, p.y + 200, 'touch');
    eq('a scroll down the page moves nothing', census(), before);

    /* a quick tap is not a drag either */
    pe('pointerdown', p.x, p.y, 'touch', note);
    pe('pointerup', p.x, p.y, 'touch');
    eq('a tap moves nothing', census(), before);

    ok('...and nothing is left mid-drag', !document.body.classList.contains('dnd-active'));

    /* ---------- holding still does pick it up ---------- */
    var note2 = document.querySelector('#board .list .note');
    var q = centre(note2);
    pe('pointerdown', q.x, q.y, 'touch', note2);
    return wait(60).then(function () {
      ok('nothing is picked up straight away', !document.body.classList.contains('dnd-active'));
      return wait(460);
    }).then(function () {
      ok('holding still picks it up', document.body.classList.contains('dnd-active'));
      pe('pointerup', q.x, q.y, 'touch');
      return wait(40);
    }).then(function () {
      ok('...and letting go puts it down', !document.body.classList.contains('dnd-active'));
      eq('...with nothing lost', noteCount(), beforeCount);

      /* straying while waiting calls the whole thing off */
      var note3 = document.querySelector('#board .list .note');
      var s = centre(note3);
      pe('pointerdown', s.x, s.y, 'touch', note3);
      pe('pointermove', s.x + 80, s.y, 'touch');
      return wait(500).then(function () {
        ok('straying before the hold is up cancels it for good',
           !document.body.classList.contains('dnd-active'));
        pe('pointerup', s.x + 80, s.y, 'touch');
        eq('...and still nothing moved', census(), before);
      });
    }).then(function () {
      /* ---------- a mouse still works the old way ---------- */
      var note4 = document.querySelector('#board .list .note');
      var m = centre(note4);
      pe('pointerdown', m.x, m.y, 'mouse', note4);
      pe('pointermove', m.x + 12, m.y + 12, 'mouse');
      ok('a mouse still drags after a few pixels, with no waiting',
         document.body.classList.contains('dnd-active'));
      pe('pointerup', m.x + 12, m.y + 12, 'mouse');
      ok('...and finishes cleanly', !document.body.classList.contains('dnd-active'));
      eq('...having lost nothing either', noteCount(), beforeCount);
    });
  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'HOLD ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'holdresults';
    pre.textContent = '\n' + OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
