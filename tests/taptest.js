/*
 * Tapping a note, and tapping the chips on it.
 *
 * Every tap here is hit-tested the way the browser does it — ask what is
 * at that point on screen, and dispatch there. Dispatching straight at an
 * element would prove nothing, because the hit test is the whole subject.
 *
 * Two taps open the note's menu, and nothing else happens on the way:
 *   - a phone sends one more click a moment after the finger lifts, and
 *     works out what it hit at that moment rather than at the moment you
 *     touched. The menu had just opened under the finger, so that stray
 *     click landed on the item now sitting there — "Add note above" —
 *     and made a note.
 *   - the chips are buttons sitting exactly where a thumb lands, so a
 *     tap meant for the note cleared the time or pulled it out of Do
 *     Today. Now the chip is inert and only its × takes a tap, in a box
 *     barely larger than the glyph: a near miss has to miss.
 *   - and because the whole chip used to be a button, taps on it were
 *     skipped for the menu, so whether the menu opened at all depended
 *     on precisely where you touched.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

/* a tap: whatever is on top at that point gets it, and it bubbles */
function tapAt(x, y) {
  var el = document.elementFromPoint(x, y);
  if (!el) return null;
  el.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true, cancelable: true, clientX: x, clientY: y,
    pointerId: 1, pointerType: 'touch', button: 0, buttons: 0
  }));
  return el;
}
/* two taps, close together and close in time */
function twiceAt(x, y) { tapAt(x, y); return tapAt(x + 2, y + 1); }

/* the stray click a phone sends after the finger lifts */
function stray(x, y) {
  var hit = document.elementFromPoint(x, y);
  if (hit) hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return hit;
}
/* a finger on a button: the tap, then the click it turns into */
function pressAt(x, y) { tapAt(x, y); return stray(x, y); }

function centre(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function menuEl() { return document.getElementById('ctx'); }
function shown() { var c = menuEl(); return !!c && c.classList.contains('show'); }
function hide() { var c = menuEl(); if (c) c.classList.remove('show'); }
function labels() {
  return Array.prototype.map.call(menuEl().querySelectorAll('.ctx-item'),
    function (b) { return (b.textContent || '').trim(); });
}
function itemNamed(t) {
  return Array.prototype.filter.call(menuEl().querySelectorAll('.ctx-item'),
    function (b) { return (b.textContent || '').trim() === t; })[0];
}
function noteCount() {
  return Store.get().lists.reduce(function (n, l) { return n + (l.items || []).length; }, 0);
}
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

setTimeout(function () {
  Promise.resolve().then(function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    document.body.classList.add('phone');
    Store.reset();
    Store.get().lists.forEach(function (l) { if (!Store.isOpen(l.id)) Store.openList(l.id); });

    var list = Store.get().lists.filter(function (l) { return (l.items || []).length; })[0];
    ok('a category with a note in it', !!list);
    if (!list) return;
    var listId = list.id, itemId = list.items[0].id;

    function live() { return Store.get().lists.filter(function (l) { return l.id === listId; })[0]; }
    function item() { return live().items.filter(function (i) { return i.id === itemId; })[0]; }
    function note() { return document.querySelector('[data-item-id="' + itemId + '"]'); }
    function chips() { return note().querySelectorAll('.note-tags .tag'); }
    function xOf(chip) { return chip.querySelector('button'); }

    /* give it both chips, so a thumb has something to land on */
    Store.mutate(function () { item().hour = 17; }, ['board', 'today']);
    Store.addToToday(listId, itemId);
    function retag() {
      if (item().hour !== 17) Store.mutate(function () { item().hour = 17; }, ['board', 'today']);
      if (!Store.inToday(listId, itemId)) Store.addToToday(listId, itemId);
    }

    ok('the note is on screen', !!note());
    if (!note()) return;
    eq('it is wearing both chips', chips().length, 2);

    /* ---------- 1. the shape of the target ---------- */
    var chip = chips()[0], x = xOf(chip);
    eq('the chip itself is not a target',
       getComputedStyle(chip).pointerEvents, 'none');
    eq('...but its × is', getComputedStyle(x).pointerEvents, 'auto');

    var cr = chip.getBoundingClientRect(), xr = x.getBoundingClientRect();
    ok('the × is a small box', xr.width <= 17 && xr.height <= 17,
       Math.round(xr.width) + 'x' + Math.round(xr.height));
    ok('...much smaller than the chip it sits in', xr.width < cr.width / 2,
       Math.round(xr.width) + ' of ' + Math.round(cr.width));

    ok('a point on the × belongs to the ×',
       document.elementFromPoint(xr.left + xr.width / 2, xr.top + xr.height / 2) === x);
    ok('...and a point on the label does not',
       document.elementFromPoint(cr.left + 4, cr.top + cr.height / 2) !== x);

    /* ---------- 2. a near miss misses ---------- */
    var startCount = noteCount();
    pressAt(cr.left + 4, cr.top + cr.height / 2);
    eq('a tap on the clock end of the chip keeps the time', item().hour, 17);
    pressAt(cr.left + cr.width / 2 - 2, cr.top + cr.height / 2);
    eq('...and one in the middle of it keeps the time', item().hour, 17);

    var tchip = chips()[1], tcr = tchip.getBoundingClientRect();
    pressAt(tcr.left + 4, tcr.top + tcr.height / 2);
    ok('a tap on the Today label leaves it in Do Today',
       Store.inToday(listId, itemId));
    eq('...and nothing was added or lost', noteCount(), startCount);

    /* ---------- 3. a direct hit lands ---------- */
    var live1 = xOf(chips()[1]).getBoundingClientRect();
    pressAt(live1.left + live1.width / 2, live1.top + live1.height / 2);
    ok('the × on the Today chip takes it out of Do Today',
       !Store.inToday(listId, itemId));
    retag();

    var live0 = xOf(chips()[0]).getBoundingClientRect();
    pressAt(live0.left + live0.width / 2, live0.top + live0.height / 2);
    eq('the × on the time chip clears the time', item().hour, null);
    retag();
    eq('...and the board is otherwise untouched', noteCount(), startCount);

    /* ---------- 4. two taps on a chip still open the menu ---------- */
    hide();
    var c0 = chips()[0].getBoundingClientRect();
    twiceAt(c0.left + 4, c0.top + c0.height / 2);
    ok('two taps on the time chip open the menu', shown());
    eq('...and the time is untouched', item().hour, 17);
    ok('...and it is still in Do Today', Store.inToday(listId, itemId));

    hide();
    var c1 = chips()[1].getBoundingClientRect();
    twiceAt(c1.left + 4, c1.top + c1.height / 2);
    ok('two taps on the Today chip open the menu too', shown());
    ok('...and it stays in Do Today', Store.inToday(listId, itemId));
    eq('...with its time intact', item().hour, 17);

    /* ---------- 5. wherever on the note you land ---------- */
    var r = note().getBoundingClientRect();
    [['near the left edge',  r.left + 6,           r.top + 14],
     ['in the middle',       r.left + r.width / 2, r.top + 14],
     ['near the right edge', r.right - 40,         r.top + 14],
     ['down among the tags', r.left + r.width / 2, r.bottom - 4]
    ].forEach(function (s) {
      hide();
      twiceAt(s[1], s[2]);
      ok('two taps ' + s[0] + ' open the menu', shown());
    });

    /* ---------- 6. the stray click behind them ---------- */
    hide();
    var b = { x: r.left + r.width / 2, y: r.top + 14 };
    var before = noteCount();
    twiceAt(b.x, b.y);
    ok('the menu is open', shown());
    ok('...and stands beside the finger, not on it',
       menuEl().getBoundingClientRect().left >= b.x, menuEl().style.left);
    ok('...and it is deaf for the moment',
       getComputedStyle(menuEl()).pointerEvents === 'none');

    var hit = stray(b.x, b.y);
    ok('the stray click falls through the menu', !menuEl().contains(hit),
       hit && (hit.className || hit.tagName));
    eq('...so no note is added', noteCount(), before);
    eq('...and the time survives it', item().hour, 17);
    ok('...as does Do Today', Store.inToday(listId, itemId));

    /* ---------- 7. but the menu works when a finger means it ---------- */
    return wait(450).then(function () {
      ok('the menu wakes up again',
         getComputedStyle(menuEl()).pointerEvents !== 'none');
      var add = itemNamed('Add note above');
      ok('"Add note above" is in it', !!add, labels().join(' / '));
      if (add) {
        var ap = centre(add);
        ok('a real tap lands inside the menu', menuEl().contains(stray(ap.x, ap.y)));
        eq('...and adds the note', noteCount(), before + 1);
      }
      var fresh = live().items.filter(function (i) { return i.text === ''; })[0];
      if (fresh) Store.deleteNote(listId, fresh.id);
      eq('...tidied away again', noteCount(), before);

      /* ---------- 8. two slow taps are two taps ---------- */
      hide();
      return wait(450).then(function () {
        var rr = note().getBoundingClientRect();
        var p = { x: rr.left + rr.width / 2, y: rr.top + 14 };
        tapAt(p.x, p.y);
        return wait(450).then(function () {
          tapAt(p.x, p.y);
          ok('two slow taps open nothing', !shown());
          eq('...and change nothing', noteCount(), startCount);
          eq('...leaving the time alone', item().hour, 17);
          ok('...and Do Today alone', Store.inToday(listId, itemId));

          /* ---------- 9. and the menu offers what it should ---------- */
          hide();
          twiceAt(p.x, p.y);
          var L = labels().join(' / ');
          ok('the menu offers Rename', L.indexOf('Rename') !== -1, L);
          ok('...and Delete note', L.indexOf('Delete note') !== -1, L);
          ok('...and a way to leave Do Today',
             L.indexOf('Remove from Do Today') !== -1, L);
          hide();
          document.body.classList.remove('phone');
        });
      });
    });
  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'TAP ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'tapresults';
    pre.textContent = '\n' + OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
