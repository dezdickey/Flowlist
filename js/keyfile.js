/* ============================================================
   Flowlist — the key on a stick

   A profile whose key lives on a removable drive rather than on this
   machine. Plug the stick in, pick the key file once, and that board
   opens without a word typed; take the stick away and it will not open at
   all, and what is left on the laptop is ciphertext with no key anywhere
   near it.

   This is the only arrangement that answers both halves of what was
   asked — never type a password, and leave nothing recoverable behind —
   because it moves the secret off the machine instead of trying to erase
   it afterwards. Erasing was never going to work: the browser's storage
   appends rather than overwrites, and the drives here are SSDs that remap
   blocks internally. A secret that was never written down needs no
   erasing, and a stick can be snapped in half, which genuinely works.

   HOW THE KEYS FIT TOGETHER

   The board is encrypted with a random data key. That data key is then
   written down twice, each copy locked a different way:

       wrapped.stick  the data key, locked by the key file on the stick
       wrapped.pass   the data key, locked by the backup passphrase

   Both copies live on this machine, and both are useless on their own.
   The stick opens it every day without typing; the passphrase is there
   for the day the stick is lost, and is never stored anywhere.

   WHAT TO BE HONEST ABOUT

   The passphrase copy is the one thing an attacker with the drive can
   work on at leisure, offline, for as long as they like. That is why
   `judge()` is consulted when it is set and a weak one is refused: it is
   not nannying, it is the actual soft spot of the whole design.

   Losing both the stick and the passphrase means that board is gone, on
   this machine and in its sync room. There is no way back and there must
   not be one — see house rule 2.
   ============================================================ */
const KeyFile = (function () {

  /* How hard the backup passphrase is to attack. The stick's key is random
     and full-length, so it needs no stretching; the passphrase does, and
     this is the only thing standing between a stolen drive and the board. */
  const PASS_ROUNDS = 1200000;
  const SALT_LEN = 16;

  /* The rounds actually used. Only the suite ever changes this, and only
     because a million of them do not fit inside the headless runner's
     virtual-time budget — the same wall `refusetest` hit, where a suite
     that cannot report is worse than one that fails. The code path is
     identical either way; only the cost of guessing changes, so nothing
     but the test is weakened. Anything that calls this in the app is a
     bug. */
  let rounds = PASS_ROUNDS;
  const setRounds = n => { rounds = Math.max(1000, n | 0); };

  /* Where the handle to the key file is kept. The handle is a reference,
     not the key: without the stick plugged in it opens nothing. */
  const DB = 'flowlist-keys';
  const SHELF = 'handles';

  const enc = new TextEncoder();
  const can = () => !!(window.crypto && window.crypto.subtle);
  const rand = n => window.crypto.getRandomValues(new Uint8Array(n));

  /* base64 both ways, chunked — the same lesson as js/sync.js: handing
     every byte to fromCharCode as an argument blows the stack on anything
     sizeable. */
  function b64(buf) {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) {
    const raw = atob(s);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  /* ---------- the key file itself ---------- */

  /**
   * What gets written to the stick: a long random secret and nothing else
   * that could identify what it belongs to. A found stick should say as
   * little as possible about what it opens.
   */
  function makeKeyFile() {
    return JSON.stringify({ v: 1, key: b64(rand(32)) }, null, 2) + '\n';
  }

  /** Turn the file's contents into a key that can unwrap the data key. */
  async function keyFromFile(text) {
    let secret = null;
    try {
      const o = JSON.parse(text);
      if (o && typeof o.key === 'string') secret = o.key;
    } catch (e) { /* not ours — fall through */ }
    if (!secret) throw new Error('that file is not a Flowlist key');
    const raw = await window.crypto.subtle.importKey('raw', unb64(secret), 'HKDF', false, ['deriveKey']);
    return window.crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('flowlist.keyfile.v1'), info: enc.encode('wrap') },
      raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /**
   * And from the backup passphrase, slowly, because this one is guessable.
   *
   * @param {Number} [n]  how many rounds — taken from the bundle when
   *        opening one, not from the current setting. A bundle made at one
   *        count and opened at another derives a different key and simply
   *        says the words are wrong, which is a miserable thing to debug
   *        and would strand every board made before the count changed. So
   *        the count travels with the bundle.
   */
  async function keyFromPass(words, salt, n) {
    const raw = await window.crypto.subtle.importKey('raw', enc.encode(words), 'PBKDF2', false, ['deriveKey']);
    return window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: n || rounds, hash: 'SHA-256' },
      raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /* ---------- wrapping the data key ---------- */

  async function wrap(key, dataKey) {
    const iv = rand(12);
    const buf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, dataKey);
    return { iv: b64(iv), data: b64(buf) };
  }
  async function unwrap(key, w) {
    const buf = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv) }, key, unb64(w.data));
    return new Uint8Array(buf);
  }

  /**
   * Set a profile up to be opened by a stick.
   * @returns {Object} what to store beside the profile, and the file to write
   */
  async function create(fileText, words) {
    if (!can()) throw new Error('this page has no encryption to lock with');
    const strength = Lock.judge(words || '');
    if (!words || strength.score < 2) {
      throw new Error('the backup passphrase has to be a long one — it is the only part of this ' +
                      'someone with the drive can attack at their leisure');
    }
    const dataKey = rand(32);
    const salt = rand(SALT_LEN);
    const stick = await wrap(await keyFromFile(fileText), dataKey);
    const pass = await wrap(await keyFromPass(words, salt), dataKey);
    /* a list, because there can be more than one stick - see addStick */
    return { v: 1, salt: b64(salt), rounds: rounds, sticks: [stick], pass: pass };
  }

  /**
   * Cut another key for the same board.
   *
   * This takes the data key, which means the caller had to open the board
   * first - with the stick they already hold or with the backup
   * passphrase. That is the point: a spare can only be made by someone who
   * could already get in, so it hands out nothing new. Each stick gets its
   * own key rather than a copy of the first, so one can be revoked on its
   * own if it goes missing.
   *
   * @returns {Object} { locks, file } - the bundle to store, and what to
   *          write on the new stick
   */
  async function addStick(locks, dataKey) {
    const file = makeKeyFile();
    const w = await wrap(await keyFromFile(file), dataKey);
    const sticks = (locks.sticks || []).concat([w]);
    return { locks: Object.assign({}, locks, { sticks: sticks }), file: file };
  }

  /**
   * Stop a stick opening this board. Its wrap is what made it work, so
   * dropping the wrap is a real revocation on this machine - though anyone
   * holding both that stick and an older copy of this storage still has a
   * working pair, which is the honest limit of doing it this way.
   */
  function dropStick(locks, at) {
    const sticks = (locks.sticks || []).slice();
    if (at < 0 || at >= sticks.length || sticks.length < 2) return null;
    sticks.splice(at, 1);
    return Object.assign({}, locks, { sticks: sticks });
  }

  /** Open the data key with whichever stick this is, if any of them. */
  async function openWithFile(locks, fileText) {
    const key = await keyFromFile(fileText);
    const sticks = locks.sticks || (locks.stick ? [locks.stick] : []);
    for (const w of sticks) {
      try { return await unwrap(key, w); } catch (e) { /* not this one */ }
    }
    throw new Error('that key does not open this board');
  }
  /** Open it with the backup passphrase instead. */
  async function openWithPass(locks, words) {
    return unwrap(await keyFromPass(words, unb64(locks.salt), locks.rounds), locks.pass);
  }

  /* ---------- the board, under that key ---------- */

  async function aesKey(dataKey) {
    return window.crypto.subtle.importKey('raw', dataKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  /** @returns {Promise<String>} what to write where the plain board used to go */
  async function sealBoard(dataKey, obj) {
    const iv = rand(12);
    const buf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv },
      await aesKey(dataKey), enc.encode(JSON.stringify(obj)));
    return JSON.stringify({ enc: 1, iv: b64(iv), data: b64(buf) });
  }

  /** @returns {Promise<Object|null>} the board, or null if this is not sealed */
  async function openBoard(dataKey, raw) {
    let o = null;
    try { o = JSON.parse(raw); } catch (e) { return null; }
    if (!o || o.enc !== 1) return null;
    const buf = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) },
      await aesKey(dataKey), unb64(o.data));
    return JSON.parse(new TextDecoder().decode(buf));
  }

  /** Is what is saved there sealed, rather than a plain board? */
  function isSealed(raw) {
    if (!raw) return false;
    try { const o = JSON.parse(raw); return !!(o && o.enc === 1 && o.iv && o.data); }
    catch (e) { return false; }
  }

  /* ---------- remembering which file, without remembering the key ----------
     Chrome will hand back a stored handle, and asks once whether this page
     may read it again. The handle records where the file was, not what is
     in it, so a copy of this database on its own opens nothing. */

  function idb() {
    return new Promise((ok, no) => {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore(SHELF); };
      rq.onsuccess = () => ok(rq.result);
      rq.onerror = () => no(rq.error);
    });
  }
  async function remember(id, handle) {
    const db = await idb();
    return new Promise((ok, no) => {
      const t = db.transaction(SHELF, 'readwrite');
      t.objectStore(SHELF).put(handle, id);
      t.oncomplete = () => ok(true);
      t.onerror = () => no(t.error);
    });
  }
  async function recall(id) {
    const db = await idb();
    return new Promise(ok => {
      const t = db.transaction(SHELF, 'readonly');
      const rq = t.objectStore(SHELF).get(id);
      rq.onsuccess = () => ok(rq.result || null);
      rq.onerror = () => ok(null);
    });
  }
  async function forgetHandle(id) {
    try {
      const db = await idb();
      await new Promise(ok => {
        const t = db.transaction(SHELF, 'readwrite');
        t.objectStore(SHELF).delete(id);
        t.oncomplete = ok; t.onerror = ok;
      });
    } catch (e) { /* nothing stored, then */ }
  }

  /**
   * Read the key file through a handle we were given earlier.
   * @returns {Promise<String|null>} the text, or null if the stick is not
   *          there or this page may not read it without being asked again
   */
  async function readRemembered(id) {
    const h = await recall(id);
    if (!h) return null;
    try {
      if (h.queryPermission) {
        const state = await h.queryPermission({ mode: 'read' });
        if (state !== 'granted') return null;
      }
      const f = await h.getFile();
      return await f.text();
    } catch (e) { return null; }   // unplugged, moved, or permission withdrawn
  }

  /** Ask for it properly. Needs a click behind it — the browser insists. */
  async function askPermission(id) {
    const h = await recall(id);
    if (!h || !h.requestPermission) return null;
    try {
      const state = await h.requestPermission({ mode: 'read' });
      if (state !== 'granted') return null;
      const f = await h.getFile();
      return await f.text();
    } catch (e) { return null; }
  }

  const available = () => typeof window.showOpenFilePicker === 'function' && can();

  return {
    available, makeKeyFile, create, addStick, dropStick, openWithFile, openWithPass,
    sealBoard, openBoard, isSealed,
    remember, recall, forgetHandle, readRemembered, askPermission,
    b64, unb64, PASS_ROUNDS, setRounds
  };
})();
