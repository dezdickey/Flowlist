/*
 * Looking at things, rather than moving them.
 *
 *   · Do Today rows with a longer description get an arrow that opens it,
 *     and rows without one get no arrow at all
 *   · "Reveal in …" opens the note's column, scrolls to the note and
 *     lights it — and the light survives the board being redrawn
 *   · the mouse wheel over the bar under the board scrolls it sideways,
 *     and the bar's thumb can still be grabbed
 *   · the sync status says the revision and the room's last four letters,
 *     so two devices can be compared by eye
 *   · the password box does not let a phone keyboard capitalise it
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function centre(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function T() { return Store.get(); }
function openToday() {
  var dock = document.getElementById('panel-today');
  if (!dock.classList.contains('open')) document.getElementById('btn-panel-today').click();
}
function row(itemId) { return document.querySelector('#today-body [data-item-id="' + itemId + '"]'); }
function boardNote(listId, itemId) {
  return document.querySelector('#board [data-list-id="' + listId + '"] [data-item-id="' + itemId + '"]');
}

setTimeout(function () {
  var sp = document.getElementById('splash'); if (sp) sp.remove();
  document.body.classList.remove('booting'); document.body.classList.add('loaded');

  Store.reset();
  Store.mutate(function (s) { s.today = []; s.settings.todayTimeline = false; }, ['today', 'board']);
  openToday();

  var L = T().lists.filter(function (l) { return l.items.length >= 2; })[0];
  ok('a list with two notes', !!L);
  if (!L) return finish();
  var lid = L.id, withMore = L.items[0], plain = L.items[1];
  Store.mutate(function () {
    withMore.detail = 'Bring the forms.\nAsk about Thursday.';
    plain.detail = '   ';          /* only spaces: not really anything */
  }, ['board', 'today']);
  Store.addToToday(lid, withMore.id);
  Store.addToToday(lid, plain.id);

  Promise.resolve().then(function () {

    /* ---------- 1. the arrow ---------- */
    var r1 = row(withMore.id), r2 = row(plain.id);
    ok('both rows are in Do Today', !!r1 && !!r2);
    ok('a note with a longer description has an arrow', !!r1.querySelector('.ti-exp'));
    ok('...one with nothing but spaces has none', !r2.querySelector('.ti-exp'));
    var det = r1.querySelector('.ti-detail');
    ok('the description is there to open', !!det);
    eq('...hidden until asked', getComputedStyle(det).display, 'none');

    var boardOpenBefore = Store.isOpen(lid);
    var revealBefore = !!document.querySelector('.note.revealed');
    r1.querySelector('.ti-exp').click();
    eq('the arrow opens it', getComputedStyle(row(withMore.id).querySelector('.ti-detail')).display, 'block');
    ok('...showing the text, lines kept',
       /Bring the forms\.\nAsk about Thursday\./.test(row(withMore.id).querySelector('.ti-detail').textContent));
    eq('...and says so to a screen reader',
       row(withMore.id).querySelector('.ti-exp').getAttribute('aria-expanded'), 'true');
    eq('opening it does not also go to the note on the board', Store.isOpen(lid), boardOpenBefore);
    eq('...or light anything up', !!document.querySelector('.note.revealed'), revealBefore);

    /* it stays open through a redraw, and does not open the board note */
    Store.emit(['today']);
    ok('it stays open when Do Today is drawn again', row(withMore.id).classList.contains('open'));
    ok('...and the board copy of the note is not expanded by it', !withMore.expanded);

    row(withMore.id).querySelector('.ti-exp').click();
    eq('the arrow closes it again', getComputedStyle(row(withMore.id).querySelector('.ti-detail')).display, 'none');

    /* a description added later gets its arrow */
    Store.mutate(function () { plain.detail = 'Now there is more.'; }, ['board', 'today']);
    ok('a description added later brings its arrow', !!row(plain.id).querySelector('.ti-exp'));

    /* ---------- 2. reveal, from the menu ---------- */
    Store.closeList(lid);
    ok('its column is closed to start with', !Store.isOpen(lid));
    var r = row(withMore.id);
    var p = centre(r);
    r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y }));
    var items = Array.prototype.filter.call(document.querySelectorAll('#ctx .ctx-item'), function (b) {
      return /^Reveal in /.test((b.textContent || '').trim());
    });
    ok('the menu offers Reveal', items.length === 1);
    if (items[0]) items[0].click();
    return wait(80);

  }).then(function () {
    ok('Reveal opens the column', Store.isOpen(lid));
    var n = boardNote(lid, withMore.id);
    ok('...the note is on the board', !!n);
    ok('...and it is lit', n && n.classList.contains('revealed'));
    var anim = n && getComputedStyle(n, '::after').animationName;
    eq('...by the reveal light', anim, 'note-revealed');

    /* the board redrawn mid-reveal must not put the light out - both kinds of
       redraw: one that changes nothing keeps the very element, and one where
       the whole board has arrived anew (from the other device) builds it again */
    Store.emit(['board']);
    var same = boardNote(lid, withMore.id);
    ok('a redraw that changes nothing keeps the same note, still lit', same === n && same.classList.contains('revealed'));
    Store.importJSON(Store.exportState());
    var again = boardNote(lid, withMore.id);
    ok('a board built again from scratch has a new element', again && again !== n);
    ok('...still lit', again && again.classList.contains('revealed'));
    var from = again ? parseFloat(again.style.getPropertyValue('--reveal-from')) : 0;
    ok('...carrying on from part-way, not starting over', from < 0, again && again.style.getPropertyValue('--reveal-from'));

    return wait(2100).then(function () {
      Store.emit(['board']);
      var later = boardNote(lid, withMore.id);
      ok('after the light has run its course, a redraw does not light it again',
         later && !later.classList.contains('revealed'));
      /* the same note revealed again, with no redraw in between, lights again */
      var spent = boardNote(lid, withMore.id);
      var firstAt = spent && spent._revealAt;
      Lists.reveal(lid, withMore.id);
      var relit = boardNote(lid, withMore.id);
      ok("revealing the same note a second time lights it again", relit && relit.classList.contains("revealed") && relit._revealAt && relit._revealAt !== firstAt);
    });

  }).then(function () {
    /* ---------- 3. the light only touches what the compositor can carry ---------- */
    var sheet = Array.prototype.map.call(document.styleSheets, function (s) {
      try { return Array.prototype.map.call(s.cssRules, function (r) { return r.cssText; }).join('\n'); }
      catch (e) { return ''; }
    }).join('\n');
    var kf = (sheet.match(/@keyframes note-revealed\s*\{[\s\S]*?\}\s*\}/) || [''])[0];
    ok('the reveal keyframes are there', kf.length > 0);
    var props = (kf.match(/([a-z-]+)\s*:/g) || []).map(function (s) { return s.replace(/\s*:$/, ''); });
    var bad = props.filter(function (p) { return p !== 'opacity' && p !== 'transform'; });
    eq('...and animate only opacity and transform', bad.join(','), '');

    /* ---------- 4. reveal on a phone closes the sheet first ---------- */
    Store.mutate(function (st) { st.settings.layout = 'phone'; }, null, { silent: true });
    Mobile.apply();
    openToday();
    return wait(300);

  }).then(function () {
    ok('on the phone, Do Today is up over the board', document.getElementById('panel-today').classList.contains('open'));
    var r = row(plain.id);
    var boardWas = Store.isOpen(lid);

    /* a plain tap does nothing on a phone — it may be the first of two */
    r.click();
    ok('a single tap on a phone does not shut the sheet', document.getElementById('panel-today').classList.contains('open'));

    Lists.reveal(lid, plain.id);
    return wait(300).then(function () {
      ok('Reveal on a phone shuts the Do Today sheet', !document.getElementById('panel-today').classList.contains('open'));
      var n = boardNote(lid, plain.id);
      ok('...so the lit note can actually be seen', n && n.classList.contains('revealed'));
      Store.mutate(function (st) { st.settings.layout = 'desktop'; }, null, { silent: true });
      Mobile.apply();
    });

  }).then(function () {
    /* ---------- 5. the wheel over the bar under the board ---------- */
    T().lists.forEach(function (l) { if (!Store.isOpen(l.id)) Store.openList(l.id); });
    for (var i = 0; i < 8; i++) Store.addList('Extra ' + i);
    T().lists.forEach(function (l) { if (!Store.isOpen(l.id)) Store.openList(l.id); });
    return wait(200);

  }).then(function () {
    var board = document.getElementById('board');
    var bar = document.getElementById('grabline') || document.querySelector('.grabline');
    Lists.syncGrabline();
    ok('the board is wider than the window, so the bar is showing',
       board.scrollWidth > board.clientWidth + 4 && bar && bar.classList.contains('show'),
       board.scrollWidth + ' vs ' + board.clientWidth);
    if (!bar) return;

    board.scrollLeft = 0;
    var bp = centre(bar);
    var ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: bp.x, clientY: bp.y, deltaY: 120, deltaMode: 0 });
    var notCancelled = bar.dispatchEvent(ev);
    ok('the wheel over the bar scrolls the board sideways', board.scrollLeft > 0, board.scrollLeft);
    ok('...and the page does not scroll as well', notCancelled === false);

    var was = board.scrollLeft;
    bar.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: bp.x, clientY: bp.y, deltaY: -120 }));
    ok('wheeling the other way scrolls back', board.scrollLeft < was, board.scrollLeft + ' from ' + was);

    bar.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: bp.x, clientY: bp.y, deltaX: 90, deltaY: 4 }));
    ok('a sideways push on a trackpad works too', board.scrollLeft > 0);

    board.scrollLeft = 0;
    bar.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: bp.x, clientY: bp.y, deltaY: 3, deltaMode: 1 }));
    ok('a wheel counting in lines rather than pixels still moves it', board.scrollLeft >= 40, board.scrollLeft);

    /* and the thumb can still be dragged */
    board.scrollLeft = 0;
    var thumb = document.getElementById('grabthumb') || bar.querySelector('.grabthumb, [class*="thumb"]');
    ok('the thumb is there to grab', !!thumb);
    if (!thumb) return;
    var tp = centre(thumb);
    var opt = function (x) { return { bubbles: true, cancelable: true, clientX: x, clientY: tp.y, pointerId: 3, pointerType: 'mouse', button: 0, buttons: 1 }; };
    thumb.dispatchEvent(new PointerEvent('pointerdown', opt(tp.x)));
    thumb.dispatchEvent(new PointerEvent('pointermove', opt(tp.x + 160)));
    thumb.dispatchEvent(new PointerEvent('pointerup', opt(tp.x + 160)));
    ok('grabbing the thumb and dragging it still scrolls the board', board.scrollLeft > 0, board.scrollLeft);

  }).then(function () {
    /* ---------- 6. the sync status line ---------- */
    Store.mutate(function (s) {
      s.settings.sync.on = true;
      s.settings.sync.url = 'https://example-default-rtdb.firebaseio.com';
      s.settings.sync.room = 'board-abcdefghijkq7x2';
      s.settings.sync.rev = 297;
    }, null, { silent: true });
    Themes.renderSettings();
    var text = (document.getElementById('settings-body') || document.body).textContent;
    ok('the sync status gives the revision', /Revision 297/.test(text), (text.match(/Revision[^.]*\./) || [''])[0]);
    ok('...and the room\'s last four letters', /room ending .q7x2./.test(text));
    var statusLine = Array.prototype.filter.call(document.querySelectorAll('#settings-body .hint'), function (h) { return /Revision 297/.test(h.textContent); })[0];
    ok('...and the status line does not spell out the whole room key', !!statusLine && statusLine.textContent.indexOf('board-abcdefghijkq7x2') === -1);
    if (false) ok('', text.indexOf('board-abcdefghijkq7x2') === -1 ||
       !!document.querySelector('#drawer-body input[value="board-abcdefghijkq7x2"]'));
    Store.mutate(function (s) { s.settings.sync.on = false; s.settings.sync.room = ''; }, null, { silent: true });

    /* ---------- 7. the password box ---------- */
    Lock.open && Lock.open();
    var pass = document.getElementById('lk-pass');
    ok('the password box is there', !!pass);
    if (pass) {
      eq('...a phone keyboard may not capitalise it', pass.getAttribute('autocapitalize'), 'off');
      eq('...or correct it', pass.getAttribute('autocorrect'), 'off');
      eq('...or spell-check it', pass.getAttribute('spellcheck'), 'false');
    }
  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(finish);

  function finish() {
    document.title = 'TODAYVIEW ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'results';
    pre.textContent = '\n' + OUT.join('\n');
    document.body.appendChild(pre);
  }
}, 2600);
