/*
 * More than one board on one machine.
 *
 * The thing that matters most here is that the board which was already on
 * this device never moves: the first profile keeps the original storage
 * names, so adding profiles is not a migration and cannot lose anything.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 40); }); };
var flkeys = function (pre) {
  return Object.keys(localStorage).filter(function (k) { return k.indexOf(pre || 'flowlist') === 0; }).sort();
};

setTimeout(async function () {
  try {
    /* ============================================================
       THE BOARD THAT WAS ALREADY HERE DOES NOT MOVE
       ============================================================ */
    eq('there is one profile to begin with', Profiles.list().length, 1);
    eq('...and it is the one in use', Profiles.active(), Profiles.MAIN);
    eq('...keeping the name the board has always been saved under',
       Profiles.key('state.v1'), 'flowlist.state.v1');
    eq('...and so is everything else it owns', Profiles.key('syncpass.v1'), 'flowlist.syncpass.v1');
    ok('...which is what the store actually writes to',
       localStorage.getItem('flowlist.state.v1') !== null);

    /* ============================================================
       A SECOND ONE IS KEPT APART
       ============================================================ */
    var mainNotes = Store.get().lists.reduce(function (n, l) { return n + (l.items || []).length; }, 0);
    var mainRawBefore = localStorage.getItem('flowlist.state.v1');

    var two = Profiles.add('Second');
    ok('a second profile can be added', !!two && Profiles.list().length === 2);
    eq('...with the name it was given', Profiles.nameOf(two), 'Second');
    ok('...and its storage is under a name of its own',
       Profiles.keyFor(two, 'state.v1') === 'flowlist.p.' + two + '.state.v1',
       Profiles.keyFor(two, 'state.v1'));
    ok('...while the first keeps the plain names', Profiles.keyFor(Profiles.MAIN, 'state.v1') === 'flowlist.state.v1');

    await Profiles.switchTo(two, { quiet: true });
    eq('switching changes which profile is in use', Profiles.active(), two);
    eq('...and where the board is read and written',
       Profiles.key('state.v1'), 'flowlist.p.' + two + '.state.v1');

    /* write something that only the second one should ever hold */
    Store.reset();
    var l2 = Store.get().lists.filter(function (x) { return x.id !== Store.COMPLETED_ID; })[0];
    Store.addNote(l2.id, 0, 'ONLY-IN-TWO');
    Store.flush();
    ok('what is written here is here', Store.get().lists.some(function (x) {
      return (x.items || []).some(function (i) { return i.text === 'ONLY-IN-TWO'; });
    }));
    ok('...and nowhere near the first profile',
       localStorage.getItem('flowlist.state.v1').indexOf('ONLY-IN-TWO') === -1);
    eq('...which is untouched, byte for byte',
       localStorage.getItem('flowlist.state.v1'), mainRawBefore);

    /* a passphrase set here belongs to this profile alone */
    Sync.setPassphrase('a passphrase for the second board');
    ok('a passphrase set here is stored under this profile',
       localStorage.getItem('flowlist.p.' + two + '.syncpass.v1') !== null);
    ok('...and not under the first', localStorage.getItem('flowlist.syncpass.v1') === null);

    /* ============================================================
       COMING BACK FINDS EVERYTHING WHERE IT WAS
       ============================================================ */
    await Profiles.switchTo(Profiles.MAIN, { quiet: true });
    eq('switching back', Profiles.active(), Profiles.MAIN);
    eq('...reads the first board again', Profiles.key('state.v1'), 'flowlist.state.v1');
    ok('...with the second one still saved, not merged away',
       localStorage.getItem('flowlist.p.' + two + '.state.v1').indexOf('ONLY-IN-TWO') !== -1);

    /* ============================================================
       FORGETTING ONE
       ============================================================ */
    var bad = await Profiles.forget(Profiles.MAIN);
    ok('the first profile cannot be removed', bad.ok === false, JSON.stringify(bad));

    await Profiles.switchTo(two, { quiet: true });
    var busy = await Profiles.forget(two);
    ok('nor can the one you are looking at', busy.ok === false, JSON.stringify(busy));
    await Profiles.switchTo(Profiles.MAIN, { quiet: true });

    var seen = [];
    var gone = await Profiles.forget(two, function (done, total, what) { seen.push([done, total, what]); });
    ok('a profile you have left can be removed', gone.ok === true, JSON.stringify(gone));
    eq('...reporting its way through everything that profile owns', seen.length, Profiles.OWNED.length);
    eq('...counting up to the total', seen[seen.length - 1][0], seen[seen.length - 1][1]);
    eq('...and it is off the list', Profiles.list().length, 1);
    eq('...with nothing of it left in storage', flkeys('flowlist.p.').length, 0);

    /* The point of all of it. Not compared byte for byte: coming back
       re-reads and re-saves, so migrations may tidy the shape of it. What
       must not change is a single word of what is written down. */
    var mainTexts = JSON.parse(localStorage.getItem('flowlist.state.v1')).lists
      .map(function (l) { return (l.items || []).map(function (i) { return i.text; }).join('|'); }).join('||');
    var wasTexts = JSON.parse(mainRawBefore).lists
      .map(function (l) { return (l.items || []).map(function (i) { return i.text; }).join('|'); }).join('||');
    eq('the first board survived the whole business, word for word', mainTexts, wasTexts);
    eq('...with the notes it started with', Store.get().lists.reduce(function (n, l) {
      return n + (l.items || []).length;
    }, 0), mainNotes);

    /* ============================================================
       A PROFILE KEPT SEALED

       The board on disk is encrypted and the key is on a stick. The one
       that matters most here is the save-while-shut case: before the key
       arrives the board in memory is a placeholder, and writing it would
       destroy the real one. That is not hypothetical - it happened while
       this was being built, because keyfile.js loaded after store.js and
       a sealed board is valid JSON, so the store parsed it as a board and
       wrote a fresh one over the top.
       ============================================================ */
    KeyFile.setRounds(1000);   /* the real count does not fit the runner's clock */
    var sealedId = Profiles.add('Sealed');
    await Profiles.switchTo(sealedId, { quiet: true });
    Store.reset();
    Store.addNote(Store.get().lists.filter(function (x) { return x.id !== Store.COMPLETED_ID; })[0].id,
                  0, 'SEALED-BOARD-NOTE');
    Store.flush();
    ok('(a plain board is plain on disk to begin with)',
       localStorage.getItem(Profiles.key('state.v1')).indexOf('SEALED-BOARD-NOTE') !== -1);

    var kf = KeyFile.makeKeyFile();
    var bundle = await KeyFile.create(kf, 'a properly long backup passphrase here');
    Profiles.setLocks(sealedId, bundle);
    ok('a profile can be given a key of its own', Profiles.isLocked(sealedId));
    Store.sealFrom(await KeyFile.openWithFile(bundle, kf));
    await wait(120);
    Store.flush();

    var onDisk = localStorage.getItem(Profiles.key('state.v1'));
    ok('from then on the board is sealed on disk', KeyFile.isSealed(onDisk));
    ok('...with none of its words in it', onDisk.indexOf('SEALED-BOARD-NOTE') === -1);

    /* as if the app had been closed and opened again */
    Store.shut();
    ok('shut again, it shows nothing',
       Store.isShut() && Store.get().lists.filter(function (x) { return x.id !== Store.COMPLETED_ID; }).length === 0);

    var was = localStorage.getItem(Profiles.key('state.v1'));
    Store.flush();
    Store.mutate(function (s) { s.settings.listWidth = 321; }, null, { silent: true });
    Store.flush();
    ok('a save while it is shut does not write over the sealed board',
       localStorage.getItem(Profiles.key('state.v1')) === was);

    var wrong = await Store.unlockWith(new Uint8Array(32));
    eq('the wrong key does not open it', wrong, false);
    ok('...and it is still shut after being asked', Store.isShut());

    var right = await KeyFile.openWithFile(Profiles.locks(sealedId), kf);
    var opened = await Store.unlockWith(right);
    ok('the key off the stick opens it', opened === true);
    ok('...and the board is back, word for word', Store.get().lists.some(function (x) {
      return (x.items || []).some(function (i) { return i.text === 'SEALED-BOARD-NOTE'; });
    }));

    Store.addNote(Store.get().lists.filter(function (x) { return x.id !== Store.COMPLETED_ID; })[0].id,
                  0, 'WRITTEN-WHILE-OPEN');
    await wait(150);
    Store.flush();
    var after = localStorage.getItem(Profiles.key('state.v1'));
    ok('what is written while it is open is sealed too',
       KeyFile.isSealed(after) && after.indexOf('WRITTEN-WHILE-OPEN') === -1);

    /* ---------- nothing readable, anywhere ----------
       Sealing the board is not enough on its own. Two other things keep
       copies of it and had no reason not to write them down: the trash
       holds whole deleted notes, and sync's "last agreed" holds the lot.
       Both were leaking the very words the board is encrypted to hide -
       deleting a note was a way to leak it. Scanned across every key
       rather than the ones expected, because the point is that there is
       nowhere left. */
    var everywhere = function (needle) {
      return Object.keys(localStorage).filter(function (k) {
        try { return (localStorage.getItem(k) || '').indexOf(needle) !== -1; }
        catch (e) { return false; }
      });
    };
    var hereList = function () {
      return Store.get().lists.filter(function (x) { return x.id !== Store.COMPLETED_ID; })[0];
    };

    var n2 = Store.addNote(hereList().id, 0, 'NOT-A-WORD-OF-THIS');
    await wait(120);
    Store.deleteNote(hereList().id, n2.id);
    Sync.setAgreed(Store.get());
    Store.flush();
    await wait(200);
    eq('deleting a note in a sealed board writes none of it down',
       everywhere('NOT-A-WORD-OF-THIS').join(' '), '');
    ok('...and undo still works while the app is open', !!Store.undoPeek());

    /* and the leftovers from before it was sealed are cleared when it is */
    ok('(the trash is not kept on disk for a sealed board)',
       localStorage.getItem(Profiles.key('undo.v1')) === null,
       localStorage.getItem(Profiles.key('undo.v1')));
    ok('(nor is sync\'s copy of the whole board)',
       localStorage.getItem(Profiles.key('syncbase.v1')) === null);

    /* and the backup passphrase is a way in as well */
    Store.shut();
    var viaWords = await Store.unlockWith(
      await KeyFile.openWithPass(Profiles.locks(sealedId), 'a properly long backup passphrase here'));
    ok('the backup passphrase opens it too', viaWords === true);
    ok('...finding everything that was written', Store.get().lists.some(function (x) {
      return (x.items || []).some(function (i) { return i.text === 'WRITTEN-WHILE-OPEN'; });
    }));

    /* Switching away has to put the store back to plain, or it would go on
       believing the next board is sealed and `flush()` - which refuses to
       write a sealed board it has no key for - would quietly stop saving
       it. A real switch reloads the page and hides this; this one does not. */
    await Profiles.switchTo(Profiles.MAIN, { quiet: true });
    ok('switching away leaves the store expecting a plain board again',
       Store.isSealed() === false && Store.isShut() === false);
    ok('...and the first board still saves', Store.flush() === true);

    await Profiles.forget(sealedId);
    ok('and forgetting it takes its locks with it',
       localStorage.getItem('flowlist.p.' + sealedId + '.locks.v1') === null);

    /* ============================================================
       NOTHING IS QUIETLY LEFT BEHIND

       If a new localStorage key is ever added for something that belongs
       to a board rather than to the machine, it has to be listed in OWNED
       or forgetting a profile would leave it on disk. This catches that.
       ============================================================ */
    var machineKeys = ['flowlist.profiles.v1', 'flowlist.fullscreen', 'flowlist.su', 'flowlist.t'];
    var strays = flkeys().filter(function (k) {
      if (machineKeys.indexOf(k) !== -1) return false;
      if (k.indexOf('flowlist.p.') === 0) return false;
      return Profiles.OWNED.indexOf(k.replace(/^flowlist\./, '')) === -1;
    });
    eq('every board-level key the app writes is one a profile owns', strays.join(' '), '');

  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }

  document.title = 'PROFILE ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre');
  pre.id = 'profileresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
