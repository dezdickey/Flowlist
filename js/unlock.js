/* ============================================================
   Flowlist — opening a sealed board

   A profile whose key lives on a stick comes up shut: the board on disk is
   ciphertext and there is nothing on this machine that opens it. This is
   the screen that asks.

   It tries the quiet way first. If the stick is plugged in and this page
   was given leave to read the key file before, it reads it and opens
   without asking anything — which is the whole point, since typing a
   password every day was the thing being avoided. Only when that fails
   does it put anything on screen.

   The browser cannot watch for a drive being plugged in, so "plug it in
   and it opens" is a button rather than magic. Saying otherwise would be
   promising something no web page can do.
   ============================================================ */
const Unlock = (function () {
  let el = null;
  let busy = false;

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'unlock';
    el.className = 'unlock';
    el.innerHTML =
      '<div class="unlock-card">' +
        '<div class="unlock-head">' +
          '<h2 class="unlock-title"></h2>' +
          '<p class="unlock-sub">This board is kept locked. Its key is on a drive, not on this machine.</p>' +
        '</div>' +
        '<div class="unlock-acts">' +
          '<button class="set-btn unlock-stick">Open with the key on the drive</button>' +
          '<button class="txt-btn unlock-words-show">Use the backup passphrase instead</button>' +
        '</div>' +
        '<div class="unlock-words is-hidden">' +
          '<input type="password" class="set-input unlock-input" placeholder="The backup passphrase" autocomplete="off" spellcheck="false">' +
          '<button class="set-btn unlock-words-go">Open it</button>' +
        '</div>' +
        '<p class="unlock-say"></p>' +
        '<button class="txt-btn unlock-leave">Go back to the other board</button>' +
      '</div>';
    document.body.appendChild(el);

    el.querySelector('.unlock-stick').onclick = () => withStick(true);
    el.querySelector('.unlock-words-show').onclick = () => {
      el.querySelector('.unlock-words').classList.remove('is-hidden');
      el.querySelector('.unlock-words-show').classList.add('is-hidden');
      el.querySelector('.unlock-input').focus();
    };
    el.querySelector('.unlock-words-go').onclick = withWords;
    el.querySelector('.unlock-input').onkeydown = e => { if (e.key === 'Enter') withWords(); };
    el.querySelector('.unlock-leave').onclick = () => Profiles.switchTo(Profiles.MAIN);
    return el;
  }

  const say = msg => { const p = el && el.querySelector('.unlock-say'); if (p) p.textContent = msg || ''; };

  function show() {
    build();
    el.querySelector('.unlock-title').textContent = Profiles.nameOf();
    el.classList.add('on');
  }
  function hide() { if (el) el.classList.remove('on'); }

  /** Hand the data key to the store, and say so if it was the wrong one. */
  async function tryKey(dataKey, what) {
    const ok = await Store.unlockWith(dataKey);
    if (!ok) { say('That ' + what + ' does not open this board.'); return false; }
    hide();
    UI.toast('Open.');
    return true;
  }

  /**
   * @param {Boolean} asked  true when a button was pressed, which is when
   *        the browser will let us put a file picker up
   */
  async function withStick(asked) {
    if (busy) return;
    busy = true;
    try {
      const id = Profiles.active();
      const locks = Profiles.locks(id);
      if (!locks) { busy = false; return false; }

      /* the quiet way: a handle we were given before, if the drive is there */
      let text = await KeyFile.readRemembered(id);
      if (!text && asked) text = await KeyFile.askPermission(id);

      /* otherwise ask which file, which needs a click behind it */
      if (!text && asked) {
        say('Choose the key file on the drive.');
        try {
          const [h] = await window.showOpenFilePicker({
            multiple: false,
            types: [{ description: 'Flowlist key', accept: { 'application/json': ['.key', '.json'] } }]
          });
          await KeyFile.remember(id, h);
          text = await (await h.getFile()).text();
        } catch (e) { say('No file chosen.'); busy = false; return false; }
      }
      if (!text) { busy = false; return false; }

      let dataKey = null;
      try { dataKey = await KeyFile.openWithFile(locks, text); }
      catch (e) { say('That key does not open this board.'); busy = false; return false; }
      const done = await tryKey(dataKey, 'key');
      busy = false;
      return done;
    } catch (e) { busy = false; say('That did not work.'); return false; }
  }

  async function withWords() {
    if (busy) return;
    const input = el.querySelector('.unlock-input');
    const words = input.value;
    if (!words) { say('Type the backup passphrase.'); return; }
    busy = true;
    say('Working…');
    try {
      const locks = Profiles.locks(Profiles.active());
      let dataKey = null;
      try { dataKey = await KeyFile.openWithPass(locks, words); }
      catch (e) { say('Those are not the words.'); busy = false; return; }
      input.value = '';
      await tryKey(dataKey, 'passphrase');
    } finally { busy = false; }
  }

  /**
   * Called once the app is up. If this profile is sealed and shut, try the
   * quiet way, and only put the screen up if that does not work.
   */
  async function init() {
    if (!Store.isShut()) return;
    show();
    say('Looking for the key…');
    const opened = await withStick(false);
    if (!opened) say('');
  }

  return { init, show, hide, withStick };
})();
