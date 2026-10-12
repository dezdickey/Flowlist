/*
 * Dragging in and around Do Today.
 *
 * Every drag here is real pointer events on real coordinates, and every
 * drop is found the way the engine finds it — document.elementsFromPoint
 * — because the bugs being pinned are about WHICH zone a drop lands in:
 *
 *   · reordering two notes under the same hour did nothing and sprang
 *     back: the hour slot set the hour and never touched the order
 *   · a drop on an hour's label, rather than its slot, landed on the dock
 *     itself, which in timeline mode did nothing at all
 *   · a Do Today row let go over a board column MOVED the note into that
 *     column — out of its own list
 *   · the drop went to wherever the last move event was, not where the
 *     pointer was released
 *   · moving a note between lists dropped it out of Do Today, and turned
 *     its canvas card into "Note deleted"
 *
 * Targets are measured again just before letting go. The dock scrolls
 * itself when a drag nears its edge, and a hand watching the gap adjusts
 * for that; a script that aimed once at the start would not.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function pe(type, x, y, kind, target) {
  (target || window).dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y,
    pointerId: 7, pointerType: kind || 'mouse',
    button: type === 'pointermove' ? -1 : 0,
    buttons: type === 'pointerup' ? 0 : 1
  }));
}
function centre(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

/* Press, travel, look again, let go. `to` is a function so the target can
   be measured afresh at the end. `opts.releaseAt` lets go somewhere other
   than the last move — the flick case. */
function drag(el, to, kind, opts) {
  opts = opts || {};
  var from = centre(el);
  pe('pointerdown', from.x, from.y, kind, el);
  var go = function () {
    var t = to();
    for (var i = 1; i <= 6; i++) {
      pe('pointermove', from.x + (t.x - from.x) * i / 6, from.y + (t.y - from.y) * i / 6, kind);
    }
    return wait(260).then(function () {   /* past the 170ms slide, as a hand would be */
      var t2 = to();
      pe('pointermove', t2.x, t2.y, kind);
      var up = opts.releaseAt ? opts.releaseAt() : t2;
      pe('pointerup', up.x, up.y, kind);
      return wait(40);
    });
  };
  return kind === 'touch' ? wait(460).then(go) : go();
}

function T() { return Store.get(); }
function inList(listId, itemId) { return !!Store.itemById(listId, itemId); }
function sizes() { return T().lists.map(function (l) { return l.id + ':' + l.items.length; }).join(','); }
function setTimeline(on) { Store.mutate(function (s) { s.settings.todayTimeline = on; }, ['today', 'settings']); }
function openToday() {
  var dock = document.getElementById('panel-today');
  if (!dock.classList.contains('open')) document.getElementById('btn-panel-today').click();
}
function slot(h) { return document.querySelector('#today-body .hour-slot[data-hour="' + h + '"]'); }
function aimAt(el) { el.scrollIntoView({ block: "center" }); return centre(el); }
function todayEl(itemId) { return document.querySelector('#today-body [data-item-id="' + itemId + '"]'); }
function boardEl(listId, itemId) {
  return document.querySelector('#board [data-list-id="' + listId + '"] [data-item-id="' + itemId + '"]');
}
function slotOrder(h) {
  return Array.prototype.map.call(
    document.querySelectorAll('#today-body .hour-slot[data-hour="' + h + '"] > .today-item'),
    function (e) { return e.dataset.itemId; });
}
function hourOf(lid, id) { var it = Store.itemById(lid, id); return it ? it.hour : undefined; }

setTimeout(function () {
  var sp = document.getElementById('splash'); if (sp) sp.remove();
  document.body.classList.remove('booting'); document.body.classList.add('loaded');

  Store.reset();
  T().lists.forEach(function (l) { if (!Store.isOpen(l.id)) Store.openList(l.id); });
  Store.mutate(function (s) { s.today = []; }, ['today', 'board']);
  openToday();

  var L = T().lists.filter(function (l) { return l.items.length >= 3; })[0];
  var other = L && T().lists.filter(function (l) { return l.id !== L.id; })[0];
  ok('a list with three notes, and another list', !!L && !!other);
  if (!L || !other) return finish();
  var lid = L.id, a = L.items[0].id, b = L.items[1].id, c = L.items[2].id;
  var countBefore = L.items.length;

  Promise.resolve().then(function () {

    /* ---------- 1. a board note into Do Today, as a list ---------- */
    setTimeline(false);
    return wait(60).then(function () {
      return drag(boardEl(lid, a), function () { return centre(document.getElementById('today-body')); });
    });

  }).then(function () {
    ok('a board note dropped into Do Today is in Do Today', Store.inToday(lid, a));
    ok('...and still in its own list', inList(lid, a));
    eq('...which has lost nothing', Store.listById(lid).items.length, countBefore);

    /* ---------- 2. let go over Do Today after the last move was over the board ---------- */
    Store.removeFromToday(lid, a);
    return wait(60).then(function () {
      var otherCol = document.querySelector('#board [data-list-id="' + other.id + '"] .list-body');
      return drag(boardEl(lid, a),
        function () { return centre(otherCol); },
        'mouse',
        { releaseAt: function () { return centre(document.getElementById('today-body')); } });
    });

  }).then(function () {
    ok('released over Do Today, it lands in Do Today — not where the last move was', Store.inToday(lid, a));
    ok('...and was not moved into the column it passed', inList(lid, a));

    /* ---------- 3. onto an hour ---------- */
    setTimeline(true);
    return wait(60).then(function () {
      return drag(boardEl(lid, b), function () { return centre(slot(10)); });
    });

  }).then(function () {
    ok('dropped on 10 AM it is in Do Today', Store.inToday(lid, b));
    eq('...at 10', hourOf(lid, b), 10);
    ok('...and still in its own list', inList(lid, b));

    /* ---------- 4. from one hour to another ---------- */
    Store.mutate(function () { Store.itemById(lid, c).hour = 14; }, ['today', 'board']);
    Store.addToToday(lid, c);
    return wait(60).then(function () { return drag(todayEl(c), function () { return aimAt(slot(9)); }); });

  }).then(function () {
    eq('a note dragged from 2 PM to 9 AM moves to 9', hourOf(lid, c), 9);
    ok('...stays in Do Today', Store.inToday(lid, c));
    ok('...and in its list', inList(lid, c));

    /* ---------- 5. above another under the same hour ---------- */
    Store.mutate(function () { Store.itemById(lid, b).hour = 9; }, ['today', 'board']);
    return wait(60);

  }).then(function () {
    var before = slotOrder(9);
    eq('two notes under 9 AM', before.length, 2);
    return drag(todayEl(before[1]), function () {
      var r = todayEl(before[0]).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + 3 };
    }).then(function () {
      var after = slotOrder(9);
      eq('the lower one dragged above the upper one goes above it', after[0], before[1]);
      eq('...and the other goes below', after[1], before[0]);
      eq('...both still at 9', hourOf(lid, after[1]), 9);

      /* and back down again */
      return drag(todayEl(after[0]), function () {
        var r = todayEl(after[1]).getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.bottom - 3 };
      }).then(function () {
        eq('and dragged back below, it goes back below', slotOrder(9)[1], before[1]);
      });
    });

  }).then(function () {
    /* ---------- 6. letting go over the hour's label ---------- */
    return drag(todayEl(c), function () {
      return aimAt(slot(11).parentNode.querySelector('.hour-label'));
    });

  }).then(function () {
    eq('dropped on the 11 AM label it goes to 11', hourOf(lid, c), 11);

    /* ---------- 7. into "No time set" ---------- */
    return drag(todayEl(c), function () {
      var body = document.getElementById('today-body');
      body.scrollTop = body.scrollHeight;
      var r = body.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.bottom - 12 };
    });

  }).then(function () {
    eq('dropped below the last hour it has its time taken off', hourOf(lid, c), null);
    ok('...and stays in Do Today', Store.inToday(lid, c));
    var body = document.getElementById('today-body');
    body.scrollTop = 0;

    /* ---------- 8. overshooting the dock onto a board column ---------- */
    var sizesBefore = sizes();
    var hourBefore = hourOf(lid, b);
    return drag(todayEl(b), function () {
      return centre(document.querySelector('#board [data-list-id="' + other.id + '"] .list-body'));
    }).then(function () {
      ok('a Do Today row let go over a board column is not moved into it', inList(lid, b));
      eq('...no list changed size', sizes(), sizesBefore);
      ok('...it is still in Do Today', Store.inToday(lid, b));
      eq('...at the time it had', hourOf(lid, b), hourBefore);
    });

  }).then(function () {
    /* ---------- 9. moving a note between lists keeps its references ---------- */
    Store.addToToday(lid, a);
    var cv = Store.activeCanvas && Store.activeCanvas();
    var refId = null;
    if (cv && Store.addNode) {
      var n = Store.addNode({ kind: 'ref', listId: lid, itemId: a, x: 40, y: 40, w: 200, h: 80 });
      refId = n && n.id;
    }
    Store.moveNote(lid, a, other.id, 0);
    ok('moved to another list, it is still in Do Today', Store.inToday(other.id, a));
    ok('...and not listed under the old one', !Store.inToday(lid, a));
    var dangling = T().today.filter(function (t) { return !Store.itemById(t.listId, t.itemId); }).length;
    eq('...and no Do Today entry points at nothing', dangling, 0);
    if (refId) {
      var node = (Store.activeCanvas().nodes || []).filter(function (x) { return x.id === refId; })[0];
      eq('...and its canvas card follows it', node && node.listId, other.id);
    }

    /* ---------- 10. the same drags with a finger, in the phone shape ---------- */
    Store.moveNote(other.id, a, lid, 0);
    Store.mutate(function (st) { st.settings.layout = 'phone'; }, null, { silent: true });
    Mobile.apply();
    openToday();
    return wait(400);

  }).then(function () {
    ok('the phone shape is up with Do Today over the board',
       document.body.classList.contains('phone') && document.getElementById('panel-today').classList.contains('open'));
    Store.mutate(function () { Store.itemById(lid, c).hour = 16; }, ['today', 'board']);
    return wait(80).then(function () {
      var sizesBefore = sizes();
      return drag(todayEl(c), function () {
        var s = slot(12); s.scrollIntoView({ block: 'center' }); return centre(s);
      }, 'touch').then(function () {
        eq('held and moved to 12 PM with a finger, it goes to 12', hourOf(lid, c), 12);
        ok('...still in its own list', inList(lid, c));
        eq('...and no list changed size', sizes(), sizesBefore);
      });
    });

  }).then(function () {
    Store.mutate(function () { Store.itemById(lid, b).hour = 12; }, ['today', 'board']);
    return wait(80).then(function () {
      var before = slotOrder(12);
      if (before.length < 2) { ok('two notes under 12 PM on the phone', false, before.length); return; }
      return drag(todayEl(before[1]), function () {
        var r = todayEl(before[0]).getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 3 };
      }, 'touch').then(function () {
        eq('on the phone, the lower of two notes under 12 goes above the other', slotOrder(12)[0], before[1]);
      });
    });

  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(finish);

  function finish() {
    document.title = 'TODAYDRAG ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'results';
    pre.textContent = '\n' + OUT.join('\n');
    document.body.appendChild(pre);
  }
}, 2600);
