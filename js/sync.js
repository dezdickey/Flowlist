/* ============================================================
   Flowlist — live sync

   The board on one device, on every device, within a second.

   It uses Firebase's Realtime Database through its plain REST
   interface: a PUT to send, and an EventSource to listen. No SDK, no
   build step, nothing to install — the same as everything else here.

   THIS BROWSER IS ALWAYS THE REAL COPY

   Every change is written to localStorage first, exactly as it was
   before any of this existed. Sync is a second copy, never the only
   one, so the app works with no signal at all: edit on a train, and the
   board is safe on the device the moment you type it.

   What sync adds is a note-to-self — `dirty` — that something is
   waiting to go out. It is saved with everything else, so it survives
   the tab being closed: a change made in a tunnel is still marked
   unsent tomorrow morning, and goes the moment there is a way out.

   WHAT IS STORED, AND WHERE

     <your database>/rooms/<room key>.json
       { rev, at, from, state: { …the whole board… } }

   The room key is a long random word, and it is the whole of the
   security: with the open rules this asks for, anyone who knows the key
   can read and write that room. It is the same bargain as the ntfy
   topic. The data itself sits on Google's servers.

   HOW TWO DEVICES AGREE

   Whole-document, last-write-wins, with a counter:

     · every local change bumps rev and sends the lot
     · an arriving document is adopted only if its rev is higher
     · adopting never sends anything back, so there is no ping-pong
     · but a device with something unsent never adopts — the board in
       front of you wins, and goes over the top of what is out there
     · the counter belongs to the room, not the device: switching rooms
       starts it again, the first send to a room looks before it writes,
       and a room that says it is behind is merged with, never ignored

   That is honest about what it is. Editing the same board on two
   devices at the same moment will lose one side's change — the later
   save wins outright. For one person moving between a laptop and a
   phone, which is what this is for, that is the right trade: no merge
   logic to go subtly wrong, and no half-merged board.

   WHAT IT WILL NOT DO

   It never pushes on the way in. A device that opens with nothing
   waiting pulls first and adopts what is already there, so a fresh
   phone can never wipe the laptop.
   ============================================================ */
const Sync = (function () {

  const PUSH_MS = 1200;        // settle after a change before sending
  const RETRY_MS = 5000;       // first retry; it backs off from there
  const MAX_BYTES = 900000;    // past this a board is too big to keep sending

  let es = null;               // the open EventSource
  let pushTimer = null, retryTimer = null, tries = 0;
  let adopting = false;        // true while we are applying someone else's state
  let selfWrite = false;       // true while sync is writing its own bookkeeping
  let status = { state: 'off', at: null, from: '', error: '', sent: 0, got: 0 };

  const cfg = () => Store.settings().sync || {};

  /**
   * Sync's own notes to itself — the revision, the unsent flag, the device
   * name — go through here. They are saves like any other, and the save hook
   * is what asks sync to send: without this guard, clearing the unsent flag
   * would mark the board unsent again and the two would chase each other
   * around for ever.
   */
  function bookkeep(fn) {
    selfWrite = true;
    try { Store.mutate(fn, null, { silent: true }); } finally { selfWrite = false; }
  }
  const on = () => cfg().on === true && !!cfg().url && !!cfg().room;

  /* ---------- where things live ---------- */
  const base = () => String(cfg().url || '').replace(/\/+$/, '');
  const roomUrl = () => base() + '/rooms/' + encodeURIComponent(cfg().room) + '.json';
  /* Still in the room some slow piece of work started in? Anything it
     fetched or counted belongs to that room, not to whichever one this
     device has been switched to since. */
  const sameRoom = room => room === undefined || cfg().room === room;

  /* ---------- names ---------- */
  function randomKey() {
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 14; i++) out += abc.charAt(Math.floor(Math.random() * abc.length));
    return 'board-' + out;
  }
  /** A name for this device, so the status line can say where a change came from. */
  function deviceName() {
    const c = cfg();
    if (c.device) return c.device;
    const guess = (typeof Mobile !== 'undefined' && Mobile.isPhone()) ? 'Phone' : 'Desktop';
    bookkeep(s => { s.settings.sync.device = guess; });
    return guess;
  }

  /* ============================================================
     THE LITTLE BANNER

     The status line in Settings is the full story. This is the part you
     need without going looking: it comes up when a change could not go
     out, and stays up while that is true, because being offline lasts
     longer than a toast does.

     What it says matters more than that it appears. The change is safe
     — it is on this device, saved, and it will go on its own. So that
     is the sentence, rather than the word "failed".
     ============================================================ */
  const noteEl = document.getElementById('sync-note');
  let noteKind = '';           // '' | 'trouble' | 'back'
  let dismissed = false;       // hidden by hand, until the next spell of trouble
  let backTimer = null;

  const warnOn = () => cfg().warn !== false;

  function paintNote(kind, title, sub) {
    if (!noteEl) return;
    noteKind = kind;
    noteEl.classList.toggle('trouble', kind === 'trouble');
    noteEl.classList.toggle('back', kind === 'back');
    noteEl.classList.toggle('merged', kind === 'merged');
    noteEl.querySelector('.sn-title').textContent = title;
    noteEl.querySelector('.sn-sub').textContent = sub;
    noteEl.classList.add('show');
  }

  function hideNote() {
    clearTimeout(backTimer);
    noteKind = '';
    if (noteEl) noteEl.classList.remove('show');
  }

  /**
   * A change could not go out. Say so, once, and stay up while it is true.
   *
   * Say *why*, where the reason is known. `refused` goes to the trouble of
   * working out that a bare 401 means the board is unlocked and writes out
   * the one sentence that would fix it — and this used to throw that away
   * and announce "Cannot reach the database" instead, which is a different
   * claim and a false one: the database answered, promptly, with a refusal.
   * It sends someone to check their internet when the answer is a
   * passphrase. Only when there is no reason to give does it fall back to
   * saying the database could not be reached.
   */
  function showTrouble() {
    if (!warnOn() || dismissed || noteKind === 'trouble') return;
    const offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
    const why = (status && status.error) || '';
    clearTimeout(backTimer);
    const safe = 'Your change is saved on this device. It will go out on its own.';
    if (offline) { paintNote('trouble', 'Offline — not syncing', safe); return; }
    if (why) {
      paintNote('trouble', 'Your change has not gone out',
        why.charAt(0).toUpperCase() + why.slice(1) + '. ' + safe);
      return;
    }
    paintNote('trouble', 'Cannot reach the database', safe);
  }

  /** A merge happened. Say what it did, and offer the detail. */
  function showMerged(who, report) {
    if (!warnOn()) return;
    dismissed = false;
    clearTimeout(backTimer);
    paintNote('merged', 'Brought together with ' + (who || 'the other device'),
      Merge.sentence(report, who));
    backTimer = setTimeout(hideNote, 7000);
  }

  /** It got through after a spell of trouble. Say so, briefly, then get out. */
  function showBack() {
    dismissed = false;
    if (noteKind !== 'trouble') return;      // nothing was wrong; stay quiet
    if (!warnOn()) { hideNote(); return; }
    paintNote('back', 'Back in sync', 'Everything here is out there too.');
    clearTimeout(backTimer);
    backTimer = setTimeout(hideNote, 3200);
  }

  function wireNote() {
    if (!noteEl) return;
    const x = noteEl.querySelector('.sn-x');
    if (x) x.onclick = () => { dismissed = true; hideNote(); };
    const see = noteEl.querySelector('.sn-see');
    if (see) see.onclick = () => { hideNote(); openLog(); };
  }
  /* ============================================================
     LOCKING IT BEFORE IT LEAVES

     With a passphrase set, the board is encrypted on this device and
     only the ciphertext is sent. Whoever holds the database — Google,
     in the usual case — stores bytes it cannot read. The passphrase
     never leaves the machines you type it into: it is not in the board,
     not in the settings that sync, and not in a backup file.

     AES-GCM with a 256-bit key, from PBKDF2-SHA-256 over the
     passphrase. All of it is the browser's own crypto; nothing is
     bundled and nothing is invented here.

     The salt is derived from the room key rather than being random, so
     two devices reach the same key from the same passphrase without
     having to agree on anything first. The room key is fourteen random
     characters, so it is unique to you, which is what a salt is for.

     WHAT IS STILL IN THE CLEAR

     The revision number and the time of the last change. Both are
     needed to decide whether an arriving copy is newer without
     decrypting it first. The device name travels inside the ciphertext.
     So an onlooker learns that a board exists, roughly how often it
     changes, and nothing else.

     IF THE PASSPHRASE IS LOST there is no way back into the synced
     copy — that is what makes it worth doing. The board on each device
     is untouched and still works; only the copy in the room becomes
     unreadable, and a fresh passphrase overwrites it.
     ============================================================ */
  /* No database is shipped with this copy. Sync is off until you create a
     Firebase Realtime Database of your own and paste its URL into
     Settings -> Sync; the Rules button there gives you the rules to paste
     into Firebase alongside it. Nothing about the board leaves this machine
     before then, and what does leave is encrypted with your passphrase. */
  const DEFAULT_DB = '';

  const PASS_KEY = () => Profiles.key('syncpass.v1');
  const KDF_ROUNDS = 250000;

  let cachedKey = null, cachedFor = '';

  /* The passphrase lives in memory first and is only *remembered* in storage.
     If storage refuses — full, blocked, a private window — the lock must still
     take hold, because the alternative is an app that says it is locked and
     sends plain text anyway. It just will not be remembered next time. */
  let passHeld = null;

  function passphrase() {
    if (passHeld === null) passHeld = readSide(PASS_KEY()) || '';
    return passHeld;
  }
  const locked = () => !!passphrase();

  /**
   *  {Boolean} whether it will still be there next time
   */
  /**
   * Take the passphrase for this session, and write it down only if asked.
   *
   * It is held in memory either way, so the lock works whether or not
   * storage will have it. With "remember" off nothing is written and the
   * next time the app opens it asks again — which on a phone is the whole
   * point: one that is picked up is one that cannot be read.
   *
   * @returns {Boolean} whether it will still be there next time
   */
  function setPassphrase(p) {
    passHeld = p || '';
    cachedKey = null; cachedFor = '';
    if (cfg().remember !== true) {
      dropSide(PASS_KEY());               /* not merely blanked — taken out */
      return false;
    }
    return writeSide(PASS_KEY(), passHeld);
  }

  /* Locking needs the browser's crypto, which it only offers in a secure
     context: https, or a file opened from disk. Plain http from another
     machine does not count, and neither does a page rendered from a data URL. */
  const canLock = () => !!(window.crypto && window.crypto.subtle);

  const bytes = s => new TextEncoder().encode(s);
  /**
   * Bytes to base64, in chunks.
   *
   * This was one `String.fromCharCode.apply(null, bytes)`, which hands every
   * byte to the function as its own argument. A few tens of thousands of
   * arguments is all a stack will take, so the moment a board grew past
   * roughly a hundred kilobytes locked, every send threw "Maximum call stack
   * size exceeded" — and went on throwing, because a board does not get
   * smaller. Receiving was unaffected (`unb64` below was always a loop),
   * which is the signature of it: notes arrive, nothing leaves.
   *
   * 32k at a time is well inside any limit, and the joins cost nothing
   * beside the encryption that produced the bytes.
   */
  const b64 = buf => {
    const b = new Uint8Array(buf);
    const STEP = 0x8000;
    let s = '';
    for (let i = 0; i < b.length; i += STEP) {
      s += String.fromCharCode.apply(null, b.subarray(i, i + STEP));
    }
    return btoa(s);
  };
  const unb64 = s => {
    const raw = atob(s);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  };

  /* ============================================================
     ONE PASSWORD FOR THE WHOLE THING

     Typing a database address, a room key and a passphrase on every new
     device is three chances to get something wrong, and the trouble the
     room key caused proves it. So the hosted copy asks for one password
     and works the rest out.

     The room key is derived from the password rather than being random:
     the same words always land in the same room, so two devices meet
     without having to be told where. A second, separate derivation makes
     the key that actually encrypts the board.

     WHAT THIS COSTS, PLAINLY

     It used to take two secrets to read the board — the room key AND the
     passphrase. Now it takes one. Anyone who guesses the password can
     work out the room key, fetch the board and decrypt it, all from
     nothing but the site address, which is public.

     So the password is the only thing standing in the way, and it has to
     be a real one. Guessing is made expensive rather than impossible:
     a million rounds to reach the room, a quarter million more to reach
     the contents, which puts a guess at roughly a fifth of a second
     before the request is even sent. That is nothing once, on unlocking,
     and ruinous a billion times.

     It is still one secret. Five random words, not a birthday.
     ============================================================ */
  const ROOM_ROUNDS = 1000000;      // once per device, so it can afford to be slow
  const ROOM_SALT = 'flowlist-room-v1';
  const CHECK_WORD = 'flowlist-unlocked';

  /** Turn a password into the room it opens. Same words, same room, always. */
  function roomFor(password) {
    if (!canLock()) return Promise.reject(new Error('this page has no encryption to work it out with'));
    const subtle = window.crypto.subtle;
    return subtle.importKey('raw', bytes(password), 'PBKDF2', false, ['deriveBits'])
      .then(base => subtle.deriveBits(
        { name: 'PBKDF2', salt: bytes(ROOM_SALT), iterations: ROOM_ROUNDS, hash: 'SHA-256' },
        base, 128))
      .then(bits => {
        /* the same alphabet the random keys use, so a derived room key is
           indistinguishable from one that was made by rolling dice */
        const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
        const raw = new Uint8Array(bits);
        let out = '';
        for (let i = 0; i < 14; i++) out += abc.charAt(raw[i] % abc.length);
        return 'board-' + out;
      });
  }

  /**
   * Open up with one password: find the board it opens, take the
   * passphrase, and say what was found.
   *
   * Two rooms are worth looking in. The one this device is already set to
   * comes first — it may have been typed in by hand, or worked out from an
   * earlier password, and it is the board this device was pointed at on
   * purpose. Then the one these words work out to. Whichever the words
   * actually open is the one used.
   *
   * Nothing is taken on — not the words, not the room — until that is
   * known, so a wrong password leaves the device exactly as it was.
   *
   * @returns {Promise<Object>} { ok, found, room, skipped, reason }
   *   ok=false, found=true: there is a board, and these words do not open it.
   *   found=false: neither room has a board yet — a typo, or a brand new
   *   board. The two look identical from here, which is why the screen asks.
   *   skipped: a room holding a board these words did not open, passed over
   *   for the one they did.
   */
  function unlockWith(password) {
    if (!password) return Promise.resolve({ ok: false, reason: 'no password given' });
    if (!canLock()) {
      return Promise.resolve({ ok: false, reason: 'this page cannot encrypt, so it will not sync' });
    }
    const had = cfg().room || '';
    const db = String(cfg().url || DEFAULT_DB).replace(/\/+$/, '');
    if (!db) {
      return Promise.resolve({ ok: false,
        reason: 'no database yet - add one in Settings -> Sync first' });
    }
    let derived = '';

    const look = room => fetch(db + '/rooms/' + encodeURIComponent(room) + '.json')
      .then(r => r.json())
      .then(doc => {
        if (!doc) return { room: room, has: false, opens: false };
        return unseal(doc.enc, room, password)
          .then(() => ({ room: room, has: true, opens: true }),
                () => ({ room: room, has: true, opens: false }));
      });
    /* one at a time, stopping at the first that opens */
    const lookAll = (rooms, seen) => !rooms.length ? Promise.resolve(seen)
      : look(rooms[0]).then(r => r.opens ? seen.concat(r) : lookAll(rooms.slice(1), seen.concat(r)));

    return roomFor(password).then(room => {
      derived = room;
      return lookAll(had && had !== derived ? [had, derived] : [derived], []);
    }).then(seen => {
      const open = seen.filter(r => r.opens)[0];
      const shut = seen.filter(r => r.has && !r.opens)[0];
      if (!open && shut) {
        return { ok: false, found: true, room: shut.room,
                 reason: 'that password does not open this board' };
      }
      const room = open ? open.room : derived;
      setPassphrase(password);
      setLocal('room', room);
      if (!cfg().url) setLocal('url', DEFAULT_DB);
      if (!cfg().device) setLocal('device', deviceName());
      setLocal('on', true);
      return { ok: true, found: !!open, room: room, skipped: shut ? shut.room : '' };
    }).catch(e => ({ ok: false, room: derived,
                     reason: (e && e.message) || 'could not reach the database' }));
  }

  /** Give up the password on this device. The board stays; the room closes. */
  function lockUp() {
    setPassphrase('');
    setLocal('on', false);
    stop();
  }

  /** The key for this room and passphrase, made once and kept in memory.
      @param {String} [at]  another room to make it for — logging in tries more than one */
  function keyNow(at, words) {
    const pass = words === undefined ? passphrase() : words;
    const room = (at === undefined ? cfg().room : at) || '';
    const want = room + ' ' + pass;
    if (cachedKey && cachedFor === want) return Promise.resolve(cachedKey);
    const subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return Promise.reject(new Error('this browser has no crypto to lock with'));

    return subtle.digest('SHA-256', bytes('flowlist:' + room))
      .then(salt => subtle.importKey('raw', bytes(pass), 'PBKDF2', false, ['deriveKey'])
        .then(base => subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: KDF_ROUNDS, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])))
      .then(k => { cachedKey = k; cachedFor = want; return k; });
  }

  /** @returns {Promise<Object>} { v, iv, data } — safe to hand to anyone */
  function seal(payload) {
    // everything below the first line has to be reachable only when there is
    // crypto to reach it with — a throw here would escape the caller's catch
    if (!canLock()) return Promise.reject(new Error('this page has no encryption to lock with'));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    return keyNow()
      .then(k => window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k,
        bytes(JSON.stringify(payload))))
      .then(buf => ({ v: 1, iv: b64(iv), data: b64(buf) }));
  }

  /** @returns {Promise<Object>} the payload, or a rejection if the passphrase is wrong */
  function unseal(env, at, words) {
    if (!canLock()) return Promise.reject(new Error('this page has no encryption to unlock with'));
    if (!env || !env.data) return Promise.reject(new Error('nothing to unlock'));
    return keyNow(at, words)
      .then(k => window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(env.iv) }, k, unb64(env.data)))
      .then(buf => JSON.parse(new TextDecoder().decode(buf)))
      .catch(() => {
        throw new Error('that passphrase does not open this room');
      });
  }

  /**
   * Turn whatever arrived into the plain document the rest of this file
   * expects — decrypting it if it is locked, and refusing rather than
   * guessing when the two ends disagree about whether it should be.
   * @returns {Promise<Object|null>}
   */
  function unwrap(doc) {
    if (!doc) return Promise.resolve(null);
    if (doc.enc) {
      if (!locked()) {
        status = Object.assign({}, status, {
          state: 'waiting',
          error: 'this room is locked — put the passphrase in to read it'
        });
        return Promise.resolve(null);
      }
      return unseal(doc.enc)
        .then(payload => ({ rev: doc.rev, at: doc.at, from: payload.from, state: payload.state }))
        .catch(e => {
          status = Object.assign({}, status, { state: 'waiting', error: e.message });
          return null;
        });
    }
    if (locked() && doc.state) {
      /* the room holds a plain copy while this device is locking: another
         device has not been given the passphrase yet. Say so rather than
         quietly sending readable notes back. */
      status = Object.assign({}, status, {
        state: 'waiting',
        error: 'another device is syncing this room unlocked — give it the passphrase'
      });
      return Promise.resolve(null);
    }
    return Promise.resolve(doc);
  }

  /** Wrap the board for the wire — sealed if there is a passphrase, plain if not. */
  function wrap(rev, state) {
    const openDoc = { rev: rev, at: Date.now(), from: deviceName(), state: state };
    if (!locked()) return Promise.resolve(openDoc);
    /* however seal fails, it fails as a rejection — the caller turns that into
       "saved here, waiting", and nothing readable goes anywhere */
    try {
      return seal({ from: openDoc.from, state: state })
        .then(enc => ({ rev: rev, at: openDoc.at, enc: enc }));
    } catch (e) {
      return Promise.reject(e);
    }
  }


  /* ============================================================
     SENDING
     ============================================================ */

  const dirty = () => cfg().dirty === true;
  function setDirty(v) {
    if (dirty() === v) return;
    bookkeep(s => { s.settings.sync.dirty = v; });
  }

  /** The whole board, wrapped with who sent it and when. */
  function tooBig(body) {
    if (body.length <= MAX_BYTES) return false;
    status = Object.assign({}, status, {
      state: 'waiting',
      error: 'too big to send (' + Math.round(body.length / 1024) + ' KB) — a pasted picture is usually why'
    });
    return true;
  }

  /**
   * A database can be set up to take nothing but locked boards — the rules
   * this app hands out do exactly that. Refusing a plain one then comes
   * back as a bare 401, which reads like a broken key rather than the one
   * thing that would fix it.
   */
  function refused(status) {
    if ((status === 401 || status === 403) && !locked()) {
      return 'the database will only take a locked board — set a passphrase in Sync';
    }
    if (status === 401 || status === 403) {
      return 'the database refused this board (' + status + ') — check the rules on it';
    }
    return 'the database answered ' + status;
  }

  /**
   * Put the board out at a given revision.
   * @returns {Promise<Boolean>} whether it landed
   */
  function send(rev) {
    if (!on()) return Promise.resolve(false);
    const state = JSON.parse(Store.exportState());
    const room = cfg().room;
    return wrap(rev, state).then(doc => sendDoc(doc, rev, state, room)).catch(e => {
      status = Object.assign({}, status, {
        state: 'waiting', error: (e && e.message) || 'could not lock the board'
      });
      showTrouble();
      return false;
    });
  }

  function sendDoc(doc, rev, state, room) {
    const body = JSON.stringify(doc);
    if (tooBig(body)) return Promise.resolve(false);

    /* Everything above here took time — a fetch, a merge, and with a
       passphrase set a key derivation too. Sync may have been switched off
       while it ran, and switching it off has to mean nothing more goes out.
       Nor may it land in a room it was not numbered for: a revision counted
       in one room means nothing in another. */
    if (!on() || !sameRoom(room)) return Promise.resolve(false);
    return fetch(roomUrl(), { method: 'PUT', body: body })
      .then(r => {
        if (!r.ok) throw new Error(refused(r.status));
        if (!sameRoom(room)) return false;
        bookkeep(s => {
          s.settings.sync.rev = rev;
          s.settings.sync.dirty = false;
        });
        clearTimeout(retryTimer);
        tries = 0;
        // what just went out is now what both sides agree on
        setAgreed(state);
        status = Object.assign({}, status, {
          state: 'live', at: Date.now(), error: '', sent: status.sent + 1
        });
        showBack();
        return true;
      })
      .catch(e => {
        /* the change is still safe in this browser — it is only the copy
           out there that is behind, so say so and keep trying */
        status = Object.assign({}, status, {
          state: 'waiting', error: (e && e.message) || 'no answer from the database'
        });
        showTrouble();
        laterTry();
        return false;
      });
  }

  function push() {
    if (!on() || adopting) return Promise.resolve(false);
    setDirty(true);
    if (!(cfg().rev > 0)) return firstSend();
    return send(cfg().rev + 1);
  }

  /**
   * The first thing this device sends to a room it has never agreed anything
   * with. It looks before it writes.
   *
   * Sending blind at revision 1 would put this board over whatever is there,
   * and a room that already holds another device's board is exactly what a
   * second device joining looks like. So: an empty room gets this board; a
   * room with a board in it gets the two brought together, keeping both,
   * because with nothing agreed yet there is no telling an add from a delete;
   * and a board these words cannot open is left strictly alone.
   */
  function firstSend() {
    const room = cfg().room;
    return fetch(roomUrl())
      .then(r => r.json())
      .then(doc => {
        if (!sameRoom(room)) return false;
        if (!doc) return send(1);
        return unwrap(doc).then(plain => {
          if (!sameRoom(room)) return false;
          if (!plain || !plain.state) {
            /* unwrap has already said why; nothing goes over it */
            showTrouble();
            return false;
          }
          return reconcile({ fresh: true, plain: plain });
        });
      }, e => {
        status = Object.assign({}, status, {
          state: 'waiting', error: (e && e.message) || 'no answer from the database'
        });
        showTrouble();
        laterTry();
        return false;
      });
  }

  /**
   * Send over the top of whatever is out there now. Used coming back after a
   * spell offline: the room may have moved on, and the board in front of you
   * is the one to keep.
   */
  function pushOverTop() {
    if (!on() || adopting) return Promise.resolve(false);
    setDirty(true);
    const room = cfg().room;
    return fetch(roomUrl())
      .then(r => r.json())
      .then(doc => sameRoom(room) && send(Math.max(cfg().rev || 0, (doc && doc.rev) || 0) + 1))
      .catch(() => sameRoom(room) && push());   // could not look first; send at our own number
  }

  /**
   * Change one of this device's own sync settings — the room key, the
   * database, the device name.
   *
   * These never travel: the merge treats the whole sync block as local. So
   * editing one must not mark the board unsent, which is what an ordinary
   * save does. Without this, typing the database URL turned sync on
   * mid-sentence and pushed the board to whatever room key happened to be
   * in the box — a freshly generated one, on a second device, before you
   * had pasted the real one over it.
   */
  function setLocal(k, v) {
    /* A different room is a different board with its own count. Carrying
       this device's revision across is how one device's board could land on
       top of another's: a phone at 470 would call a room at 380 "older",
       ignore it, and send its own board over it at 471 — which the other
       device would then take as newer. So the count starts again, nothing
       here is owed to the new room, and the copy agreed with the old room
       is no guide to what is in the new one. The stream still pointed at
       the old room is closed, or what it says next would be taken as news
       from the new one. */
    const moving = k === 'room' && v !== cfg().room;
    bookkeep(s => {
      s.settings.sync[k] = v;
      if (moving) { s.settings.sync.rev = 0; s.settings.sync.dirty = false; }
    });
    if (moving) {
      dropSide(BASE_KEY());
      disconnect();
      clearTimeout(pushTimer);
      if (status.state !== 'off') status = Object.assign({}, status, { state: 'off', error: '' });
    }
  }

  /* ============================================================
     CHANGING THE PASSPHRASE

     The board has to end up readable under the new words and nothing
     must be lost on the way, so this never lets go of the old state
     until the new one has been read back and checked.

     In one-password mode the room key comes from the passphrase, so new
     words mean a new room and the board is republished there. Set up by
     hand, the room key is your own and stays put — only the encryption
     changes. Either way the board on this device is untouched: if any
     step fails, the old passphrase is put back and the old room is
     still sitting there exactly as it was.
     ============================================================ */

  /**
   * @param {String} next  the new passphrase
   * @param {Function} [say]  called with each step, for the screen
   * @returns {Promise<Object>} { ok, room, movedFrom, reason }
   */
  function changePassphrase(next, say) {
    const tell = say || function () {};
    const wasPass = passphrase();
    const wasRoom = cfg().room;
    let moved = null;              // what the old room's bookkeeping was, once we leave it

    if (!next) return Promise.resolve({ ok: false, reason: 'no new passphrase given' });
    if (next === wasPass) return Promise.resolve({ ok: false, reason: 'that is the passphrase you already have' });
    if (!canLock()) return Promise.resolve({ ok: false, reason: 'this page cannot encrypt, so it cannot re-lock the board' });
    if (!on()) return Promise.resolve({ ok: false, reason: 'sync is off, so there is nothing to move' });

    /* whatever is still waiting goes out under the OLD words first, so a
       change made a second ago is not the thing that gets lost */
    tell('Sending anything still waiting…');
    const settled = dirty() ? push() : Promise.resolve(true);

    return settled.then(() => {
      tell('Working out the new room…');
      const gated = Store.settings().sync.gate === true;
      return (gated ? roomFor(next) : Promise.resolve(wasRoom));
    }).then(newRoom => {
      if (!newRoom) throw new Error('could not work out the new room');

      /* from here the device is holding the new words */
      setPassphrase(next);
      if (newRoom !== wasRoom) {
        /* a different room has never heard of us: setLocal starts its count
           fresh, so keep the old room's to put back if this goes wrong */
        moved = { rev: cfg().rev || 0, dirty: dirty(), agreed: lastAgreed() };
        setLocal('room', newRoom);
      }

      tell(newRoom === wasRoom ? 'Locking the board with the new words…'
                               : 'Publishing the board to the new room…');
      return pushOverTop().then(landed => {
        if (!landed) throw new Error('the board would not go out under the new passphrase');
        return newRoom;
      });
    }).then(newRoom => {
      /* read it back and open it, rather than taking the send at its word */
      tell('Checking it can be read back…');
      return fetch(roomUrl())
        .then(r => r.json())
        .then(doc => unwrap(doc))
        .then(plain => {
          if (!plain || !plain.state) throw new Error('the board could not be read back');
          if (!Array.isArray(plain.state.lists)) throw new Error('what came back was not a board');
          tell('Done.');
          if (moved) connect();    // listen to the room the board lives in now
          return { ok: true, room: newRoom, movedFrom: newRoom === wasRoom ? null : wasRoom };
        });
    }).catch(e => {
      /* put everything back exactly as it was; the old room is untouched */
      setPassphrase(wasPass);
      if (moved) {
        setLocal('room', wasRoom);
        bookkeep(s => { s.settings.sync.rev = moved.rev; s.settings.sync.dirty = moved.dirty; });
        if (moved.agreed) setAgreed(moved.agreed);
        connect();
      }
      tell('');
      return { ok: false, reason: (e && e.message) || 'could not change the passphrase' };
    });
  }

  /** Called on every save. Waits for the typing to stop before sending. */
  function nudge() {
    if (!on() || adopting || selfWrite) return;
    setDirty(true);
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, PUSH_MS);
  }

  /** Keep trying while something is waiting, slower each time. */
  function laterTry() {
    if (!on() || !dirty()) return;
    clearTimeout(retryTimer);
    tries = Math.min(tries + 1, 6);
    retryTimer = setTimeout(() => { if (dirty()) push(); }, RETRY_MS * tries);
  }

  /** Whatever is waiting, get it out — after a reconnection or a wake. */
  function catchUp() {
    if (!on()) return Promise.resolve(false);
    return dirty() ? reconcile() : pull();
  }

  /* ============================================================
     THE LAST AGREED COPY, AND THE LOG

     A merge needs three versions, and the third is the board as it
     stood when this device and the room last agreed. It is kept beside
     the board rather than in it: it is bookkeeping, not something you
     would want in a backup file or carried to another machine.

     If it is missing — first run, or storage full — the merge still
     works; it just cannot tell an add from a delete, so it keeps both
     sides. Erring towards keeping things is the right way to be wrong.
     ============================================================ */
  const BASE_KEY = () => Profiles.key('syncbase.v1');
  const LOG_KEY = () => Profiles.key('synclog.v1');
  const LOG_MAX = 60;

  function readSide(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeSide(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); return true; }
    catch (e) { return false; }        // full: the merge gets less clever, nothing breaks
  }
  /** Take it out altogether, rather than leaving an empty one behind. */
  function dropSide(key) {
    try { localStorage.removeItem(key); return true; } catch (e) { return false; }
  }

  /* What both sides last agreed on — a whole copy of the board, which for a
     sealed one must not go to disk in plain text: it would put back exactly
     the words the board is encrypted to hide. Kept in memory instead. The
     merge is a little less clever across a restart without it, which is the
     same degradation writeSide already allows for when storage is full —
     nothing breaks, it just has less to go on. */
  let agreedHere = null;
  const sealedBoard = () => { try { return Store.isSealed(); } catch (e) { return false; } };
  const lastAgreed = () => (sealedBoard() ? agreedHere : readSide(BASE_KEY()));
  const setAgreed = st => {
    if (sealedBoard()) { agreedHere = st; return true; }
    return writeSide(BASE_KEY(), st);
  };

  const log = () => readSide(LOG_KEY()) || [];
  function clearLog() { writeSide(LOG_KEY(), []); }
  function logMerge(who, report) {
    const trim = a => (a || []).slice(0, 40);
    const entry = {
      at: Date.now(),
      who: who || 'the other device',
      came: trim(report.came), kept: trim(report.kept),
      removed: trim(report.removed), conflicts: trim(report.conflicts)
    };
    writeSide(LOG_KEY(), [entry].concat(log()).slice(0, LOG_MAX));
    return entry;
  }

  /**
   * Both sides have moved. Bring them together rather than letting either
   * one win, then send the result so the room has it too.
   */
  /**
   * @param {Object} [opts]
   *   fresh: merge as if nothing had ever been agreed — for a room this device
   *     has no shared history with, where the last agreed copy (if any) would
   *     read everything missing from the room as deleted there
   *   plain: the room's board, already fetched and opened
   */
  function reconcile(opts) {
    const o = opts || {};
    if (!on() || adopting) return Promise.resolve(false);
    /* no revision in this room yet means no history with it, whoever asks */
    const fresh = o.fresh === true || !(cfg().rev > 0);
    const room = cfg().room;
    const EMPTY = {};
    const theirs = o.plain ? Promise.resolve(o.plain)
      : fetch(roomUrl()).then(r => r.json()).then(doc => (doc ? unwrap(doc) : EMPTY));
    return theirs
      .then(plain => {
        if (!sameRoom(room)) return false;
        if (plain === EMPTY) return push();          // nothing there yet: ours is the first copy
        if (!plain || !plain.state) {
          /* There is a board there and it will not open here — the words
             differ, or one end is not locking. unwrap has said which.
             Sending ours over the top of something unread is how a board
             gets lost, so this waits for the words to be put right. */
          showTrouble();
          return false;
        }
        const mine = JSON.parse(Store.exportState());
        const out = Merge.three(fresh ? null : lastAgreed(), mine, plain.state);

        adopting = true;
        try {
          Layouts.take(out.state);
        } finally {
          adopting = false;
        }
        if (out.report.changed) {
          const entry = logMerge(plain.from, out.report);
          status = Object.assign({}, status, { merged: entry });
          /* Say so only when the other device actually brought something.

             A merge where all that happened is that this device's own notes
             were kept is not news — and it happens on a device working alone:
             coming back to a room it has no agreed copy of, its own board is
             merged with its own last copy out there, everything is "kept",
             and it announced a merge with itself. The log still has all of
             it; the banner is for when another device has changed things. */
          const brought = out.report.came.length + out.report.removed.length + out.report.conflicts.length;
          if (brought && plain.from !== deviceName()) showMerged(plain.from, out.report);
        }
        status = Object.assign({}, status, { got: status.got + 1, from: plain.from || '' });
        return send(Math.max(cfg().rev || 0, plain.rev || 0) + 1);
      })
      .catch(e => {
        if (!sameRoom(room)) return false;
        /* could not read theirs; at least send ours — but only into a room
           this device already shares a history with. Into any other, push
           would come straight back here and go round again. */
        if (!fresh) return push();
        status = Object.assign({}, status, {
          state: 'waiting', error: (e && e.message) || 'could not bring the two boards together'
        });
        showTrouble();
        laterTry();
        return false;
      });
  }

  /* ============================================================
     RECEIVING
     ============================================================ */

  /**
   * Take someone else's board, if it is newer than ours and we have nothing
   * of our own waiting to go.
   * @returns {Boolean} whether it was adopted
   */
  /** Unlock whatever arrived, then take it if it is newer. */
  function adopt(incoming) {
    const room = cfg().room;
    return unwrap(incoming).then(doc => sameRoom(room) && takeIt(doc));
  }

  function takeIt(doc) {
    if (!doc || !doc.state) return false;
    const mine = cfg().rev || 0;
    if (doc.rev < mine) {                         // the room is behind this device
      behind();
      return false;
    }
    if (!(doc.rev > mine)) return false;          // the same: nothing new

    if (dirty()) {
      /* Something here has not gone out yet. Neither side should lose its
         work, so the two are brought together instead of one winning. */
      reconcile();
      return false;
    }

    /* The first board taken from a room replaces whatever this device had
       before it joined. That is what joining means — but what was here may
       be the only copy of something, so it is put aside first. */
    if (mine === 0) setAside(doc.state);

    adopting = true;
    try {
      /* the board, not how the sending device happens to be laid out */
      Layouts.take(doc.state);
      /* importJSON replaces settings too, and the incoming copy carries the
         other device's sync block — keep our own key, name and revision */
      bookkeep(s => {
        s.settings.sync = Object.assign({}, s.settings.sync, {
          on: true, url: cfg().url, room: cfg().room,
          device: cfg().device, rev: doc.rev, dirty: false
        });
      });
      setAgreed(doc.state);        // what we just took is now the agreed copy
      status = Object.assign({}, status, {
        state: 'live', at: Date.now(), from: doc.from || '', error: '', got: status.got + 1
      });
    } catch (e) {
      status = Object.assign({}, status, { error: 'could not read what arrived: ' + e.message });
    }
    adopting = false;
    return true;
  }

  /**
   * The room says an older revision than this device last saw.
   *
   * On a live stream that is usually only late news — a snapshot taken
   * before our own send landed — so look again before doing anything. If
   * the room really is behind, it holds a board this device never agreed
   * with: an old copy put back, or a device that arrived carrying another
   * room's count. Ignoring it is not safe. The next change here would go
   * over it at a higher number, and the device it came from would take
   * that as newer and lose its own board. So the two are brought together,
   * keeping both, as if nothing had ever been agreed.
   */
  let checkingBehind = false;
  function behind() {
    if (checkingBehind || adopting || !on()) return Promise.resolve(false);
    checkingBehind = true;
    const room = cfg().room;
    return fetch(roomUrl())
      .then(r => r.json())
      .then(doc => (doc ? unwrap(doc) : null))
      .then(plain => {
        checkingBehind = false;
        if (!sameRoom(room) || !plain || !plain.state) return false;
        if (plain.rev < (cfg().rev || 0)) return reconcile({ fresh: true, plain: plain });
        return takeIt(plain);                   // it had caught up after all
      })
      .catch(() => { checkingBehind = false; return false; });
  }

  /* ============================================================
     WHAT THIS DEVICE HAD BEFORE IT JOINED

     Joining a room means taking the board that is in it. Whatever was on
     this device before is kept to one side — only the newest such copy,
     beside the board rather than in it — and Settings offers to bring it
     back, merged in, for as long as it is there.
     ============================================================ */
  const ASIDE_KEY = () => Profiles.key('beforejoin.v1');

  const noteIds = st => [].concat.apply([], (st.lists || []).map(l => (l.items || []).map(i => i.id)));

  /** Keep this device's board, if it holds any note the incoming one does not. */
  function setAside(incoming) {
    try {
      const here = JSON.parse(Store.exportState());
      const there = noteIds(incoming);
      const samples = Store.sampleTexts();
      const own = [].concat.apply([], (here.lists || []).map(l => l.items || []))
        .filter(i => there.indexOf(i.id) === -1 && samples.indexOf(i.text) === -1);
      if (!own.length) return false;
      return writeSide(ASIDE_KEY(), { at: Date.now(), notes: own.length, room: String(cfg().room).slice(-4), state: here });
    } catch (e) { return false; }
  }

  /** @returns {Object|null} { at, notes } — what is being kept, without the board itself */
  function aside() {
    const a = readSide(ASIDE_KEY());
    return a && a.state ? { at: a.at, notes: a.notes } : null;
  }

  /** Merge the kept board into this one. Both keep everything; nothing is removed. */
  function bringBack() {
    const a = readSide(ASIDE_KEY());
    if (!a || !a.state) return false;
    const mine = JSON.parse(Store.exportState());
    const out = Merge.three(null, mine, a.state);
    Layouts.take(out.state);    // saved, and so sent like any change
    dropSide(ASIDE_KEY());
    return true;
  }

  function throwAside() { dropSide(ASIDE_KEY()); }

  function onMessage(e) {
    if (!e.data) return;
    let msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (!msg || msg.data === undefined) return;

    /* The stream sends the whole room on connect and after any change,
       because that is the only shape we ever write. */
    if (msg.path === '/' || msg.path === undefined) {
      if (msg.data === null) {
        // nothing there yet: ours becomes the first copy
        status = Object.assign({}, status, { state: 'live', error: '' });
        push();
        return;
      }
      adopt(msg.data);
    } else {
      // a partial change from something else writing here: ask for the lot
      pull();
    }
  }

  /** A one-off read, for the cases the stream cannot answer on its own. */
  function pull() {
    if (!on()) return Promise.resolve(false);
    const room = cfg().room;
    return fetch(roomUrl())
      .then(r => r.json())
      .then(doc => sameRoom(room) && adopt(doc))
      .catch(e => {
        status = Object.assign({}, status, {
          state: 'waiting', error: (e && e.message) || 'could not read the database'
        });
        return false;
      });
  }

  /* ============================================================
     PUTTING THE OTHER VERSION BACK

     When both devices reworded the same thing, the merge keeps the copy
     on the device in front of you rather than stopping to ask. The one
     it set aside is not thrown away though — it is written into the log
     with the id of the thing it belonged to, so it can be put back
     later, in your own time, with one press.

     Pressing it again puts it back the other way. It is a swap, not a
     one-way door.
     ============================================================ */

  /** Find anything in the board by its id — a note, a category, a card. */
  function findById(state, id) {
    let hit = null;
    (state.lists || []).forEach(l => {
      if (l.id === id) hit = hit || l;
      (l.items || []).forEach(i => { if (i.id === id) hit = hit || i; });
    });
    (state.presets || []).forEach(p => { if (p.id === id) hit = hit || p; });
    (state.widgets || []).forEach(w => { if (w.id === id) hit = hit || w; });
    (state.canvases || []).forEach(c => {
      if (c.id === id) hit = hit || c;
      ['nodes', 'edges', 'strokes'].forEach(k => {
        (c[k] || []).forEach(x => { if (x.id === id) hit = hit || x; });
      });
    });
    return hit;
  }

  /**
   * Swap a conflict back to the version the merge set aside.
   * @returns {String} what happened, for the toast
   */
  function restoreConflict(entryAt, index) {
    const entries = log();
    const entry = entries.filter(e => e.at === entryAt)[0];
    if (!entry) return 'That merge is no longer in the log.';
    const c = (entry.conflicts || [])[index];
    if (!c || !c.id) return 'There is nothing recorded to put back.';

    const thing = findById(Store.get(), c.id);
    if (!thing) return 'That ' + c.kind + ' is not on the board any more.';

    /* only swap if it still holds what the merge left there — otherwise it has
       been edited since, and quietly overwriting that would be the very thing
       this is meant to avoid */
    /* a move is two fields that travelled together; anything else is one */
    const parts = c.parts || [{ field: c.field, kept: c.kept, dropped: c.dropped }];
    const moved = parts.some(p => JSON.stringify(thing[p.field]) !== JSON.stringify(p.kept));
    if (moved) {
      return 'That ' + c.kind + ' has been changed since, so this was left alone.';
    }

    Store.mutate(() => { parts.forEach(p => { thing[p.field] = p.dropped; }); },
      ['board', 'lists', 'today', 'canvas', 'canvases']);

    /* the log follows: what was dropped is now what is kept */
    const swapped = { kept: c.dropped, dropped: c.kept, restored: !c.restored };
    if (c.parts) {
      swapped.parts = c.parts.map(p => ({ field: p.field, kept: p.dropped, dropped: p.kept }));
    }
    entry.conflicts[index] = Object.assign({}, c, swapped);
    writeSide(LOG_KEY(), entries);
    renderLog();
    return 'Put back — “' + String(c.dropped).slice(0, 40) + '”.';
  }

  /* ============================================================
     THE LOG, ON SCREEN

     Nothing should happen to the board unseen. Every merge is written
     down, and this is where you read it: newest first, grouped by day,
     each one saying what came in, what stayed, what went, and anything
     it had to choose between.
     ============================================================ */
  const logEl = document.getElementById('sync-log');
  const logBody = document.getElementById('log-body');

  const KINDS = [
    { key: 'came',      mark: '←', cls: 'in',   one: 'came in from there',   many: 'came in from there' },
    { key: 'kept',      mark: '→', cls: 'out',  one: 'kept from here',       many: 'kept from here' },
    { key: 'removed',   mark: '−', cls: 'gone', one: 'removed',              many: 'removed' },
    { key: 'conflicts', mark: '!', cls: 'clash', one: 'had to be chosen',    many: 'had to be chosen' }
  ];

  function dayLabel(ms) {
    const d = new Date(ms), now = new Date();
    const same = (a, b) => a.toDateString() === b.toDateString();
    const yesterday = new Date(now.getTime() - 86400000);
    if (same(d, now)) return 'Today';
    if (same(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }
  const clockOf = ms => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  /** "3 notes" / "1 category" — the things themselves, not jargon. */
  const PLURAL = { category: 'categories' };
  const plural = (n, word) => n + ' ' + (n === 1 ? word : (PLURAL[word] || word + 's'));

  function countLine(items) {
    const byKind = {};
    items.forEach(i => { byKind[i.kind] = (byKind[i.kind] || 0) + 1; });
    return Object.keys(byKind).map(k => plural(byKind[k], k)).join(', ');
  }

  function namesLine(items, max) {
    const shown = items.slice(0, max || 3).map(i => '“' + (i.name || 'untitled') + '”');
    const rest = items.length - shown.length;
    return shown.join(', ') + (rest > 0 ? ' and ' + rest + ' more' : '');
  }

  function entryEl(e) {
    const card = document.createElement('div');
    card.className = 'log-entry';
    const head = document.createElement('div');
    head.className = 'le-head';
    head.innerHTML = '<b>' + clockOf(e.at) + '</b><span>with ' + UI.esc(e.who) + '</span>';
    card.appendChild(head);

    let any = false;
    KINDS.forEach(k => {
      const items = e[k.key] || [];
      if (!items.length) return;
      any = true;
      const row = document.createElement('div');
      row.className = 'le-row ' + k.cls;
      row.innerHTML =
        '<span class="le-mark">' + k.mark + '</span>' +
        '<span class="le-what"><b>' + UI.esc(countLine(items)) + '</b> ' + k.many + '</span>' +
        '<span class="le-names">' + UI.esc(namesLine(items)) + '</span>';
      card.appendChild(row);
    });

    (e.conflicts || []).forEach((c, i) => {
      const box = document.createElement('div');
      box.className = 'le-clash';
      const show = v => (typeof v === 'string' ? v : JSON.stringify(v));

      const line = document.createElement('div');
      line.className = 'lc-line';
      line.innerHTML = '<b>“' + UI.esc(c.name || 'untitled') + '”</b> had its ' +
        UI.esc(c.field) + ' changed on both.';
      box.appendChild(line);

      const side = (tag, val, action) => {
        const d = document.createElement('div');
        d.className = 'lc-side' + (action ? ' other' : ' kept');
        d.innerHTML = '<span class="lc-tag">' + tag + '</span>' +
          '<span class="lc-val">' + UI.esc(show(val)) + '</span>';
        if (action) {
          const b = document.createElement('button');
          b.className = 'lc-use';
          b.textContent = 'Use this instead';
          b.onclick = () => UI.toast(restoreConflict(e.at, i));
          d.appendChild(b);
        }
        box.appendChild(d);
      };
      side(c.restored ? 'in place now, from ' + UI.esc(e.who) : 'kept, from this device', c.kept, false);
      side(c.restored ? 'set aside, from this device' : 'set aside, from ' + UI.esc(e.who), c.dropped, true);
      card.appendChild(box);
    });

    if (!any) {
      const row = document.createElement('div');
      row.className = 'le-row';
      row.innerHTML = '<span class="le-mark">·</span><span class="le-what">nothing to bring together</span>';
      card.appendChild(row);
    }
    return card;
  }

  function renderLog() {
    if (!logBody) return;
    const entries = log();
    logBody.innerHTML = '';
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'log-empty';
      empty.innerHTML = 'Nothing to show yet.<br>' +
        'This fills up when two devices have both changed the board and their work is brought together.';
      logBody.appendChild(empty);
      return;
    }
    let day = '';
    entries.forEach(e => {
      const d = dayLabel(e.at);
      if (d !== day) {
        day = d;
        const h = document.createElement('div');
        h.className = 'log-day';
        h.textContent = d;
        logBody.appendChild(h);
      }
      logBody.appendChild(entryEl(e));
    });
  }

  function openLog() {
    renderLog();
    if (logEl) logEl.classList.add('show');
    const scrim = document.getElementById('scrim');
    if (scrim) scrim.classList.add('show');
  }
  function closeLog() {
    if (logEl) logEl.classList.remove('show');
    const scrim = document.getElementById('scrim');
    if (scrim && !document.getElementById('settings').classList.contains('show')) {
      scrim.classList.remove('show');
    }
  }

  function wireLog() {
    const close = document.getElementById('log-close');
    const clear = document.getElementById('log-clear');
    if (close) close.onclick = closeLog;
    if (clear) clear.onclick = () => {
      if (window.confirm('Forget every merge listed here? The board itself is untouched.')) {
        clearLog();
        renderLog();
      }
    };
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && logEl && logEl.classList.contains('show')) closeLog();
    });
  }

  /* ============================================================
     THE CONNECTION
     ============================================================ */
  function connect() {
    disconnect();
    if (!on()) { status = Object.assign({}, status, { state: 'off' }); return; }
    if (typeof EventSource === 'undefined') {
      status = Object.assign({}, status, { state: 'off', error: 'this browser has no EventSource' });
      return;
    }
    status = Object.assign({}, status, { state: 'connecting', error: '' });
    try {
      es = new EventSource(roomUrl());
    } catch (e) {
      status = Object.assign({}, status, { state: 'off', error: 'could not open the stream' });
      return;
    }
    /* only the stream that is open now may speak: one closed when the room
       changed can still have a message on its way */
    const stream = es;
    const heard = e => { if (es === stream) onMessage(e); };
    es.addEventListener('put', heard);
    es.addEventListener('patch', heard);
    es.addEventListener('open', () => {
      if (es !== stream) return;
      status = Object.assign({}, status, { state: 'live', error: '' });
      catchUp();                     // anything that piled up while we were away
    });
    es.addEventListener('error', () => {
      if (es !== stream) return;
      /* EventSource reconnects on its own, but Firebase drops idle streams and
         the browser can give up; a slow retry of our own covers that */
      status = Object.assign({}, status, { state: 'connecting' });
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { if (on()) connect(); }, RETRY_MS);
    });
  }

  function disconnect() {
    clearTimeout(retryTimer);
    if (es) { try { es.close(); } catch (e) { /* already gone */ } }
    es = null;
  }

  function stop() {
    disconnect();
    clearTimeout(pushTimer);
    status = Object.assign({}, status, { state: 'off' });
  }

  /** The button: send this board, over the top of whatever is out there. */
  function pushNow() {
    clearTimeout(pushTimer);
    // bring the two together first, so the button can never wipe the other device
    return reconcile();
  }

  function init() {
    wireNote();
    wireLog();
    Store.onPersist(nudge);
    if (on()) connect();
    /* the browser telling us the signal is back is the best moment to try */
    window.addEventListener('online', catchUp);
    /* and a tab coming back to life may have missed a change while it was hidden */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && on()) { if (!es) connect(); else catchUp(); }
    });
  }

  return {
    init, connect, disconnect, stop, pull, push, pushNow, pushOverTop, catchUp, nudge, adopt,
    setPassphrase, hasPassphrase: locked, canLock, seal, unseal, wrap, unwrap,
    /* out here so the size they have to survive can be tested without
       waiting on the browser's crypto - see locktest */
    b64, unb64,
    showTrouble, showBack, showMerged, hideNote,
    reconcile, log, clearLog, openLog, closeLog, renderLog, restoreConflict, findById,
    lastAgreed, setAgreed,
    aside, bringBack, throwAside,
    noteKind: () => noteKind,
    randomKey, deviceName, roomUrl, setLocal,
    heldPassphrase: passphrase,
    roomFor, unlockWith, lockUp, changePassphrase, DEFAULT_DB: () => DEFAULT_DB,
    isOn: on,
    isDirty: dirty,
    isAdopting: () => adopting,
    status: () => status
  };
})();
