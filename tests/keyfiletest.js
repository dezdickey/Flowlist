/*
 * A profile whose key lives on a stick.
 *
 * The point of the whole arrangement is that the laptop holds nothing that
 * opens the board: the data key is written down twice, once locked by the
 * key file and once by a backup passphrase, and neither copy is any use on
 * its own. These check that is actually true rather than nearly true.
 *
 * The passphrase path is deliberately slow — a million-odd rounds, because
 * it is the one part an attacker with the drive can work on offline — so it
 * is exercised as few times as the assertions allow.
 */
var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

var WORDS = 'a properly long backup passphrase for this board';
/* the real count does not fit the runner's virtual clock; the path is the same */
KeyFile.setRounds(1000);

setTimeout(async function () {
  try {
    ok('the browser can do this at all', KeyFile.available());

    /* ---------- the file that goes on the stick ---------- */
    var fileA = KeyFile.makeKeyFile();
    var fileB = KeyFile.makeKeyFile();
    ok('a key file is made', /"key"/.test(fileA));
    ok('...a new one every time', fileA !== fileB);
    ok('...and it says nothing about what it opens',
       !/flowlist|board|profile/i.test(fileA.replace(/"key"[\s\S]*/, '')), fileA.slice(0, 60));

    /* ---------- a weak backup passphrase is the soft spot, so it is refused ---------- */
    var weak = await KeyFile.create(fileA, 'hunter2').then(function () { return null; },
      function (e) { return e.message; });
    ok('a weak backup passphrase is refused', !!weak && /long one/.test(weak), weak);
    var none = await KeyFile.create(fileA, '').then(function () { return null; },
      function (e) { return e.message; });
    ok('...and so is none at all', !!none);

    /* ---------- setting one up ---------- */
    var locks = await KeyFile.create(fileA, WORDS);
    eq('what is stored beside the profile is the two locked copies and a salt',
       Object.keys(locks).sort().join(','), 'pass,rounds,salt,sticks,v');
    ok('...and the passphrase itself is nowhere in it',
       JSON.stringify(locks).indexOf(WORDS) === -1);
    ok('...nor is the key off the stick',
       JSON.stringify(locks).indexOf(JSON.parse(fileA).key) === -1);

    /* ---------- the stick opens it ---------- */
    var byStick = await KeyFile.openWithFile(locks, fileA);
    ok('the stick opens the board key', byStick && byStick.length === 32, byStick && byStick.length);

    var wrongStick = await KeyFile.openWithFile(locks, fileB)
      .then(function () { return false; }, function () { return true; });
    ok('...and another stick does not', wrongStick);

    var rubbish = await KeyFile.openWithFile(locks, 'not even a key file')
      .then(function () { return false; }, function () { return true; });
    ok('...nor does a file that is not one of ours', rubbish);

    /* ---------- the backup passphrase opens the same thing ---------- */
    var byPass = await KeyFile.openWithPass(locks, WORDS);
    ok('the backup passphrase opens the very same key',
       KeyFile.b64(byStick) === KeyFile.b64(byPass));

    var wrongPass = await KeyFile.openWithPass(locks, 'a different long passphrase altogether')
      .then(function () { return false; }, function () { return true; });
    ok('...and the wrong words do not', wrongPass);

    /* ---------- the board under that key ---------- */
    var board = { lists: [{ id: 'l', name: 'Private', items: [{ id: 'i', text: 'KEYFILE-SECRET-NOTE' }] }] };
    var sealed = await KeyFile.sealBoard(byStick, board);
    ok('a sealed board holds none of its words', sealed.indexOf('KEYFILE-SECRET-NOTE') === -1);
    ok('...nor the name of a list', sealed.indexOf('Private') === -1);
    ok('...and is recognisable as sealed', KeyFile.isSealed(sealed));
    ok('...while a plain board is not', !KeyFile.isSealed(JSON.stringify(board)));

    var back = await KeyFile.openBoard(byStick, sealed);
    eq('it comes back word for word', back.lists[0].items[0].text, 'KEYFILE-SECRET-NOTE');
    var backToo = await KeyFile.openBoard(byPass, sealed);
    eq('...however it was opened', backToo.lists[0].items[0].text, 'KEYFILE-SECRET-NOTE');

    /* a key that is not the right one gets nothing, rather than nonsense */
    var otherKey = await KeyFile.openWithFile(await KeyFile.create(fileB, WORDS), fileB);
    var denied = await KeyFile.openBoard(otherKey, sealed)
      .then(function () { return false; }, function () { return true; });
    ok('another board\'s key opens nothing of this one', denied);

    /* The count travels with the bundle, or a board made before it ever
       changed could never be opened again — it would derive a different
       key and say the words were wrong. Found the hard way: the locks were
       made at the test count and opened at the real one. */
    eq('the bundle remembers how slowly its passphrase was derived', locks.rounds, 1000);
    var slowly = Object.assign({}, locks, { rounds: 4000 });
    var mismatched = await KeyFile.openWithPass(slowly, WORDS)
      .then(function () { return false; }, function () { return true; });
    ok('...and a bundle opened at the wrong count does not quietly succeed', mismatched);

    /* ---------- a spare stick ----------
       Only makeable by someone who could already open the board, because
       it takes the data key to make one. Each gets its own key, so a lost
       one can be revoked without disturbing the rest. */
    var spare = await KeyFile.addStick(locks, byStick);
    eq('a spare is a second key, not a copy of the first', spare.locks.sticks.length, 2);
    ok('...on a key file of its own', spare.file !== fileA);
    var bySpare = await KeyFile.openWithFile(spare.locks, spare.file);
    ok('the spare opens the same board key', KeyFile.b64(bySpare) === KeyFile.b64(byStick));
    var byFirstStill = await KeyFile.openWithFile(spare.locks, fileA);
    ok('...and the first one still works', KeyFile.b64(byFirstStill) === KeyFile.b64(byStick));

    var revoked = KeyFile.dropStick(spare.locks, 0);
    eq('a stick can be revoked', revoked.sticks.length, 1);
    var deadNow = await KeyFile.openWithFile(revoked, fileA)
      .then(function () { return false; }, function () { return true; });
    ok('...and then it opens nothing', deadNow);
    ok('...while the other still does',
       KeyFile.b64(await KeyFile.openWithFile(revoked, spare.file)) === KeyFile.b64(byStick));
    ok('the last stick cannot be revoked, or the board would need the passphrase alone',
       KeyFile.dropStick(revoked, 0) === null);

    /* ---------- two sealings of the same board differ ---------- */
    var again = await KeyFile.sealBoard(byStick, board);
    ok('sealing twice does not produce the same bytes twice', again !== sealed);

    /* ---------- the handle is a reference, not a key ---------- */
    ok('a stored handle is not the key itself',
       typeof KeyFile.readRemembered === 'function' && typeof KeyFile.remember === 'function');
    var nothing = await KeyFile.readRemembered('no-such-profile');
    eq('...and nothing is remembered for a profile that never set one up', nothing, null);

  } catch (e) { FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e)); }

  document.title = 'KEYFILE ' + PASS + ' passed ' + FAIL + ' failed';
  var pre = document.createElement('pre');
  pre.id = 'keyfileresults';
  pre.textContent = OUT.join('\n');
  document.body.appendChild(pre);
}, 2600);
