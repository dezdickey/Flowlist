/* ============================================================
   Flowlist — profiles

   More than one board on one machine. Each profile keeps its own
   everything: its notes, its undo, its room key, its passphrase, its sync
   log. Switching is a clean swap, not a merge — the two never see each
   other's work, which is the point of having two.

   HOW THE SPLIT IS DONE

   Every piece of storage is asked for by name through `key()`, and that
   name is prefixed per profile. The first profile deliberately keeps the
   original, unprefixed names — `flowlist.state.v1` and the rest — so the
   board that was already here is exactly where it has always been and no
   migration ever runs over it. A profile added later gets
   `flowlist.p.<id>.state.v1` and so on, and starts empty.

   The register of profiles itself is NOT prefixed: it belongs to the
   machine rather than to any one board, and it is the one thing that has
   to be readable before we know which profile we are in.

   WHAT SWITCHING DOES

   The board on screen is written out and pushed to its room before
   anything is swapped, so a switch can never be the thing that loses a
   change. Then the page reloads. Reloading is deliberate: every module
   reads its storage once at startup, and asking all of them to let go of
   one board and pick up another at runtime is a long tail of subtle bugs
   for no gain on a page that reloads in well under a second.

   WHAT "FORGET" CAN AND CANNOT DO

   Read `forget()` before promising anyone anything. It removes a
   profile's data from this device and overwrites the entries first, but
   that is housekeeping, not destruction — see the note there.
   ============================================================ */
const Profiles = (function () {
  /* not prefixed: this is the machine's, not a board's */
  const REG = 'flowlist.profiles.v1';
  const MAIN = 'main';

  /* every name a profile owns, so adding one and forgetting one both stay
     honest as the app grows. If you add a new localStorage key anywhere
     that belongs to a board rather than to the machine, add it here. */
  const OWNED = [
    'state.v1',        // the board
    'undo.v1',         // what was deleted lately
    'syncpass.v1',     // the passphrase, if this device was told to keep it
    'syncbase.v1',     // what both sides last agreed on
    'synclog.v1',      // what sync has done
    'beforejoin.v1',   // the board set aside when joining a room
    'tomorrowOpen.v1', // whether the Tomorrow fold is open
    'laterOpen.v1',    // which later days are open
    'locks.v1'         // the two locked copies of the board's key, if it has one
  ];

  let reg = load();

  function load() {
    try {
      const r = JSON.parse(localStorage.getItem(REG) || 'null');
      if (r && Array.isArray(r.list) && r.list.length) return r;
    } catch (e) { /* unreadable: start from the one that has always been here */ }
    return { active: MAIN, list: [{ id: MAIN, name: 'Main' }] };
  }

  function save() {
    try { localStorage.setItem(REG, JSON.stringify(reg)); return true; }
    catch (e) { return false; }
  }

  const active = () => reg.active || MAIN;
  const list = () => reg.list.map(p => ({ id: p.id, name: p.name }));
  const isMain = id => (id || active()) === MAIN;
  const nameOf = id => {
    const p = reg.list.find(x => x.id === (id || active()));
    return p ? p.name : (id || active());
  };

  /**
   * The storage name a piece of state lives under for the profile in use.
   * @param {String} base  e.g. "state.v1"
   */
  function key(base) {
    return isMain() ? 'flowlist.' + base : 'flowlist.p.' + active() + '.' + base;
  }
  /** The same, for a profile that is not the one in use — used by forget(). */
  const keyFor = (id, base) => (id === MAIN ? 'flowlist.' + base : 'flowlist.p.' + id + '.' + base);

  /* ---------- the locked copies of a board's key ----------
     Stored beside the profile, never secret in themselves: one copy the
     stick opens and one the backup passphrase opens, both useless alone.
     A profile with these is kept encrypted on disk. */

  function locks(id) {
    try { return JSON.parse(localStorage.getItem(keyFor(id || active(), 'locks.v1')) || 'null'); }
    catch (e) { return null; }
  }
  function setLocks(id, bundle) {
    const name = keyFor(id || active(), 'locks.v1');
    try {
      if (bundle) localStorage.setItem(name, JSON.stringify(bundle));
      else localStorage.removeItem(name);
      return true;
    } catch (e) { return false; }
  }
  const isLocked = id => !!locks(id);

  /* ---------- adding ---------- */

  function add(name) {
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    reg.list.push({ id: id, name: (name || '').trim() || ('Profile ' + (reg.list.length + 1)) });
    save();
    return id;
  }

  function rename(id, name) {
    const p = reg.list.find(x => x.id === id);
    if (!p) return false;
    p.name = (name || '').trim() || p.name;
    return save();
  }

  /* ---------- switching ---------- */

  const wait = ms => new Promise(r => setTimeout(r, ms));

  /**
   * Put the board away properly, then pick up another one.
   *
   * The order matters and is the whole of the request: write to disk, then
   * push to the room, and only then swap. If the push cannot be done —
   * offline, no passphrase, a room that will not take it — the switch
   * still happens, because the board is safe on this device either way and
   * refusing to switch would stranda you. It says so rather than pretending.
   */
  async function switchTo(id, opts) {
    if (!reg.list.some(p => p.id === id)) return false;
    if (id === active()) return false;

    let sent = false;
    try { Store.flush(); } catch (e) { /* already written, then */ }
    try {
      if (typeof Sync !== 'undefined' && Sync.isOn && Sync.isOn()) {
        /* a push that hangs must not hold the switch hostage */
        await Promise.race([Promise.resolve(Sync.pushNow()).then(() => { sent = true; }), wait(8000)]);
      }
    } catch (e) { sent = false; }

    reg.active = id;
    if (!save()) return false;

    /* The board in memory belongs to the profile just left, and `KEY()`
       now answers with a different name - so without this the next save
       would write the old board straight over the new profile's own. The
       page reload below makes it moot in normal use, but the swap has to
       be coherent on its own, not merely survivable because of what
       happens next. */
    try { Store.reload(); } catch (e) { /* nothing read yet, then */ }

    if (opts && opts.quiet) return { sent: sent };
    location.reload();
    return { sent: sent };
  }

  /* ---------- forgetting ---------- */

  /**
   * Take a profile off this device.
   *
   * Every entry is overwritten with noise of its own size a few times
   * before it is removed. **Be careful what you claim for that.** The
   * browser keeps this in a log-structured database: writing a key again
   * appends a new record, it does not overwrite the old one, and the old
   * value stays in the file until the database compacts — and these are
   * SSDs, which remap blocks internally, so even a tool that could
   * overwrite the file cannot be sure it overwrote the flash. The
   * overwriting here raises the cost of casual recovery and nothing more.
   * It is not a shredder and the interface must not call it one.
   *
   * What genuinely protects a drive you are giving away is the drive:
   * full-disk encryption from the start, then a reset that discards the
   * key, or the manufacturer's secure erase.
   *
   * @param {Function} [onStep]  told (done, total, what) as it goes
   */
  async function forget(id, onStep) {
    if (id === MAIN) return { ok: false, why: 'The first profile cannot be removed.' };
    if (id === active()) return { ok: false, why: 'Switch to another profile first.' };
    if (!reg.list.some(p => p.id === id)) return { ok: false, why: 'No such profile.' };

    const names = OWNED.map(b => keyFor(id, b));
    const total = names.length;
    let done = 0;

    for (const name of names) {
      let had = null;
      try { had = localStorage.getItem(name); } catch (e) { had = null; }
      if (had !== null) {
        for (let pass = 0; pass < 3; pass++) {
          try { localStorage.setItem(name, noise(had.length)); } catch (e) { break; }
        }
      }
      try { localStorage.removeItem(name); } catch (e) { /* gone or unreachable */ }
      done++;
      if (onStep) { try { onStep(done, total, name); } catch (e) { /* never mind */ } }
      await wait(0);   // let the progress be seen rather than jumping to the end
    }

    reg.list = reg.list.filter(p => p.id !== id);
    save();
    return { ok: true, cleared: done };
  }

  /** Random printable filler the size of what was there. */
  function noise(n) {
    const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    const len = Math.max(32, Math.min(n, 200000));
    const r = (window.crypto && window.crypto.getRandomValues)
      ? window.crypto.getRandomValues(new Uint8Array(len)) : null;
    for (let i = 0; i < len; i++) {
      s += C[(r ? r[i] : Math.floor(Math.random() * 256)) % C.length];
    }
    return s;
  }

  /** Whether a profile has ever been written to on this device. */
  function used(id) {
    try { return localStorage.getItem(keyFor(id, 'state.v1')) !== null; }
    catch (e) { return false; }
  }

  return { key, keyFor, active, list, nameOf, isMain, add, rename, switchTo, forget, used,
           locks, setLocks, isLocked, OWNED, MAIN };
})();
