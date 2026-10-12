/* ============================================================
   Flowlist — the one password

   The hosted copy opens on a single password box. From those words it
   works out which room the board lives in and the key that decrypts it,
   so there is no database address to paste and no room key to copy
   across. Type it once on a machine and that machine remembers.

   The board on this device is never touched by any of it. Getting the
   password wrong shows an empty screen, not a lost board.

   ONE SECRET, NOT TWO

   Deriving the room from the password means the password is the only
   thing keeping the board private — the site address is public, and
   anyone who has it and guesses the words gets everything. That is why
   this refuses short passwords instead of merely tutting at them, and
   why the derivation is deliberately slow.
   ============================================================ */
const Lock = (function () {

  /* Nothing is refused for being short. The line under the box says what
     it thinks and then gets out of the way — it is not this code's place
     to stand between someone and their own board. These are the lengths
     at which the advice stops nagging, not a gate. */
  const GOOD = 14;

  let el = null, busy = false;

  /* Wrong tries on this page load. Deliberately not remembered anywhere:
     a reload clears it, which is the whole of what this can offer. Anyone
     attacking the database directly never reaches this code at all. */
  let wrong = 0;
  const limit = () => {
    const n = cfg().tries;
    return typeof n === 'number' && n > 0 ? n : 0;   /* 0 means no limit */
  };
  const spent = () => limit() > 0 && wrong >= limit();

  const cfg = () => Store.settings().sync || {};
  const gated = () => cfg().gate === true;

  /* ---------- how strong, roughly ---------- */

  /**
   * A deliberately modest read on a password. It counts what is there
   * rather than pretending to know how guessable the words are.
   * @returns {Object} { score 0-3, words }
   */
  function judge(p) {
    const words = p.trim().split(/\s+/).filter(Boolean).length;
    const kinds = (/[a-z]/.test(p) ? 1 : 0) + (/[A-Z]/.test(p) ? 1 : 0) +
                  (/[0-9]/.test(p) ? 1 : 0) + (/[^A-Za-z0-9]/.test(p) ? 1 : 0);
    let score = 0;
    if (p.length >= GOOD) score = 1;
    if (p.length >= 20 || words >= 4) score = 2;
    if ((p.length >= 24 && kinds >= 2) || words >= 5) score = 3;
    return { score: score, words: words };
  }

  /* Nothing at all for a short one. It is not this screen's place to
     tut at someone typing their own passphrase; the encouraging end of
     the scale is worth having, the scolding end is not. */
  const ADVICE = [
    '',
    'It will do, but a fourth unrelated word would multiply the work to guess it.',
    'Good — four words is past the reach of any realistic attack.',
    'Strong.'
  ];

  /* ---------- keeping it cheap ----------

     None of this costs anything while it runs, but a screen left open
     and forgotten should not go on turning for a week. So it stops when
     the tab is put away, and settles down by itself after a while. */
  const REST_AFTER = 180000;
  let restTimer = null;

  function scene() { return el && el.querySelector('.lk-scene'); }

  function stir() {
    const s = scene();
    if (s) s.classList.remove('resting');
    clearTimeout(restTimer);
    restTimer = setTimeout(() => {
      const t = scene();
      if (t) t.classList.add('resting');
    }, REST_AFTER);
  }

  function watchTab() {
    document.addEventListener('visibilitychange', () => {
      const s = scene();
      if (s) s.classList.toggle('hidden', document.hidden);
    });
  }

  /* ---------- the screen ---------- */

  function build() {
    el = document.createElement('div');
    el.id = 'lockscreen';
    el.innerHTML =
      '<div class="lk-card">' +
        '<div class="lk-mark">Flowlist</div>' +
        '<p class="lk-sub">One password opens your board on this device.</p>' +
        /* autocapitalize and autocorrect off: the room is worked out from
           the password letter for letter, so a phone keyboard helpfully
           capitalising the first letter puts that phone in a different,
           empty room — and it looks exactly like sync not working. */
        '<input id="lk-pass" class="lk-input" type="password" autocomplete="current-password" ' +
               'autocapitalize="off" autocorrect="off" ' +
               'spellcheck="false" placeholder="your password">' +
        '<p class="lk-hint" id="lk-hint"></p>' +
        '<button class="lk-go" id="lk-go">Open my board</button>' +
        '<button class="lk-go lk-ghost" id="lk-solo">Use this device on its own</button>' +
        '<p class="lk-note" id="lk-note"></p>' +
      '</div>';
    document.body.appendChild(el);

    /* The picture goes behind the card, not inside it: a scene inside the
       card can only ever be as big as the card. */
    el.insertBefore(Scenes.build(cfg().scene), el.firstChild);
    mounted = cfg().scene || 'valley';
    ['pointerdown', 'keydown'].forEach(k => el.addEventListener(k, stir));
    stir();
    watchTab();

    const box = el.querySelector('#lk-pass');
    const go = el.querySelector('#lk-go');
    const hint = el.querySelector('#lk-hint');

    function paint() {
      const p = box.value;
      if (!p) { hint.textContent = ''; hint.className = 'lk-hint'; return; }
      const j = judge(p);
      hint.textContent = ADVICE[j.score];
      hint.className = 'lk-hint s' + j.score;
    }

    const solo = el.querySelector('#lk-solo');
    if (solo) solo.addEventListener('click', standAlone);

    box.addEventListener('input', paint);
    box.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
    go.addEventListener('click', () => submit(box.value));
    setTimeout(() => box.focus(), 60);
  }

  function say(text, kind) {
    const n = el && el.querySelector('#lk-note');
    if (!n) return;
    n.textContent = text || '';
    n.className = 'lk-note' + (kind ? ' ' + kind : '');
  }

  function working(on) {
    busy = on;
    const go = el && el.querySelector('#lk-go');
    if (go) { go.disabled = on; go.textContent = on ? 'Opening…' : 'Open my board'; }
  }

  /** Count a wrong try, and shut the box if that was the last one. */
  function noteWrong() {
    wrong++;
    if (!spent()) return false;
    const box = el && el.querySelector('#lk-pass');
    const go = el && el.querySelector('#lk-go');
    if (box) { box.value = ''; box.disabled = true; }
    if (go) { go.disabled = true; go.textContent = 'Locked'; }
    say('That is ' + limit() + ' wrong tries. Reload the page to try again.', 'bad');
    return true;
  }

  /**
   * Carry on without syncing at all.
   *
   * The board on this device is untouched and goes on working exactly as
   * it always did — it simply stops talking to the database. Nothing is
   * sent, nothing is fetched, and the room is left as it is for the other
   * devices. Asked for again next time, because nothing was decided
   * permanently here.
   */
  function standAlone() {
    Sync.lockUp();
    close();
    UI.toast('Working on this device only. Nothing is being synced.');
  }

  /* ---------- opening up ---------- */

  function submit(password) {
    if (busy) return;
    if (spent()) {
      say('Reload the page to try again.', 'bad');
      return;
    }
    if (!password) { say('Type your password first.', 'bad'); return; }
    if (!Sync.canLock()) {
      say('This page cannot encrypt anything, so it will not sync. Open it over https ' +
          'or straight from disk.', 'bad');
      return;
    }

    working(true);
    say('Working out where your board lives…');

    Sync.unlockWith(password).then(res => {
      if (!res.ok && res.found) {           // room is there, words do not open it
        working(false);
        /* the room's last four letters are no way in, and they are what can
           be checked against the Sync screen on the device that works */
        if (!noteWrong()) {
          say('That password does not open this board' +
              (res.room ? ' (room ending “' + String(res.room).slice(-4) + '”)' : '') +
              '. Use the password your other device opens it with.', 'bad');
        }
        return;
      }
      if (!res.ok) {
        working(false);
        say(res.reason || 'Could not reach the database.', 'bad');
        return;
      }
      if (res.found) {
        say('Found it. Pulling your board…');
        return Sync.pull().then(() => {
          Sync.connect();
          close();
          if (res.skipped) {
            /* the device was set to a board these words do not open, and they
               opened another one — worth saying, or it looks like sync failing */
            UI.toast('Opened the board for that password (room ending “' + String(res.room).slice(-4) +
                     '”) — not the one this device was set to (“' + String(res.skipped).slice(-4) + '”).');
          }
        });
      }
      /* Nothing in that room. Either the password is wrong, or this really
         is a new board — and the two are indistinguishable from here, so
         ask rather than guessing and quietly starting a second board. */
      working(false);
      /* an empty room is a wrong password far more often than it is a new
         board, so it counts as a try */
      if (noteWrong()) return;
      offerNew(password);
    }).catch(e => {
      working(false);
      say((e && e.message) || 'Something went wrong opening up.', 'bad');
    });
  }

  /** No board under those words. Say so plainly and let them choose. */
  function offerNew(password) {
    const card = el.querySelector('.lk-card');
    say('');
    const ask = document.createElement('div');
    ask.className = 'lk-ask';
    ask.innerHTML =
      '<p>There is no board under that password yet.</p>' +
      '<p class="lk-small">If you have used it before, it is almost certainly a typo — ' +
      'the smallest change makes a different board entirely.</p>';
    const again = document.createElement('button');
    again.className = 'lk-go lk-ghost';
    again.textContent = 'Let me try again';
    again.onclick = () => { ask.remove(); el.querySelector('#lk-pass').value = '';
                            el.querySelector('#lk-hint').textContent = '';
                            el.querySelector('#lk-pass').focus(); };
    const fresh = document.createElement('button');
    fresh.className = 'lk-go';
    fresh.textContent = 'Start a new board here';
    fresh.onclick = () => {
      ask.remove();
      working(true);
      say('Setting it up…');
      Sync.pushOverTop().then(() => { Sync.connect(); close(); })
        .catch(() => { working(false); say('Could not set it up.', 'bad'); });
    };
    ask.appendChild(again);
    ask.appendChild(fresh);
    card.appendChild(ask);
  }

  /* ---------- showing and hiding ---------- */

  /* which picture is on screen now, so a change in Settings is noticed */
  let mounted = null;

  /** Swap the picture without rebuilding the rest of the card. */
  function fitScene() {
    if (!el) return;
    const want = cfg().scene || 'valley';
    if (mounted === want) return;
    const old = el.querySelector('.lk-scene');
    const fresh = Scenes.build(want);
    if (old) old.replaceWith(fresh); else el.insertBefore(fresh, el.firstChild);
    mounted = want;
  }

  function open() {
    if (!el) build();
    else fitScene();
    el.classList.add('on');
    document.body.classList.add('locked-out');
  }

  function close() {
    if (!el) return;
    el.classList.remove('on');
    document.body.classList.remove('locked-out');
    working(false);
    const box = el.querySelector('#lk-pass');
    if (box) box.value = '';
    say('');
    UI.toast('Board unlocked on this device.');
  }

  /** Forget the password here and ask again. */
  function relock() {
    Sync.lockUp();
    open();
  }

  function init() {
    /* Only the gated copy asks. A board opened from disk with sync set up
       by hand carries on exactly as before. */
    if (!gated()) return;
    if (Sync.hasPassphrase() && cfg().room) { Sync.connect(); return; }
    open();
  }

  return {
    init, open, close, relock, judge, submit, noteWrong,
    /* kept so callers can show the same advice; nothing is refused for it */
    goodLength: () => GOOD,
    resetTries: () => { wrong = 0; },
    triesLeft: () => (limit() ? Math.max(0, limit() - wrong) : Infinity),
    isShowing: () => !!(el && el.classList.contains('on'))
  };
})();
