/*
 * Bringing back what was deleted.
 *
 * Deleting is the one change that cannot be undone by doing it again. The
 * button beside the others - and Ctrl+Z - puts back the last thing deleted,
 * whether that was a note, a whole category, a card on the canvas, or all
 * the finished notes in a list at once. It goes back where it was, on Do
 * Today if it was there, on the board where it sat.
 *
 * The undo list is this device's own: it is not part of the board and never
 * goes to the other device.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 60); }); };

var undoBtn = function () { return document.getElementById('btn-undo'); };
var texts = function (id) { var l = Store.listById(id); return l ? l.items.map(function (i) { return i.text; }) : null; };
var names = function () { return Store.get().lists.map(function (l) { return l.name; }); };
function menuItem(re) {
  return [].slice.call(document.querySelectorAll('#ctx .ctx-item')).filter(function (b) { return re.test(b.textContent.trim()); })[0];
}
function board(extra) {
  var st = JSON.parse(Store.exportState());
  var mk = function (id, text, done) { return { id: id, text: text, detail: '', expanded: false, done: !!done, hour: null }; };
  st.lists = [
    { id: 'Lwork', name: 'Work', color: '#5cc8ff', collapsed: false,
      items: [mk('N1', 'First'), mk('N2', 'Second'), mk('N3', 'Third'), mk('N4', 'Finished one', true), mk('N5', 'Finished two', true)] },
    { id: 'Lhome', name: 'Home', color: '#6ee7a0', collapsed: false, items: [mk('H1', 'At home')] }
  ];
  st.board = ['Lwork', 'Lhome']; st.closedOrder = [];
  st.today = [{ listId: 'Lwork', itemId: 'N2' }, { listId: 'Lhome', itemId: 'H1' }];
  st.presets = [{ id: 'P1', name: 'Morning', color: '#7c8dff', listIds: ['Lhome'], open: true }];
  st.canvases = [{ id: 'C1', name: 'Scratch', color: '#b78bff', pan: { x: 0, y: 0 }, zoom: 1, strokes: [],
    nodes: [{ id: 'K1', kind: 'note', text: 'A card', x: 40, y: 40, w: 200, h: 100 },
            { id: 'K2', kind: 'ref', listId: 'Lhome', itemId: 'H1', x: 300, y: 40, w: 200, h: 100 }],
    edges: [{ id: 'E1', from: { node: 'K1' }, to: { node: 'K2' }, color: '#8fb7ff', width: 2, arrow: true }] }];
  st.activeCanvas = 'C1';
  st.settings.layout = 'desktop';
  return st;
}

setTimeout(function () {
  (async function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting'); document.body.classList.add('loaded');
    Store.undoClear();
    Store.importJSON(JSON.stringify(board()));
    Mobile.apply();
    await wait(300);
    App.paintUndo();

    /* ---------- the button ---------- */
    ok('there is an undo button in the top bar', !!undoBtn());
    ok('...beside the others', !!undoBtn().closest('.topbar-actions'));
    ok('...and nothing to bring back yet', undoBtn().disabled, undoBtn().title);
    ok('...which it says', /Nothing to bring back/.test(undoBtn().title), undoBtn().title);

    /* ---------- a note ---------- */
    Store.deleteNote('Lwork', 'N2');
    await wait(80);
    eq('a deleted note goes', texts('Lwork'), ['First', 'Third', 'Finished one', 'Finished two']);
    ok('...and it comes off Do Today with it', !Store.inToday('Lwork', 'N2'));
    ok('the button offers it back, by name', !undoBtn().disabled && /Bring back Second/.test(undoBtn().title), undoBtn().title);
    undoBtn().click();
    await wait(80);
    eq('undo puts it back where it was', texts('Lwork'), ['First', 'Second', 'Third', 'Finished one', 'Finished two']);
    ok('...and back on Do Today', Store.inToday('Lwork', 'N2'));
    ok('...and there is nothing left to undo', undoBtn().disabled, undoBtn().title);

    /* a note with no name still says something sensible */
    Store.addNote('Lwork', 0, '');
    var blank = Store.listById('Lwork').items[0];
    Store.deleteNote('Lwork', blank.id);
    ok('a note with no name is offered back too', /Bring back the note with no name/.test(undoBtn().title), undoBtn().title);
    undoBtn().click();
    await wait(80);
    ok('...and comes back', !!Store.itemById('Lwork', blank.id));
    Store.deleteNote('Lwork', blank.id);
    Store.undoClear();
    App.paintUndo();

    /* ---------- a whole category ---------- */
    Store.deleteList('Lhome');
    await wait(80);
    eq('deleting a category takes it off the board', names().indexOf('Home'), -1);
    ok('...and its card on the canvas with it', !Store.canvasById('C1').nodes.some(function (n) { return n.id === 'K2'; }));
    ok('the button offers the category back', /Bring back Home/.test(undoBtn().title), undoBtn().title);
    undoBtn().click();
    await wait(120);
    ok('undo brings the category back', !!Store.listById('Lhome'));
    eq('...with its notes', texts('Lhome'), ['At home']);
    ok('...onto the board where it was', Store.get().board.indexOf('Lhome') === 1, JSON.stringify(Store.get().board));
    ok('...back on Do Today', Store.inToday('Lhome', 'H1'));
    ok('...back in its preset', Store.get().presets[0].listIds.indexOf('Lhome') !== -1);
    ok('...and its card on the canvas is back', Store.canvasById('C1').nodes.some(function (n) { return n.id === 'K2'; }));
    ok('...with the line that joined it', Store.canvasById('C1').edges.some(function (e) { return e.id === 'E1'; }));

    /* ---------- all the finished notes at once ---------- */
    Store.undoClear();
    var cleared = Store.clearFinished('Lwork');
    await wait(80);
    eq('clearing the finished notes takes them all', cleared, 2);
    eq('...leaving the rest', texts('Lwork'), ['First', 'Second', 'Third']);
    ok('the button offers all of them back at once', /Bring back 2 finished notes/.test(undoBtn().title), undoBtn().title);
    undoBtn().click();
    await wait(80);
    eq('one undo brings them all back, where they were', texts('Lwork'), ['First', 'Second', 'Third', 'Finished one', 'Finished two']);

    /* ---------- a card on the canvas ---------- */
    Store.undoClear();
    Store.removeNode('K1');
    await wait(80);
    ok('deleting a card takes it', !Store.canvasById('C1').nodes.some(function (n) { return n.id === 'K1'; }));
    ok('...and the line it held', !Store.canvasById('C1').edges.some(function (e) { return e.id === 'E1'; }));
    ok('the button offers the card back', /Bring back A card/.test(undoBtn().title), undoBtn().title);
    undoBtn().click();
    await wait(80);
    ok('undo brings the card back', Store.canvasById('C1').nodes.some(function (n) { return n.id === 'K1'; }));
    ok('...and its line', Store.canvasById('C1').edges.some(function (e) { return e.id === 'E1'; }));

    /* ---------- one at a time, newest first ---------- */
    Store.undoClear();
    Store.deleteNote('Lwork', 'N1');
    Store.deleteNote('Lwork', 'N3');
    await wait(80);
    ok('(two deleted)', texts('Lwork').indexOf('First') === -1 && texts('Lwork').indexOf('Third') === -1);
    ok('the newest deletion is the one offered', /Bring back Third/.test(undoBtn().title), undoBtn().title);
    undoBtn().click();
    await wait(80);
    ok('...and it comes back first', texts('Lwork').indexOf('Third') !== -1 && texts('Lwork').indexOf('First') === -1);
    ok('...then the one before it is offered', /Bring back First/.test(undoBtn().title), undoBtn().title);
    undoBtn().click();
    await wait(80);
    eq('...and both are back where they were', texts('Lwork'), ['First', 'Second', 'Third', 'Finished one', 'Finished two']);
    ok('...with nothing left to undo', undoBtn().disabled);

    /* ---------- Ctrl+Z ---------- */
    Store.deleteNote('Lwork', 'N2');
    await wait(80);
    document.body.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    await wait(80);
    ok('Ctrl+Z brings it back too', texts('Lwork').indexOf('Second') !== -1);

    /* ...but not while typing, where the browser's own undo is the one meant */
    Store.deleteNote('Lwork', 'N3');
    await wait(80);
    var ta = document.querySelector('#board [data-list-id="Lwork"] .note-text');
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    await wait(80);
    ok('Ctrl+Z in a note being typed into is left to the browser', texts('Lwork').indexOf('Third') === -1);
    ta.blur();
    undoBtn().click();
    await wait(80);
    ok('(and the button still brings it back)', texts('Lwork').indexOf('Third') !== -1);

    /* ---------- it is this device's own ---------- */
    Store.deleteNote('Lwork', 'N1');
    await wait(80);
    var sent = Store.exportState();
    ok('what goes to the other device has no undo list in it', sent.indexOf('flowlist.undo') === -1 && sent.indexOf('"trash"') === -1);
    var backup = Store.exportJSON();
    ok('...nor does a backup file', backup.indexOf('flowlist.undo') === -1 && backup.indexOf('"trash"') === -1);
    ok('...and it is kept beside the board, on this device',
       (localStorage.getItem('flowlist.undo.v1') || '').indexOf('First') !== -1,
       (localStorage.getItem('flowlist.undo.v1') || '').slice(0, 60));
    undoBtn().click();
    await wait(80);

    /* ---------- deleting the same thing twice over ---------- */
    Store.undoClear();
    Store.deleteNote('Lwork', 'N2');
    Store.deleteList('Lwork');
    await wait(80);
    ok('(the whole list went after the note)', !Store.listById('Lwork'));
    undoBtn().click();
    await wait(120);
    ok('undo brings the list back first', !!Store.listById('Lwork'));
    ok('...and the note deleted before it is offered next', /Bring back Second/.test(undoBtn().title), undoBtn().title);
    undoBtn().click();
    await wait(80);
    ok('...and comes back into it', texts('Lwork').indexOf('Second') !== -1, JSON.stringify(texts('Lwork')));
  })().catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'UNDO ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'undoresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
