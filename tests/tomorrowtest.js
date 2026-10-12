/*
 * Tomorrow.
 *
 *   · right-click a note → Tomorrow: it gets a Tomorrow bubble
 *   · Do Today has a folded Tomorrow section at the bottom; open, it lists them
 *   · on the timeline, tomorrow's hours follow today's — only the hours that
 *     have something — then Unset for the ones with no time
 *   · open on one view is open on the other
 *   · when the day comes, the bubble becomes Today and the note is on Do Today
 *
 * The day turning over is done by moving Date.now on a day.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 60); }); };

var DAY = 86400000;
var realNow = Date.now.bind(Date);
var shift = 0;
Date.now = function () { return realNow() + shift; };

var note = function (id) { return document.querySelector('#board [data-item-id="' + id + '"]'); };
var item = function (id) { return Store.itemById('Lwork', id); };
var inToday = function (id) { return Store.inToday('Lwork', id); };
var box = function () { return document.querySelector('#today-body .tomorrow'); };
var rowsIn = function (el) { return el ? [].map.call(el.querySelectorAll('.tm-item .ti-text'), function (t) { return t.textContent; }) : []; };
function menuItem(re) {
  return [].slice.call(document.querySelectorAll('#ctx .ctx-item')).filter(function (b) { return re.test(b.textContent.trim()); })[0];
}
function rightClick(el) {
  var r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 }));
}
function timeline(on) {
  if (!!Store.settings().todayTimeline !== on) document.getElementById('btn-today-mode').click();
}

setTimeout(function () {
  (async function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    try { localStorage.removeItem('flowlist.tomorrowOpen.v1'); } catch (e) {}

    var st = JSON.parse(Store.exportState());
    var mk = function (id, text, hour) { return { id: id, text: text, detail: '', expanded: false, done: false, hour: hour || null }; };
    st.lists = [{ id: 'Lwork', name: 'Work', color: '#5cc8ff', collapsed: false, items: [
      mk('Nfive', 'Call at five'), mk('Nnine', 'Gym at nine'), mk('Nplain', 'No time given'),
      mk('Nplain2', 'Also no time'), mk('Ntoday', 'On today already', 10), mk('Nother', 'Stays put')
    ] }];
    st.board = ['Lwork']; st.closedOrder = [];
    st.today = [{ listId: 'Lwork', itemId: 'Ntoday' }];
    st.settings.todayTimeline = false;
    st.settings.layout = 'desktop';
    st.settings.panels.board.today = true;
    Store.importJSON(JSON.stringify(st));
    Mobile.apply();
    await wait(300);

    var todayKey = Store.dayKey(), tomorrowKey = Store.dayKey(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1));

    /* ---------- nothing for tomorrow: no section ---------- */
    ok('with nothing for tomorrow there is no Tomorrow section', !box());

    /* ---------- the menu ---------- */
    rightClick(note('Nplain'));
    var tm = menuItem(/^Tomorrow$/);
    ok('right-clicking a note offers Tomorrow', !!tm);
    if (tm) tm.click();
    eq('choosing it puts the note off to tomorrow\'s date', item('Nplain').tomorrow, tomorrowKey);
    var bubble = note('Nplain').querySelector('.tag-tomorrow');
    ok('...and the note gets a Tomorrow bubble', !!bubble && /Tomorrow/.test(bubble.textContent));
    ok('...and it stays in its list', !!item('Nplain'));

    rightClick(note('Nplain'));
    ok('the menu then offers to take it back', !!menuItem(/^Not tomorrow after all$/));
    document.getElementById('ctx').classList.remove('show');

    note('Nplain').querySelector('.tag-tomorrow button').click();
    ok('the bubble\'s × takes it back', !item('Nplain').tomorrow && !note('Nplain').querySelector('.tag-tomorrow'));

    /* putting off a note that was on Do Today takes it off today */
    Store.setTomorrow('Lwork', 'Ntoday', true);
    ok('a note moved to tomorrow comes off Do Today', !inToday('Ntoday') && Store.isTomorrow(item('Ntoday')));
    ok('...keeping its time for tomorrow', item('Ntoday').hour === 10);
    Store.setTomorrow('Lwork', 'Ntoday', false);
    Store.addToToday('Lwork', 'Ntoday');

    /* from Do Today's own menu */
    rightClick(document.querySelector('#today-body .today-item[data-item-id="Ntoday"]'));
    var mv = menuItem(/^Move to tomorrow$/);
    ok('a row in Do Today can be moved to tomorrow', !!mv);
    if (mv) mv.click();
    ok('...which takes it off today and puts it off to tomorrow', !inToday('Ntoday') && Store.isTomorrow(item('Ntoday')));
    rightClick(note('Ntoday'));
    var send = menuItem(/^Send to Do Today$/);
    if (send) send.click();
    ok('sending it to Do Today again takes the Tomorrow bubble off', inToday('Ntoday') && !item('Ntoday').tomorrow);

    /* a time given to a note for tomorrow keeps it for tomorrow */
    Store.setTomorrow('Lwork', 'Nfive', true);
    rightClick(note('Nfive'));
    var five = [].slice.call(document.querySelectorAll('#ctx .ctx-time')).filter(function (b) { return b.textContent === UI.hourLabel(17); })[0];
    ok('(the note menu has the 5 PM button)', !!five);
    if (five) five.click();
    ok('giving a note for tomorrow a time does not put it on Do Today', item('Nfive').hour === 17 && !inToday('Nfive') && Store.isTomorrow(item('Nfive')));

    Store.setTomorrow('Lwork', 'Nnine', true);
    Store.mutate(function () { item('Nnine').hour = 9; }, ['board', 'today']);
    Store.setTomorrow('Lwork', 'Nplain', true);
    Store.setTomorrow('Lwork', 'Nplain2', true);

    /* ---------- the dock, as a list ---------- */
    ok('Do Today now ends in a Tomorrow section', !!box() && box() === document.querySelector('#today-body').lastElementChild);
    ok('...saying how many', !!box() && box().querySelector('.tm-count').textContent === '4');
    eq('...folded to begin with', rowsIn(box()), []);
    ok('...and not counted as today\'s', /\/ 1 done/.test(document.getElementById('today-count').textContent),
       document.getElementById('today-count').textContent);
    box().querySelector('.tomorrow-head').click();
    eq('opening it lists them, timed first by the hour', rowsIn(box()), ['Gym at nine', 'Call at five', 'No time given', 'Also no time']);
    var fiveRow = box().querySelector('.tm-item[data-item-id="Nfive"] .ti-time');
    ok('...with their times', !!fiveRow && fiveRow.textContent === UI.hourLabel(17));

    /* ---------- the dock, as a timeline ---------- */
    timeline(true);
    await wait();
    ok('on the timeline it is still open', !!box() && box().classList.contains('open'));
    var lines = box() ? [].map.call(box().querySelectorAll('.tm-hour'), function (r) {
      return r.querySelector('.hour-label').textContent + ': ' + rowsIn(r).join(' + ');
    }) : [];
    eq('...one line for each of tomorrow\'s hours that has something, then Unset',
       lines, [UI.hourLabel(9) + ': Gym at nine', UI.hourLabel(17) + ': Call at five', 'Unset: No time given + Also no time']);
    eq('today\'s hours are all still there, above it', document.querySelectorAll('#today-body > .hour-row').length, UI.HOURS.length);
    var todayRows = document.querySelectorAll('#today-body > .hour-row');
    ok('...and tomorrow\'s come after them', !!box() && todayRows.length > 0 &&
       !!(box().compareDocumentPosition(todayRows[todayRows.length - 1]) & Node.DOCUMENT_POSITION_PRECEDING));

    Store.mutate(function () { item('Nfive').hour = null; item('Nnine').hour = null; }, ['board', 'today']);
    lines = box() ? [].map.call(box().querySelectorAll('.tm-hour .hour-label'), function (l) { return l.textContent; }) : [];
    eq('with no times at all for tomorrow, there is just Unset', lines, ['Unset']);
    Store.mutate(function () { item('Nfive').hour = 17; item('Nnine').hour = 9; }, ['board', 'today']);

    box().querySelector('.tomorrow-head').click();
    ok('folding it on the timeline...', !box().classList.contains('open') && rowsIn(box()).length === 0);
    timeline(false);
    await wait();
    ok('...folds it on the list too', !!box() && !box().classList.contains('open') && rowsIn(box()).length === 0);
    box().querySelector('.tomorrow-head').click();
    timeline(true);
    await wait();
    ok('and opening it on the list opens it on the timeline', !!box() && box().classList.contains('open'));
    var remembered = null;
    try { remembered = localStorage.getItem('flowlist.tomorrowOpen.v1'); } catch (e) {}
    eq('this device remembers it', remembered, '1');

    var dockBody = document.getElementById('today-body');
    dockBody.style.maxHeight = '300px';                    // short enough to scroll
    dockBody.scrollTop = dockBody.scrollHeight;
    var down = dockBody.scrollTop;
    box().querySelector('.tomorrow-head').click();         // fold
    ok('(the dock is scrolled down to Tomorrow)', down > 100, down);
    ok('folding Tomorrow at the bottom does not throw the dock back to the top', dockBody.scrollTop > 100, dockBody.scrollTop);
    box().querySelector('.tomorrow-head').click();         // open again
    dockBody.style.maxHeight = '';
    timeline(false);

    /* ---------- a row for tomorrow ---------- */
    var copies = function () { var c = Store.listById('completed'); return c ? c.items.filter(function (i) { return i.copyOf === 'Nplain2'; }) : []; };
    box().querySelector('.tm-item[data-item-id="Nplain2"] .note-check').click();
    ok('ticking a row for tomorrow ticks the note', item('Nplain2').done === true);
    ok('...copying it to Completed without the Do Today mark', copies().length === 1 && copies()[0].wasToday === false);
    Store.setDone('Lwork', 'Nplain2', false);
    rightClick(box().querySelector('.tm-item[data-item-id="Nplain2"]'));
    var instead = menuItem(/^Do it today instead$/);
    ok('a row for tomorrow can be done today instead', !!instead);
    if (instead) instead.click();
    ok('...which puts it on Do Today and out of Tomorrow', inToday('Nplain2') && !item('Nplain2').tomorrow &&
       rowsIn(box()).indexOf('Also no time') === -1);
    Store.setTomorrow('Lwork', 'Nplain2', true);
    box().querySelector('.tm-item[data-item-id="Nplain2"] .ti-x').click();
    ok('its × takes it out of Tomorrow', !item('Nplain2').tomorrow && !inToday('Nplain2'));
    Store.setTomorrow('Lwork', 'Nplain2', true);

    /* ---------- dragging to the end of today stops above Tomorrow ---------- */
    var src = note('Nother'), r = src.getBoundingClientRect();
    src.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0, clientX: r.left + 30, clientY: r.top + 10 }));
    var tb = box().getBoundingClientRect();
    /* past the last of today's notes, in the space just above Tomorrow */
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', button: 0, clientX: tb.left + 40, clientY: tb.top - 30 }));
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', button: 0, clientX: tb.left + 40, clientY: tb.top - 5 }));
    var ph = document.querySelector('#today-body > .dnd-ph');
    ok('a note dragged to the end of Do Today shows its gap above Tomorrow, not under it',
       !!ph && ph.nextElementSibling === box(), ph ? 'next=' + (ph.nextElementSibling && ph.nextElementSibling.className) : 'no gap in the dock');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', button: 0, clientX: 5, clientY: 5 }));
    await wait();

    /* ---------- dragging onto the timeline ---------- */
    function dragTo(fromEl, target, dy) {
      var a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
      var x = b.left + Math.min(80, b.width / 2), y = b.top + (dy || b.height / 2);
      fromEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0, clientX: a.left + 30, clientY: a.top + 10 }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', button: 0, clientX: x, clientY: y - 12 }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', button: 0, clientX: x, clientY: y }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', button: 0, clientX: x, clientY: y }));
    }
    Store.mutate(function () { Store.listById('Lwork').items.push(mk('Ndrag', 'Dragged in')); Store.listById('Lwork').items.push(mk('Nstay', 'Dropped on tomorrow')); }, ['board']);
    Store.setTomorrow('Lwork', 'Ndrag', true);
    timeline(true);
    await wait();
    var eleven = [].filter.call(document.querySelectorAll('#today-body > .hour-row'), function (r) { return r.querySelector('.hour-label').textContent === UI.hourLabel(11); })[0];
    dragTo(note('Ndrag'), eleven);
    await wait();
    ok('a note for tomorrow dragged onto today\'s 11 AM is on Do Today at 11, and not for tomorrow any more',
       inToday('Ndrag') && item('Ndrag').hour === 11 && !item('Ndrag').tomorrow,
       'today=' + inToday('Ndrag') + ' hour=' + item('Ndrag').hour + ' tomorrow=' + item('Ndrag').tomorrow);
    var tmFive = box() && [].filter.call(box().querySelectorAll('.tm-hour'), function (r) { return r.querySelector('.hour-label').textContent === UI.hourLabel(17); })[0];
    if (tmFive) tmFive.scrollIntoView({ block: 'center' });
    await wait();
    var fr = tmFive && tmFive.getBoundingClientRect();
    ok('(tomorrow\'s 5 PM line is on screen)', !!fr && fr.top >= 0 && fr.bottom <= window.innerHeight, fr && fr.top);
    if (tmFive) dragTo(note('Nstay'), tmFive);
    await wait();
    ok('a note let go on one of tomorrow\'s lines is put off to tomorrow', Store.isTomorrow(item('Nstay')));
    ok('...not made one of today\'s', !inToday('Nstay') && !item('Nstay').hour);
    Store.setTomorrow('Lwork', 'Nstay', false);
    Store.removeFromToday('Lwork', 'Ndrag');
    timeline(false);
    await wait();

    /* a row dragged out of today onto Tomorrow */
    Store.addToToday('Lwork', 'Nstay');
    await wait();
    var todayRow = document.querySelector('#today-body > .today-item[data-item-id="Nstay"]');
    if (box()) box().scrollIntoView({ block: 'center' });
    todayRow = document.querySelector('#today-body > .today-item[data-item-id="Nstay"]');
    if (todayRow && box()) dragTo(todayRow, box().querySelector('.tomorrow-head'));
    await wait();
    ok('a row dragged from today onto Tomorrow moves to tomorrow', !inToday('Nstay') && Store.isTomorrow(item('Nstay')));
    Store.setTomorrow('Lwork', 'Nstay', false);
    await wait();

    /* ---------- the day turns ---------- */
    var todayBefore = Store.get().today.length;
    Today.tick();
    ok('before midnight nothing moves', Store.get().today.length === todayBefore && Store.isTomorrow(item('Nfive')));

    shift = DAY;
    Today.tick();
    await wait();
    ok('when the day comes, tomorrow\'s notes are on Do Today', ['Nfive', 'Nnine', 'Nplain', 'Nplain2'].every(inToday));
    ok('...their Tomorrow marks gone', ['Nfive', 'Nnine', 'Nplain', 'Nplain2'].every(function (id) { return !item(id).tomorrow; }));
    ok('...their bubbles now saying Today', !note('Nfive').querySelector('.tag-tomorrow') && !!note('Nfive').querySelector('.tag-today'));
    ok('...keeping their times', item('Nfive').hour === 17 && item('Nnine').hour === 9);
    var order = Store.get().today.map(function (t) { return t.itemId; });
    ok('...added after what was already there, timed ones first', order.indexOf('Ntoday') < order.indexOf('Nnine') &&
       order.indexOf('Nnine') < order.indexOf('Nfive') && order.indexOf('Nfive') < order.indexOf('Nplain'), order.join(','));
    ok('...and the Tomorrow section is gone', !box());
    ok('...and nothing else was touched', !inToday('Nother') && !item('Nother').tomorrow);
    var n = Store.get().today.length;
    Today.tick();
    eq('checking again adds nothing twice', Store.get().today.length, n);

    /* a device that was off for days */
    Store.mutate(function () { item('Nother').tomorrow = Store.dayKey(Date.now() - 3 * DAY); }, null, { silent: true });
    Today.tick();
    ok('a note whose day came while the app was shut is on Do Today when it opens', inToday('Nother') && !item('Nother').tomorrow);

    /* ---------- two devices both turning the day over ---------- */
    var base = JSON.parse(Store.exportState());
    base.lists[0].items.push(mk('Nboth', 'Put off on both'));
    base.lists[0].items[base.lists[0].items.length - 1].tomorrow = Store.dayKey(Date.now() - DAY);
    var turned = function () {
      var s = JSON.parse(JSON.stringify(base));
      var it = s.lists[0].items[s.lists[0].items.length - 1];
      delete it.tomorrow;
      s.today.push({ listId: 'Lwork', itemId: 'Nboth' });
      return s;
    };
    var merged = Merge.three(base, turned(), turned()).state;
    eq('two devices that both moved it to today end up with it there once',
       merged.today.filter(function (t) { return t.itemId === 'Nboth'; }).length, 1);
    ok('...and no Tomorrow mark left behind', !merged.lists[0].items.filter(function (i) { return i.id === 'Nboth'; })[0].tomorrow);

    /* ---------- the Categories panel's own menu ---------- */
    Date.now = realNow; shift = 0;
    Store.mutate(function (s) { s.settings.panels.board.lists = true; }, ['panels']);
    var twist = document.querySelector('#list-index .cat[data-list-id="Lwork"] .cat-twist');
    if (twist) twist.click();
    var catNote = document.querySelector('#list-index .cat-note');
    ok('(a note shows in the Categories panel)', !!catNote);
    if (catNote) {
      rightClick(catNote);
      ok('its menu in the Categories panel offers Tomorrow too', !!menuItem(/^Tomorrow$|^Not tomorrow after all$/));
      document.getElementById('ctx').classList.remove('show');
    }
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    Date.now = realNow;
    document.title = 'TOMORROW ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'tomorrowresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
