var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

/* a small board, easy to read in a failure message */
function list(id, name, items) {
  return { id: id, name: name, color: '#5cc8ff', collapsed: false,
           items: (items || []).map(function (i) {
             return { id: i[0], text: i[1], detail: '', expanded: false, done: !!i[2], hour: null };
           }) };
}
function board(lists, extra) {
  return Object.assign({
    v: 2, view: 'board',
    settings: { theme: 'winter', maxOpen: 5, sync: { room: 'mine' }, panels: { board: {} } },
    lists: lists, board: lists.map(function (l) { return l.id; }),
    closedOrder: [], presets: [], today: [],
    canvases: [{ id: 'c1', name: 'Scratch', color: '#fff', nodes: [], edges: [], strokes: [], pan: { x: 0, y: 0 }, zoom: 1 }],
    activeCanvas: 'c1', widgets: []
  }, extra || {});
}
var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
var names = function (s) { return s.lists.map(function (l) { return l.name; }).join(','); };
var notes = function (s, id) {
  var l = s.lists.filter(function (x) { return x.id === id; })[0];
  return l ? l.items.map(function (i) { return i.text; }).join(',') : '(gone)';
};

setTimeout(function () {
  try {
    /* ============================================================
       the case that started it
       ============================================================ */
    var base = board([list('a', 'Work', [['n1', 'One']]), list('b', 'Home')]);
    var mine = clone(base);
    mine.lists.push(list('p', 'Written on the phone'));
    mine.board.push('p');
    var theirs = clone(base);
    theirs.lists.push(list('c', 'Written on the computer'));
    theirs.board.push('c');

    var r = Merge.three(base, mine, theirs);
    eq('both new categories survive', names(r.state), 'Work,Home,Written on the phone,Written on the computer');
    eq('...one counted as coming in', r.report.came.length, 1);
    eq('...one counted as kept from here', r.report.kept.length, 1);
    eq('...and nothing was contested', r.report.conflicts.length, 0);
    ok('...both are open on the board',
       r.state.board.indexOf('p') !== -1 && r.state.board.indexOf('c') !== -1, r.state.board.join(','));

    /* ============================================================
       deletions stick — the thing two-way sync gets wrong
       ============================================================ */
    mine = clone(base);
    mine.lists = mine.lists.filter(function (l) { return l.id !== 'b'; });
    mine.board = mine.board.filter(function (i) { return i !== 'b'; });
    theirs = clone(base);                       // they did not touch it
    r = Merge.three(base, mine, theirs);
    eq('a category I deleted stays deleted', names(r.state), 'Work');
    eq('...and is reported as removed by me', r.report.removed[0].by, 'you');

    mine = clone(base);
    theirs = clone(base);
    theirs.lists = theirs.lists.filter(function (l) { return l.id !== 'b'; });
    r = Merge.three(base, mine, theirs);
    eq('a category they deleted goes here too', names(r.state), 'Work');
    eq('...reported as removed by them', r.report.removed[0].by, 'them');

    /* both deleted the same thing */
    mine = clone(base); theirs = clone(base);
    mine.lists = mine.lists.filter(function (l) { return l.id !== 'b'; });
    theirs.lists = theirs.lists.filter(function (l) { return l.id !== 'b'; });
    r = Merge.three(base, mine, theirs);
    eq('both deleting the same thing is not a conflict', names(r.state), 'Work');
    eq('...and it is not reported twice', r.report.removed.length, 0);

    /* ============================================================
       notes inside a category, which is where the real work is
       ============================================================ */
    base = board([list('a', 'Work', [['n1', 'One'], ['n2', 'Two']])]);
    mine = clone(base);
    mine.lists[0].items.push({ id: 'n3', text: 'Added here', detail: '', expanded: false, done: false, hour: null });
    theirs = clone(base);
    theirs.lists[0].items.push({ id: 'n4', text: 'Added there', detail: '', expanded: false, done: false, hour: null });
    r = Merge.three(base, mine, theirs);
    eq('notes added on both sides both survive', notes(r.state, 'a'), 'One,Two,Added here,Added there');

    /* a note deleted here, another edited there */
    mine = clone(base);
    mine.lists[0].items = mine.lists[0].items.filter(function (i) { return i.id !== 'n1'; });
    theirs = clone(base);
    theirs.lists[0].items[1].text = 'Two, reworded';
    r = Merge.three(base, mine, theirs);
    eq('a delete here and an edit there both stand', notes(r.state, 'a'), 'Two, reworded');

    /* ticking a note off on one side */
    mine = clone(base);
    theirs = clone(base);
    theirs.lists[0].items[0].done = true;
    r = Merge.three(base, mine, theirs);
    ok('ticking a note off travels', r.state.lists[0].items[0].done === true);
    eq('...quietly', r.report.conflicts.length, 0);

    /* ============================================================
       the one real conflict
       ============================================================ */
    mine = clone(base);
    theirs = clone(base);
    mine.lists[0].items[0].text = 'Mine says this';
    theirs.lists[0].items[0].text = 'Theirs says that';
    r = Merge.three(base, mine, theirs);
    eq('the same note reworded on both sides keeps this device', notes(r.state, 'a'), 'Mine says this,Two');
    eq('...and says so', r.report.conflicts.length, 1);
    eq('...naming the note', r.report.conflicts[0].kind, 'note');
    eq('...and the field', r.report.conflicts[0].field, 'text');
    eq('...with what was dropped', r.report.conflicts[0].dropped, 'Theirs says that');

    /* two different fields of one note is not a conflict */
    mine = clone(base); theirs = clone(base);
    mine.lists[0].items[0].text = 'New words';
    theirs.lists[0].items[0].hour = 22;
    r = Merge.three(base, mine, theirs);
    eq('different fields of one note both apply', r.state.lists[0].items[0].text, 'New words');
    eq('...both of them', r.state.lists[0].items[0].hour, 22);
    eq('...with nothing contested', r.report.conflicts.length, 0);

    /* renaming a category on one side only */
    mine = clone(base); theirs = clone(base);
    theirs.lists[0].name = 'Renamed over there';
    r = Merge.three(base, mine, theirs);
    eq('a rename on one side travels', names(r.state), 'Renamed over there');

    /* ============================================================
       Do Today
       ============================================================ */
    base = board([list('a', 'Work', [['n1', 'One'], ['n2', 'Two']])]);
    base.today = [{ listId: 'a', itemId: 'n1' }];
    mine = clone(base);
    mine.today.push({ listId: 'a', itemId: 'n2' });
    theirs = clone(base);
    theirs.today = [];                                   // they cleared it
    r = Merge.three(base, mine, theirs);
    eq('what they took off Do Today comes off', r.state.today.length, 1);
    eq('...and what I added to it stays', r.state.today[0].itemId, 'n2');

    /* ============================================================
       the canvas
       ============================================================ */
    base = board([list('a', 'Work')]);
    base.canvases[0].strokes = [{ id: 's1', color: '#fff', width: 4, pts: [0, 0, 1, 1] }];
    mine = clone(base);
    mine.canvases[0].strokes.push({ id: 's2', color: '#000', width: 4, pts: [2, 2, 3, 3] });
    theirs = clone(base);
    theirs.canvases[0].strokes.push({ id: 's3', color: '#f00', width: 4, pts: [4, 4, 5, 5] });
    r = Merge.three(base, mine, theirs);
    eq('drawings from both sides survive', r.state.canvases[0].strokes.length, 3);

    theirs = clone(base);
    theirs.canvases[0].strokes = [];                     // they rubbed it out
    mine = clone(base);
    r = Merge.three(base, mine, theirs);
    eq('a drawing they rubbed out goes here too', r.state.canvases[0].strokes.length, 0);

    /* a whole new canvas on each side */
    mine = clone(base); theirs = clone(base);
    mine.canvases.push({ id: 'c2', name: 'Mine', color: '#fff', nodes: [], edges: [], strokes: [], pan: { x: 0, y: 0 }, zoom: 1 });
    theirs.canvases.push({ id: 'c3', name: 'Theirs', color: '#fff', nodes: [], edges: [], strokes: [], pan: { x: 0, y: 0 }, zoom: 1 });
    r = Merge.three(base, mine, theirs);
    eq('a new canvas from each side', r.state.canvases.length, 3);

    /* ============================================================
       settings: shared taste travels, device things do not
       ============================================================ */
    base = board([list('a', 'Work')]);
    mine = clone(base); theirs = clone(base);
    theirs.settings.theme = 'slate';
    mine.settings.sync = { room: 'mine', device: 'Phone' };
    theirs.settings.sync = { room: 'theirs', device: 'Computer' };
    mine.settings.layout = 'phone';
    theirs.settings.layout = 'desktop';
    r = Merge.three(base, mine, theirs);
    eq('a theme picked on the other device comes across', r.state.settings.theme, 'slate');
    eq('...but its sync keys never do', r.state.settings.sync.room, 'mine');
    eq('...nor its layout', r.state.settings.layout, 'phone');
    eq('...and none of that counts as a conflict', r.report.conflicts.length, 0);

    /* ============================================================
       nothing may point at something that is gone
       ============================================================ */
    base = board([list('a', 'Work', [['n1', 'One']]), list('b', 'Home')]);
    base.today = [{ listId: 'b', itemId: 'x' }];
    base.lists[1].items = [{ id: 'x', text: 'Doomed', detail: '', expanded: false, done: false, hour: null }];
    mine = clone(base);
    theirs = clone(base);
    theirs.lists = theirs.lists.filter(function (l) { return l.id !== 'b'; });
    r = Merge.three(base, mine, theirs);
    eq('a deleted category leaves the board', r.state.board.indexOf('b'), -1);
    eq('...and takes its Do Today entries with it', r.state.today.length, 0);

    /* ============================================================
       the quiet cases
       ============================================================ */
    base = board([list('a', 'Work')]);
    r = Merge.three(base, clone(base), clone(base));
    eq('two identical boards merge to nothing changed', r.report.changed, 0);
    eq('...and come out the same', names(r.state), 'Work');

    r = Merge.three(null, board([list('a', 'Work')]), null);
    eq('with nothing on the other side, mine stands', names(r.state), 'Work');
    r = Merge.three(null, null, board([list('b', 'Theirs')]));
    eq('with nothing here, theirs stands', names(r.state), 'Theirs');

    /* no base at all: never seen each other before */
    mine = board([list('a', 'Mine')]);
    theirs = board([list('b', 'Theirs')]);
    r = Merge.three(null, mine, theirs);
    eq('with no shared past, both sides are kept', names(r.state), 'Mine,Theirs');

    /* ============================================================
       the sentence for the banner
       ============================================================ */
    ok('the summary reads as a sentence',
       Merge.sentence({ came: [1], kept: [1], removed: [], conflicts: [] }, 'Computer')
         .indexOf('1 in from Computer') === 0,
       Merge.sentence({ came: [1], kept: [1], removed: [], conflicts: [] }, 'Computer'));
    eq('...and says so when there was nothing to do',
       Merge.sentence({ came: [], kept: [], removed: [], conflicts: [] }, 'X'),
       'nothing to bring together');
  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }
  document.title = 'MERGE ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre'); pre.id = 'mergeresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2400);
