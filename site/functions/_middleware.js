/* ============================================================
   The front door.

   Cloudflare runs this before it serves anything in this folder, so a
   stranger with the link never reaches the app at all — not the page,
   not the scripts, not the address of the database inside them.

   WHY THIS IS AT THE SERVER AND NOT IN THE PAGE

   A password the page checks in JavaScript is not a lock, because the
   page is the thing being guarded: anyone can read the check, skip it,
   or go straight to the database it points at. This runs before a byte
   of the app is sent, which is the only place a gate is worth anything.

   TWO LOCKS, NOT ONE

   This is a separate gate from the passphrase that decrypts the board.
   This one keeps people off the doorstep; the passphrase keeps them out
   of the notes. They must not be the same words — this password is kept
   by Cloudflare, and giving Cloudflare the passphrase would hand one
   company both halves of the thing that keeps the notes private.

   ASKED FOR ONCE, NOT EVERY TIME

   A correct password hands back a small signed note saying "this
   browser was let in, until this date". The note carries no password
   and cannot be forged without one, because it is signed with the
   password itself. Change SITE_PASSWORD and every note ever issued
   stops working, everywhere, at once.

   THE PASSWORD LIVES IN CLOUDFLARE, NOT IN THIS FILE

   It is read from an environment variable called SITE_PASSWORD, set in
   the Pages dashboard and marked as a secret. Nothing here and nothing
   in the repository ever holds it. If the variable is missing the site
   refuses to serve rather than falling open, because a gate that
   quietly stops working is worse than no gate at all.
   ============================================================ */

/* ============================================================
   HOW MANY TRIES, AND HOW OFTEN

   A password guessed at a server can only be guessed as fast as the
   server will answer, which is the whole reason a four-digit bank PIN
   is safe and a four-digit file password is not. Two tries per address
   per 900 hours is severe on purpose: to keep the global count below
   busy someone would need on the order of ninety thousand addresses.

   The cost is that two slips of the thumb shut you out from that
   network for five weeks. Two ways back in: the count is kept per
   address, so a phone switching to mobile data starts fresh, and the
   entry can be deleted in the Cloudflare dashboard. Both numbers can be
   changed there too, without touching this file.

   Both numbers can be changed without touching this file — set
   GATE_TRIES and GATE_WINDOW_MINUTES in the Pages settings.

   The count is kept in a Cloudflare KV namespace bound as GATE_KV. If
   that binding is missing the limit cannot be enforced properly, so it
   falls back to making every wrong answer slow — weaker, because an
   attacker can ask many times at once, but far better than nothing.

   If KV is bound but failing, this refuses rather than waving people
   through: a limiter that can be switched off by breaking it is not a
   limiter.
   ============================================================ */
/**
 * "3 minutes", "6 hours", "37 days" — whichever reads as a length of
 * time rather than a number. Nobody can picture 54,000 minutes.
 */
function waitText(seconds) {
  if (seconds < 90) return Math.max(1, Math.round(seconds)) + ' seconds';
  const mins = Math.ceil(seconds / 60);
  if (mins < 90) return mins + (mins === 1 ? ' minute' : ' minutes');
  const hours = Math.ceil(mins / 60);
  if (hours < 48) return hours + (hours === 1 ? ' hour' : ' hours');
  const days = Math.ceil(hours / 24);
  return days + (days === 1 ? ' day' : ' days');
}

/** A whole number from the settings, or the default if it is missing or daft. */
function setting(env, name, dflt) {
  const n = Number(env && env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : dflt;
}
const TRIES = 2;
const WINDOW_MINUTES = 54000;           // 900 hours — about five and a half weeks
const GLOBAL_TRIES = 200;               // across everyone, so rotating addresses cannot help
const GLOBAL_WINDOW_MINUTES = 60;
const SLOW_MS = 1500;          // the fallback when there is no KV to count in

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Who is asking. Cloudflare sets this and a client cannot forge it. */
function who(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

/**
 * @returns {Promise<Object>} { allowed, waitSeconds, counted }
 *   counted=false means there was no KV to count in and the caller
 *   should fall back to being slow instead.
 */
/* ---------- two counts, not one ----------

   The per-address count stops one attacker. It does not stop someone
   asking from a thousand addresses, which is cheap to arrange.

   So there is a second count across everyone. It is deliberately much
   looser than the per-address one, because a tight global count would
   be a switch any stranger could flip: five wrong passwords a day and
   the owner could never log in again. Loose enough that nobody can shut
   you out on a whim, tight enough that mass guessing dies.

   A pass already held bypasses both, so even someone flooding the door
   cannot lock out a device you have already set up.

   One honest limit: KV is eventually consistent, so the global count
   can run over before it has caught up across the world. It is a brake,
   not a gate. The per-address count is the exact one. */

async function readCount(kv, key) {
  const raw = await kv.get(key);
  return raw ? JSON.parse(raw) : null;
}

function overLimit(rec, windowMs, tries, now) {
  return !!(rec && now - rec.since < windowMs && rec.n >= tries);
}

/**
 * @returns {Promise<Object>} { allowed, waitSeconds, counted, why }
 *   counted=false means there was no KV to count in and the caller
 *   should fall back to being slow instead.
 */
/**
 *  {Boolean} [globalOnly]  skip the per-address count. Used by the
 *   way back in, which has to work precisely when that count is the
 *   thing blocking you — but must still be capped by the shared one, or
 *   the reset key could be guessed at full speed.
 */
async function tooMany(env, request, globalOnly) {
  const kv = env.GATE_KV;
  if (!kv) return { allowed: true, counted: false };

  const mineMs = setting(env, 'GATE_WINDOW_MINUTES', WINDOW_MINUTES) * 60000;
  const mineTries = setting(env, 'GATE_TRIES', TRIES);
  const allMs = setting(env, 'GATE_GLOBAL_WINDOW_MINUTES', GLOBAL_WINDOW_MINUTES) * 60000;
  const allTries = setting(env, 'GATE_GLOBAL_TRIES', GLOBAL_TRIES);

  let mine = null, all = null;
  try {
    mine = await readCount(kv, 'try:' + who(request));
    all = await readCount(kv, 'try:everyone');
  } catch (e) {
    // the count cannot be read, so it cannot be trusted; refuse
    return { allowed: false, waitSeconds: Math.ceil(mineMs / 1000), counted: true, why: 'mine' };
  }

  const now = Date.now();
  if (!globalOnly && overLimit(mine, mineMs, mineTries, now)) {
    return { allowed: false, counted: true, why: 'mine',
             waitSeconds: Math.ceil((mineMs - (now - mine.since)) / 1000) };
  }
  if (overLimit(all, allMs, allTries, now)) {
    return { allowed: false, counted: true, why: 'everyone',
             waitSeconds: Math.ceil((allMs - (now - all.since)) / 1000) };
  }
  return { allowed: true, counted: true };
}

async function bump(kv, key, windowMs) {
  const now = Date.now();
  let rec = null;
  try { rec = await readCount(kv, key); } catch (e) { rec = null; }
  if (!rec || now - rec.since >= windowMs) rec = { n: 0, since: now };
  rec.n++;
  try {
    await kv.put(key, JSON.stringify(rec), { expirationTtl: Math.ceil(windowMs / 1000) + 60 });
  } catch (e) { /* nothing more to be done; the wait still applies */ }
}

async function countWrong(env, request) {
  const kv = env.GATE_KV;
  if (!kv) return;
  await bump(kv, 'try:' + who(request),
             setting(env, 'GATE_WINDOW_MINUTES', WINDOW_MINUTES) * 60000);
  await bump(kv, 'try:everyone',
             setting(env, 'GATE_GLOBAL_WINDOW_MINUTES', GLOBAL_WINDOW_MINUTES) * 60000);
}

/**
 * Getting in clears your own tally, so near-misses over weeks never add
 * up. The count across everyone is left alone: it is not yours to
 * clear, and letting a correct password wipe it would hand an attacker
 * who did guess right a way to cover the noise they made getting there.
 */
async function forgetWrong(env, request) {
  if (!env.GATE_KV) return;
  try { await env.GATE_KV.delete('try:' + who(request)); } catch (e) { /* ignore */ }
}

const COOKIE = 'fl_gate';
const DAYS = 90;
const FORM_PATH = '/__gate';

const enc = new TextEncoder();

/* ---------- little helpers ---------- */

/** Compare without leaking, through timing, how much of the guess was right. */
function sameSecret(a, b) {
  const x = enc.encode(a || '');
  const y = enc.encode(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function b64url(buf) {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Sign with the password itself, so no second secret has to be kept. */
async function sign(password, message) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/** "<expires>.<signature>" — no password in it, and useless once it lapses. */
async function makePass(password) {
  const until = String(Date.now() + DAYS * 86400000);
  return until + '.' + await sign(password, until);
}

async function passIsGood(password, value) {
  if (!value) return false;
  const dot = value.lastIndexOf('.');
  if (dot < 1) return false;
  const until = value.slice(0, dot);
  const mark = value.slice(dot + 1);
  if (!/^\d+$/.test(until)) return false;
  if (Number(until) < Date.now()) return false;              // lapsed
  return sameSecret(mark, await sign(password, until));      // and not forged
}

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

const guard = {
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

/* ---------- the way back in ----------

   A 900-hour lockout needs an escape that does not involve finding a
   computer and logging into a dashboard. Set GATE_RESET_KEY in the
   Pages settings to a long random string and keep it somewhere safe —
   a password manager, a note in your wallet. Visiting

       https://your-site.pages.dev/__gate?reset=THAT-STRING

   clears the count for whatever address you are asking from, and
   nothing else. It does not let anyone in and it does not touch the
   count across everyone.

   Guessing the reset key is itself counted as a wrong try, so it is no
   easier to attack than the password, and it is capped by the global
   count either way. If the setting is missing this simply does not
   exist, which is the right default. */
async function tryReset(env, request, url) {
  const key = env.GATE_RESET_KEY;
  const given = url.searchParams.get('reset');
  if (!key || given === null) return null;          // not a reset attempt at all

  /* capped by the shared count, but not by your own — your own is the
     very thing this is here to clear */
  const gate = await tooMany(env, request, true);
  if (!gate.allowed) return showLogin(false, gate.waitSeconds);

  if (!sameSecret(given, key)) {
    await countWrong(env, request);                 // guessing this is guessing
    if (!gate.counted) await sleep(SLOW_MS);
    return showLogin(true);
  }
  if (env.GATE_KV) {
    try { await env.GATE_KV.delete('try:' + who(request)); } catch (e) { /* ignore */ }
  }
  return new Response(unlockedPage(), {
    status: 200,
    headers: Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, guard)
  });
}

/* ---------- the door ---------- */

/**
 * The only page an uninvited visitor ever sees. It says nothing about
 * what is behind it, carries no app code, and reaches for nothing
 * outside itself.
 */
/** Shown after a reset. Says what happened and nothing about the password. */
function unlockedPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Flowlist</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#0b1020; color:#e8edf7; padding:24px;
         font:15px/1.6 "Segoe UI",-apple-system,Roboto,sans-serif; }
  .card { width:100%; max-width:340px; text-align:center;
          background:#141b2e; border:1px solid #23304d; border-radius:16px;
          padding:28px 24px; box-shadow:0 18px 50px rgba(0,0,0,.45); }
  h1 { margin:0; font-size:30px; letter-spacing:.5px; }
  p { margin:10px 0 0; color:#93a1bd; font-size:13px; }
  a { display:block; margin-top:18px; padding:12px 16px; font-size:15px;
      font-weight:600; color:#fff; background:#6c8cff; border-radius:10px;
      text-decoration:none; }
</style></head>
<body><div class="card">
  <h1>Flowlist</h1>
  <p>The wait has been cleared for this connection. You can try the password again.</p>
  <a href="/">Back to the password</a>
</div></body></html>`;
}

function loginPage(wrong, waitSeconds) {
  /* minutes, because "wait 53,900 seconds" is not a helpful thing to read */

  const note = waitSeconds
    ? '<p class="err">Too many tries. Wait ' + waitText(waitSeconds) + '.</p>'
    : (wrong
      ? '<p class="err">That is not the password.</p>'
      : '<p class="sub">This page is private.</p>');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Flowlist</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#0b1020; color:#e8edf7; padding:24px;
         font:15px/1.6 "Segoe UI",-apple-system,Roboto,sans-serif; }
  form { width:100%; max-width:340px; text-align:center;
         background:#141b2e; border:1px solid #23304d; border-radius:16px;
         padding:28px 24px; box-shadow:0 18px 50px rgba(0,0,0,.45); }
  h1 { margin:0; font-size:30px; letter-spacing:.5px; }
  .sub { margin:6px 0 18px; color:#93a1bd; font-size:13px; }
  .err { margin:6px 0 18px; color:#e0776b; font-size:13px; }
  input { width:100%; box-sizing:border-box; padding:12px 14px; font-size:16px;
          color:#e8edf7; background:#0b1020; border:1px solid #23304d;
          border-radius:10px; outline:none; }
  input:focus { border-color:#6c8cff; }
  button { width:100%; margin-top:14px; padding:12px 16px; font-size:15px;
           font-weight:600; color:#fff; background:#6c8cff; border:0;
           border-radius:10px; cursor:pointer; }
</style></head>
<body>
  <form method="POST" action="${FORM_PATH}">
    <h1>Flowlist</h1>
    ${note}
    <input type="password" name="p" autocomplete="current-password"
           autofocus placeholder="site password" aria-label="Site password">
    <button type="submit">Continue</button>
  </form>
</body></html>`;
}

function showLogin(wrong, waitSeconds) {
  return new Response(loginPage(wrong, waitSeconds), {
    /* 401 either way, so robots and caches treat it as what it is; 429
       when the limiter is the reason, so it is honest about why */
    status: waitSeconds ? 429 : 401,
    headers: Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, guard)
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const expected = env.SITE_PASSWORD;
  const url = new URL(request.url);

  // no password configured means the gate is not working; do not serve
  if (!expected) {
    return new Response(
      'This site has no SITE_PASSWORD set, so it will not open. Set it in the ' +
      'Cloudflare Pages settings and deploy again.',
      { status: 503, headers: Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, guard) }
    );
  }

  /* someone using the way back in */
  if (request.method === 'GET' && url.pathname === FORM_PATH) {
    const undone = await tryReset(env, request, url);
    if (undone) return undone;
  }

  /* someone submitting the form */
  if (request.method === 'POST' && url.pathname === FORM_PATH) {
    /* how many have they had already? */
    const gate = await tooMany(env, request);
    if (!gate.allowed) return showLogin(false, gate.waitSeconds);

    let given = '';
    try {
      const form = await request.formData();
      given = String(form.get('p') || '');
    } catch (e) { given = ''; }

    if (!sameSecret(given, expected)) {
      await countWrong(env, request);
      /* with nowhere to count, being slow is the only brake there is */
      if (!gate.counted) await sleep(SLOW_MS);
      return showLogin(true);
    }
    await forgetWrong(env, request);

    const headers = new Headers(Object.assign({ Location: '/' }, guard));
    /* HttpOnly so no script can read it, Secure so it never leaves over
       plain http, Strict so another site cannot ride on it */
    headers.append('Set-Cookie',
      COOKIE + '=' + await makePass(expected) +
      '; Path=/; Max-Age=' + (DAYS * 86400) +
      '; HttpOnly; Secure; SameSite=Strict');
    return new Response(null, { status: 303, headers });
  }

  /* already let in on this browser? */
  if (!await passIsGood(expected, readCookie(request, COOKIE))) return showLogin(false);

  const res = await next();
  const out = new Response(res.body, res);
  Object.keys(guard).forEach(k => out.headers.set(k, guard[k]));
  return out;
}
