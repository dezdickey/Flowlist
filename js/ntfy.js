/* ============================================================
   Flowlist — phone notifications through ntfy

   Every Do Today item can carry an hour. This watches the clock and
   pushes one notification per item, a set number of minutes before
   that hour comes round — so the phone in your pocket hears about the
   10 PM call at 9:30, and four things at 10 PM arrive as four separate
   notifications rather than one lump.

   No account anywhere. ntfy delivers to whoever is subscribed to a
   topic word, which is why the generated topic is long and odd:
   anyone who knows it can push to you.

   Publishing uses ntfy's JSON form — a POST to the server root with
   the topic in the body. That keeps it a "simple" request as far as
   CORS is concerned, so there is no preflight to fail, and it carries
   UTF-8 properly, which header-based publishing does not.
   ============================================================ */
const Ntfy = (function () {

  const CHECK_MS = 20000;             // a minute's granularity is plenty
  const KEEP_MS = 36 * 3600 * 1000;   // how long an "already sent" mark is kept
  const NUDGE_MS = 1500;              // settle after an edit before looking again
  const AHEAD_MIN_MS = 60000;         // closer than this and it just goes now

  const PRIORITY = { low: 2, normal: 3, high: 4, urgent: 5 };

  let timer = null, nudgeTimer = null;
  const inflight = {};
  let status = { at: null, text: '', error: '', queued: 0 };

  const cfg = () => Store.settings().ntfy || {};
  const num = (v, dflt) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : dflt);

  /* ============================================================
     WORDING
     ============================================================ */

  /** The hour as it will read at the front of the message. */
  function hourText(h, fmt) {
    const h24 = h === 24 ? 0 : h;
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = (h24 % 12) === 0 ? 12 : h24 % 12;
    const two = n => (n < 10 ? '0' : '') + n;
    switch (fmt) {
      case '24':     return two(h24) + ':00';
      case 'clock':  return h12 + ':00 ' + suffix;
      case 'spaced': return h12 + ' ' + suffix;
      default:       return h12 + suffix.toLowerCase();     // 10pm
    }
  }

  /** "45 min", "1 hr", "1 hr 30 min" */
  function leadText(m) {
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return h + ' hr' + (r ? ' ' + r + ' min' : '');
  }

  /* The body is exactly the thing asked for: the hour it sits under,
     then the task. "10pm Call parents at 11 pm". */
  function messageFor(p, c) {
    return hourText(p.hour, (c || cfg()).timeFormat) + ' ' + (p.text || 'Untitled');
  }

  function headingFor(p, c) {
    c = c || cfg();
    switch (c.heading) {
      case 'none': return '';
      case 'app':  return 'Flowlist';
      case 'time': return hourText(p.hour, c.timeFormat);
      default:     return 'In ' + leadText(p.lead);   // 'left'
    }
  }

  /* ============================================================
     WHO SENDS

     Every device with the app open runs the same clock. Left alone,
     two of them would both notice the same reminder and the phone
     would buzz twice for one thing.

     So when the board is synced, one device does the sending. The
     first one to look takes it on; after that the others stand down
     and say who is doing it. With no sync there is only one clock, so
     the question does not arise.
     ============================================================ */
  const synced = () => (typeof Sync !== 'undefined') && Sync.isOn();
  const thisDevice = () => (typeof Sync !== 'undefined' ? Sync.deviceName() : '');

  function maySend() {
    if (!synced()) return true;
    const who = cfg().sender;
    if (!who) {                      // nobody has taken it on yet
      Store.mutate(s => { s.settings.ntfy.sender = thisDevice(); }, null, { silent: true });
      return true;
    }
    return who === thisDevice();
  }

  /** Take the job over. The other devices see it on their next merge. */
  function sendFromHere() {
    const me = thisDevice();
    Store.mutate(s => { s.settings.ntfy.sender = me; }, null, { silent: true });
    return me;
  }

  /* ============================================================
     WHAT IS DUE
     ============================================================ */

  /** The instant an hour slot actually means. The timeline calls midnight 24. */
  function targetFor(hour, now) {
    const d = new Date(now === undefined ? Date.now() : now);
    d.setHours(0, 0, 0, 0);
    d.setHours(hour, 0, 0, 0);      // setHours(24) rolls on to tonight's midnight
    return d.getTime();
  }

  /* Alert 0 is the main one and alert 1 the early heads-up, whichever
     way round their minutes happen to be set — so the keys stay put
     when you change the numbers, and nothing fires twice. */
  function alerts(c) {
    const out = [{ alert: 0, lead: num(c.lead, 30) }];
    if (c.alert2) out.push({ alert: 1, lead: num(c.lead2, 50) });
    return out;
  }

  /**
   * Everything that could still go out today, earliest first.
   * @returns {Array} { key, listId, itemId, text, hour, target, fire, lead, alert }
   */
  function plan(now) {
    now = now || Date.now();
    const c = cfg();
    const out = [];
    Store.get().today.forEach(t => {
      const item = Store.itemById(t.listId, t.itemId);
      if (!item || !item.hour) return;                      // nothing to hang a time on
      if (c.skipDone !== false && item.done) return;
      const target = targetFor(item.hour, now);
      alerts(c).forEach(a => {
        out.push({
          key: item.id + '|' + target + '|' + a.alert,
          listId: t.listId, itemId: item.id,
          text: item.text, hour: item.hour,
          target: target, fire: target - a.lead * 60000,
          lead: a.lead, alert: a.alert
        });
      });
    });
    out.sort((a, b) => a.fire - b.fire);
    return out;
  }

  const sentLog = () => cfg().sent || {};

  /** Ripe: the moment has come, and the hour has not yet arrived. */
  function due(now) {
    now = now || Date.now();
    const log = sentLog();
    return plan(now).filter(p => !log[p.key] && !inflight[p.key] && p.fire <= now && now < p.target);
  }

  /** The next one waiting, for the line in Settings. */
  function nextUp(now) {
    now = now || Date.now();
    const log = sentLog();
    return plan(now).filter(p => !log[p.key] && p.fire > now)[0] || null;
  }

  function mark(list) {
    if (!list.length) return;
    Store.mutate(s => {
      const log = s.settings.ntfy.sent;
      list.forEach(p => { log[p.key] = p.target; });
    }, null, { silent: true });
  }

  /** Marks age out along with the day they belonged to. */
  function prune(now) {
    const log = sentLog();
    const old = Object.keys(log).filter(k => (log[k] || 0) < now - KEEP_MS);
    if (!old.length) return;
    Store.mutate(s => { old.forEach(k => { delete s.settings.ntfy.sent[k]; }); }, null, { silent: true });
  }

  /* ============================================================
     SENDING
     ============================================================ */

  function post(body) {
    const c = cfg();
    const url = String(c.server || 'https://ntfy.sh').replace(/\/+$/, '') + '/';
    return fetch(url, { method: 'POST', body: JSON.stringify(body) })
      .then(r => {
        if (!r.ok) throw new Error('ntfy answered ' + r.status);
        return r;
      });
  }

  function payload(p, c, at) {
    c = c || cfg();
    const body = {
      topic: c.topic,
      message: messageFor(p, c),
      priority: PRIORITY[c.priority] || 3,
      tags: [p.alert ? 'hourglass_flowing_sand' : 'bell']
    };
    const head = headingFor(p, c);
    if (head) body.title = head;
    if (at) body.delay = String(Math.round(at / 1000));   // ntfy takes a unix second
    return body;
  }

  /**
   * @param {Object} p    a planned alert
   * @param {Number} [at] hand it to ntfy for this moment instead of sending now
   */
  function send(p, at) {
    const c = cfg();
    if (!c.topic) return Promise.resolve(false);
    inflight[p.key] = true;
    return post(payload(p, c, at))
      .then(() => {
        delete inflight[p.key];
        mark([p]);
        status = {
          at: Date.now(), text: messageFor(p, c), error: '',
          queued: at ? status.queued + 1 : status.queued
        };
        return true;
      })
      .catch(e => {
        // left unmarked on purpose: the next pass tries again, and a phone
        // that got a reminder late beats one that never got it at all
        delete inflight[p.key];
        status = {
          at: status.at, text: status.text,
          error: (e && e.message) || 'could not reach the server',
          queued: status.queued
        };
        return false;
      });
  }

  /**
   * One look at the clock.
   *
   * Anything ripe goes out, one notification per item. If the app sat
   * closed through both alerts for the same item only the later one is
   * sent — two buzzes in a row for one thing is just noise — and the
   * one that was missed is written off quietly.
   */
  function pass(now) {
    now = now || Date.now();
    const c = cfg();
    if (!c.on || !c.topic) return { sent: [], dropped: [], queued: [] };
    // another device is doing the sending; this one keeps the clock but stays quiet
    if (!maySend()) return { sent: [], dropped: [], queued: [], quiet: true };

    prune(now);

    const ripe = due(now);
    const best = {};
    ripe.forEach(p => { if (!best[p.itemId] || p.fire > best[p.itemId].fire) best[p.itemId] = p; });
    const going = ripe.filter(p => best[p.itemId] === p);
    const dropped = ripe.filter(p => best[p.itemId] !== p);
    mark(dropped);
    going.forEach(p => send(p));

    /* Handed over in advance, the phone still buzzes with the laptop shut.
       ntfy holds it and delivers on time. Nothing can call one back, which
       is why this waits to be asked for. */
    let queued = [];
    if (c.ahead) {
      const log = sentLog();
      queued = plan(now).filter(p => !log[p.key] && !inflight[p.key] && p.fire - now > AHEAD_MIN_MS);
      queued.forEach(p => send(p, p.fire));
    }
    return { sent: going, dropped: dropped, queued: queued };
  }

  /** The button in Settings. Uses a real item when there is one to use. */
  function sendTest(after) {
    const c = cfg();
    if (!c.topic) { UI.toast('Pick a topic word first.'); return Promise.resolve(false); }
    const real = nextUp() || plan()[0];
    const p = {
      hour: real ? real.hour : 22,
      text: real ? real.text : 'Call parents at 11 pm',
      lead: num(c.lead, 30), alert: 0
    };
    UI.toast('Sending a test…');
    return post(payload(p, c))
      .then(() => {
        status = { at: Date.now(), text: messageFor(p, c), error: '', queued: status.queued };
        UI.toast('Sent. Check your phone.');
        return true;
      })
      .catch(e => {
        status = {
          at: status.at, text: status.text,
          error: (e && e.message) || 'no answer', queued: status.queued
        };
        UI.toast('It did not go: ' + status.error);
        return false;
      })
      .then(okOrNot => { if (after) after(okOrNot); return okOrNot; });
  }

  /* Long and odd on purpose — a topic is a password in all but name. */
  function randomTopic() {
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 12; i++) out += abc.charAt(Math.floor(Math.random() * abc.length));
    return 'flowlist-' + out;
  }

  /* ============================================================
     RUNNING
     ============================================================ */
  function stop() { clearTimeout(nudgeTimer); clearInterval(timer); timer = null; }

  function start() {
    stop();
    timer = setInterval(function () { pass(); }, CHECK_MS);
    pass();
  }

  /** Editing Do Today should not have to wait out the interval. */
  function nudge() {
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(function () { pass(); }, NUDGE_MS);
  }

  function init() {
    Store.on('today', nudge);
    Store.on('settings', nudge);
    Store.on('*', nudge);
    start();
  }

  return {
    init, start, stop, pass, plan, due, nextUp, send, sendTest, randomTopic,
    maySend, sendFromHere, sender: () => cfg().sender,
    hourText, leadText, messageFor, headingFor, targetFor, payload,
    status: () => status
  };
})();
