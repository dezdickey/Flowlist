/* ============================================================
   Flowlist — Confetti
   A short burst when the last thing in Do Today gets ticked off.
   Its own canvas, above the board, so it lands on top of the UI
   rather than behind it like the ambient layer.
   ============================================================ */
const Confetti = (function () {
  const canvas = document.getElementById('fx-confetti');
  const ctx = canvas.getContext('2d');

  let bits = [];
  let raf = null;
  let armed = false;      // was Today already finished last time we looked?

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Theme accents, plus whatever colours the user's own categories carry. */
  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const out = [cs.getPropertyValue('--accent').trim(), cs.getPropertyValue('--accent-2').trim()];
    Store.get().lists.slice(0, 5).forEach(l => { if (l.color) out.push(l.color); });
    return out.filter(Boolean);
  }

  /** Where to burst from: the Today dock if it is open, else the middle. */
  function origin() {
    const dock = document.getElementById('panel-today');
    if (dock && dock.classList.contains('open') && dock.offsetWidth > 0) {
      const r = dock.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(200, r.height * 0.35) };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight * 0.32 };
  }

  function burst() {
    size();
    const o = origin();
    const cols = palette();
    const n = 90;
    bits = [];
    for (let i = 0; i < n; i++) {
      const a = (-Math.PI / 2) + (Math.random() - 0.5) * 2.1;
      const sp = 240 + Math.random() * 460;
      bits.push({
        x: o.x + (Math.random() - 0.5) * 40,
        y: o.y + (Math.random() - 0.5) * 20,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        w: 5 + Math.random() * 6,
        h: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        color: cols[(Math.random() * cols.length) | 0],
        life: 1
      });
    }
    canvas.classList.add('on');
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
  }

  let last = 0;
  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);

    let alive = 0;
    for (const b of bits) {
      if (b.life <= 0) continue;
      b.vy += 1150 * dt;             // gravity
      b.vx *= 0.995;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.y > H + 40) { b.life = 0; continue; }
      b.life -= dt * 0.34;
      alive++;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, b.life));
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      // the flat spin reads as a tumbling paper scrap
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.rot * 1.6)) + 1);
      ctx.restore();
    }

    if (alive > 0) { raf = requestAnimationFrame(step); }
    else { stop(); }
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    bits = [];
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    canvas.classList.remove('on');
  }

  /** Fires on the transition from "something left" to "all done". */
  function check() {
    const s = Store.get();
    const items = s.today
      .map(t => Store.itemById(t.listId, t.itemId))
      .filter(Boolean);
    const finished = items.length > 0 && items.every(i => i.done);

    if (finished && !armed && Store.settings().fxConfetti !== false) burst();
    armed = finished;
  }

  function init() {
    Store.on('today', check);
    Store.on('board', check);
    Store.on('lists', check);
    window.addEventListener('resize', () => { if (raf) size(); });
    // start armed so opening the page on an already-finished list stays quiet;
    // this call only ever disarms, never fires
    armed = true;
    check();
  }

  return { init, burst, stop, isRunning: () => !!raf, count: () => bits.length };
})();
