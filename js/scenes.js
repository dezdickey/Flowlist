/* ============================================================
   Flowlist — the pictures behind the password

   Nine of them. Nothing here is clickable and nothing here means
   anything; they exist to be looked at while you type, and they are
   built for that and nothing else.

   Each one hands back a single element. The screen puts it on the page
   and takes it off again, and that is the whole contract.

   WHAT KEEPS THEM CHEAP

   Blur, glow, gradient and shadow cost a lot to draw once and nothing
   to keep, so they are used freely — on things that hold still.
   Movement is transform and opacity only, which the compositor carries
   on its own. And because every animated element becomes its own
   layer, movement is put on a few parents wherever it can be and the
   children ride along. A test holds each scene under forty of them.
   ============================================================ */
const Scenes = (function () {

  const LIST = [
    { key: 'valley', name: 'The valley', hint: 'Ridges fading into mist, and a sky that turns all night' }
  ];

  /* ---------- small helpers ---------- */

  const el = (cls, css) => {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    if (css) d.style.cssText = css;
    return d;
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pct = v => v.toFixed(2) + '%';

  /** A wash of shadow at the edges. Every scene ends with one. */
  function finish(sky) { sky.appendChild(el('lk-vig')); return sky; }

  /**
   * Stars, dealt into a few breathing groups.
   *
   * One animation per star would be one compositor layer per star —
   * seventy of them for a shimmer nobody could name. Six overlapping
   * rhythms look the same and cost six.
   */
  /** @param {Number} [groupCount]  how many layers the stars twinkle in, out of step with each other */
  function starfield(host, count, hue, groupCount) {
    const n = groupCount || 6;
    const groups = [];
    for (let g = 0; g < n; g++) {
      const layer = el('lk-twinkler');
      layer.style.cssText = 'animation-delay:' + (-(g * 0.87)).toFixed(2) +
                            's;animation-duration:' + (3.6 + g * 0.7).toFixed(1) + 's';
      host.appendChild(layer);
      groups.push(layer);
    }
    for (let i = 0; i < count; i++) {
      const s = el('lk-star' + (Math.random() < 0.16 ? ' big' : ''));
      s.style.cssText = 'left:' + pct(rnd(0, 100)) + ';top:' + pct(rnd(0, 100)) +
                        (hue ? ';background:' + hue : '');
      groups[i % n].appendChild(s);
    }
  }

  /* ============================================================
     THE VALLEY

     Five ridges going back into haze. Each one further away is shorter,
     paler and bluer, and a band of fog is laid in front of it — which is
     what actually makes distance read, far more than the shapes do.

     The sky turns over about three minutes and the stars come out with
     it, so the picture is never quite the same twice in a sitting.
     ============================================================ */
  const RIDGES = [
    /* b = how far up the picture its base sits, h = how tall it stands.
       Further back means higher and shorter and paler — all three at once,
       which is what distance actually looks like. */
    { b: 30, h: 20, tone: '#7385a8',
      shape: '0 100%,0 62%,7% 50%,14% 58%,22% 41%,31% 55%,39% 44%,48% 57%,' +
             '57% 46%,66% 58%,74% 45%,83% 56%,91% 47%,100% 58%,100% 100%' },
    { b: 22, h: 23, tone: '#55688e',
      shape: '0 100%,0 70%,9% 52%,17% 64%,26% 44%,35% 60%,44% 48%,52% 62%,' +
             '61% 43%,70% 59%,79% 47%,88% 61%,100% 50%,100% 100%' },
    { b: 14, h: 27, tone: '#3a4a6f',
      shape: '0 100%,0 74%,8% 54%,18% 68%,28% 45%,38% 64%,47% 52%,56% 70%,' +
             '65% 46%,75% 66%,84% 54%,93% 70%,100% 58%,100% 100%' },
    { b: 6,  h: 31, tone: '#23304e',
      shape: '0 100%,0 78%,10% 56%,21% 72%,32% 48%,42% 70%,53% 56%,63% 76%,' +
             '73% 50%,83% 72%,92% 60%,100% 74%,100% 100%' },
    { b: -2, h: 36, tone: '#0c1220',
      shape: '0 100%,0 82%,12% 58%,24% 78%,36% 52%,47% 76%,58% 62%,69% 82%,' +
             '80% 54%,90% 78%,100% 66%,100% 100%' }
  ];

  const FOGS = [
    /* laid in front of each ridge, thickest and lowest at the back */
    { b: 28, h: 10, tint: 'rgba(205,218,242,.42)', dur: 130, delay: 0 },
    { b: 20, h: 11, tint: 'rgba(190,206,236,.34)', dur: 170, delay: -40 },
    { b: 12, h: 12, tint: 'rgba(172,192,228,.26)', dur: 210, delay: -90 },
    { b: 4,  h: 12, tint: 'rgba(155,178,220,.18)', dur: 260, delay: -150 }
  ];

  function valley() {
    const sky = el('lk-scene lk-valley');

    ['dusk', 'night', 'dawn'].forEach(k => sky.appendChild(el('lk-sky-l ' + k)));

    /* the stars fade with the night layer, so they are not out at noon */
    nightStars(sky, 200);

    sky.appendChild(el('lk-vsun'));

    /* a floor behind everything, so no sky can show through low down
       between the ridge shapes — behind, not over, or it cuts the
       mountains off with a hard line */
    sky.appendChild(el('lk-floorband'));

    /* back to front: ridge, then the fog that sits in front of it */
    for (let i = 0; i < RIDGES.length; i++) {
      const r = RIDGES[i];
      const band = el('lk-ridgeL');
      band.style.setProperty('--b', r.b + '%');
      band.style.setProperty('--h', r.h + '%');
      band.style.setProperty('--tone', r.tone);
      band.style.setProperty('--shape', r.shape);
      sky.appendChild(band);

      const f = FOGS[RIDGES.length - 1 - i];
      if (f) {
        const fog = el('lk-fog');
        fog.style.setProperty('--b', f.b + '%');
        fog.style.setProperty('--h', f.h + '%');
        fog.style.setProperty('--tint', f.tint);
        fog.style.setProperty('--dur', f.dur + 's');
        fog.style.setProperty('--delay', f.delay + 's');
        sky.appendChild(fog);
      }
    }

    /* two lots of birds, a long way apart, crossing now and then */
    [[26, 190, 0], [34, 260, -120]].forEach(b => {
      const flock = el('lk-flock');
      flock.style.setProperty('--t', b[0] + '%');
      flock.style.setProperty('--dur', b[1] + 's');
      flock.style.setProperty('--delay', b[2] + 's');
      [[0, 0], [2.4, .9], [4.6, -.6], [6.9, 1.4], [9.1, .3]].forEach((p, i) => {
        const bird = el('lk-bird');
        bird.style.cssText = 'left:' + p[0] + 'vmin;top:' + p[1] + 'vmin';
        bird.style.setProperty('--fd', (-(i * 0.19)).toFixed(2) + 's');
        flock.appendChild(bird);
      });
      sky.appendChild(flock);
    });

    return finish(sky);
  }

  /* ============================================================
     THE VALLEY'S RELATIONS

     Three more built the way the valley is built, because the valley is
     the one that works and it is worth saying why:

       · distance, not detail — five or so flat silhouettes, each one
         further back paler, bluer or warmer, and shorter
       · something soft BETWEEN the layers (fog, haze, spray) rather than
         over them, so the eye reads depth without being told
       · one light that everything answers to
       · a sky that turns, so it is never quite the same picture twice
       · something very small, far off, for scale

     They share the valley's clock — dusk, night, dawn over two hundred
     seconds, keyframes lk-sk1/2/3 and lk-vglow — so whatever is lit by
     the sun goes down with it, and whatever is out at night comes up.

     The silhouettes are SVG, drawn once from a seeded random so a scene
     always looks itself. Where proportion matters — a tree, a ridge
     — they are sliced to the screen rather than stretched to it, so a
     phone shows fewer, bigger trees instead of thin ones.
     ============================================================ */

  const SVGNS = 'http://www.w3.org/2000/svg';

  /** A random that gives the same numbers every time for the same seed. */
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const n1 = v => Math.round(v * 10) / 10;

  /** Three skies taking turns, as the valley's do. */
  function skies(sky) {
    ['dusk', 'night', 'dawn'].forEach(k => sky.appendChild(el('lk-sky-l ' + k)));
  }

  /** Stars that come out with the night and go with it.

      Only over the sky - the top 62%, where every one of these pictures has
      its horizon or above - and in three twinkling layers, not six. Each of
      those layers is as big as it is, and all of them are blended together
      again whenever anything in front of them moves: six the size of the
      window, for stars that land and sea hid the lower half of anyway, were
      the heaviest thing on the page on a laptop's own graphics. */
  function nightStars(sky, count, hue) {
    const night = el('lk-vstars lk-x-night');
    night.style.bottom = '38%';
    starfield(night, count, hue, 3);
    sky.appendChild(night);
    return night;
  }

  /** A band across the picture holding one SVG silhouette. */
  /**
   * @param {String} [ground]  a colour to carry the layer on down, below its
   *   band, to the foot of the picture. A layer's drawing ends at the band's
   *   bottom edge, and the next layer forward dips lower than that in its
   *   troughs — so without this, stripes of sky showed through between
   *   every pair. Not for things that float, like islands on a sea.
   */
  function silhouette(cls, b, h, viewW, viewH, fit, paths, ground) {
    const band = el('lk-x-sil ' + cls + (ground ? ' lk-x-ground' : ''));
    band.style.setProperty('--b', b + '%');
    band.style.setProperty('--h', h + '%');
    if (ground) band.style.setProperty('--ground', ground);
    band.innerHTML = '<svg xmlns="' + SVGNS + '" viewBox="0 0 ' + viewW + ' ' + viewH +
      '" preserveAspectRatio="' + fit + '">' + paths + '</svg>';
    return band;
  }

  /** Something soft that drifts between two layers. */
  function drift(cls, b, h, tint, dur, delay) {
    const f = el('lk-fog ' + (cls || ''));
    f.style.setProperty('--b', b + '%');
    f.style.setProperty('--h', h + '%');
    f.style.setProperty('--tint', tint);
    f.style.setProperty('--dur', dur + 's');
    f.style.setProperty('--delay', delay + 's');
    return f;
  }

  /** A few birds crossing, now and then. */
  function flock(sky, top, dur, delay, count) {
    const f = el('lk-flock');
    f.style.setProperty('--t', top + '%');
    f.style.setProperty('--dur', dur + 's');
    f.style.setProperty('--delay', delay + 's');
    [[0, 0], [2.4, .9], [4.6, -.6], [6.9, 1.4], [9.1, .3]].slice(0, count || 5).forEach((p, i) => {
      const bird = el('lk-bird');
      bird.style.cssText = 'left:' + p[0] + 'vmin;top:' + p[1] + 'vmin';
      bird.style.setProperty('--fd', (-(i * 0.19)).toFixed(2) + 's');
      f.appendChild(bird);
    });
    sky.appendChild(f);
  }

  /**
   * A line through points, smoothed — Catmull-Rom turned into cubic
   * curves, which passes through every point rather than near them.
   */
  function smooth(pts) {
    let d = 'M' + n1(pts[0][0]) + ',' + n1(pts[0][1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += ' C' + n1(p1[0] + (p2[0] - p0[0]) / 6) + ',' + n1(p1[1] + (p2[1] - p0[1]) / 6) +
           ' ' + n1(p2[0] - (p3[0] - p1[0]) / 6) + ',' + n1(p2[1] - (p3[1] - p1[1]) / 6) +
           ' ' + n1(p2[0]) + ',' + n1(p2[1]);
    }
    return d;
  }

  /* ============================================================
     DUNES
     ============================================================ */
  /* Far to near. Each further one is paler and rosier, the near ones
     go down into plum. `lo`/`hi` are where its crests and troughs sit,
     as a share of its own band's height. */
  const DUNES = [
    { b: 34, h: 13, tone: '#c78d80', rim: '#f3c7a4', humps: 5, lo: 18, hi: 80, seed: 11 },
    { b: 27, h: 15, tone: '#a86a64', rim: '#eeb08c', humps: 4, lo: 16, hi: 78, seed: 23 },
    { b: 18, h: 19, tone: '#7c4a55', rim: '#d9937e', humps: 4, lo: 14, hi: 76, seed: 37 },
    { b: 8,  h: 24, tone: '#4e2b41', rim: '#b8716c', humps: 3, lo: 12, hi: 74, seed: 41 },
    { b: -2, h: 30, tone: '#22121f', rim: '#7d4a52', humps: 3, lo: 10, hi: 70, seed: 53 }
  ];

  function dunes() {
    const sky = el('lk-scene lk-dunes');
    skies(sky);
    const stars = nightStars(sky, 190);

    /* a shooting star, once in a long while, only while it is dark */
    [[18, 62, 23, -4], [9, 30, 37, -19]].forEach(s => {
      const shot = el('lk-d-shoot');
      shot.style.cssText = 'top:' + s[0] + '%;left:' + s[1] + '%';
      shot.style.setProperty('--dur', s[2] + 's');
      shot.style.setProperty('--delay', s[3] + 's');
      stars.appendChild(shot);
    });

    sky.appendChild(el('lk-d-moon lk-x-night'));
    sky.appendChild(el('lk-d-sun'));

    DUNES.forEach((dn, i) => {
      const rand = seeded(dn.seed);
      const pts = [];
      const steps = dn.humps * 2;
      for (let k = 0; k <= steps; k++) {
        const crest = k % 2 === 0;
        const jitter = (k > 0 && k < steps) ? (rand() - 0.5) * (1000 / steps) * 0.55 : 0;
        const x = (k / steps) * 1000 + jitter;
        const y = crest
          ? dn.lo + rand() * (dn.hi - dn.lo) * 0.35
          : dn.lo + (dn.hi - dn.lo) * (0.62 + rand() * 0.38);
        pts.push([x, y]);
      }
      const crestLine = smooth(pts);
      const body = crestLine + ' L1000,100 L0,100 Z';
      sky.appendChild(silhouette('lk-d-dune', dn.b, dn.h, 1000, 100, 'none',
        '<path d="' + body + '" fill="' + dn.tone + '"/>' +
        /* the lit edge along the crest is what makes it sand and not hills */
        '<path d="' + crestLine + '" fill="none" stroke="' + dn.rim + '" stroke-width="1.6" ' +
          'stroke-opacity="' + (0.7 - i * 0.1).toFixed(2) + '" vector-effect="non-scaling-stroke"/>',
        dn.tone));

      /* heat haze lying over the foot of every dune but the nearest, where
         the next dune forward only half hides it */
      if (i < DUNES.length - 1) {
        sky.appendChild(drift('lk-d-haze', n1(dn.b + dn.h * 0.08), n1(dn.h * 0.5),
          'rgba(246,176,128,' + (0.24 - i * 0.035).toFixed(3) + ')', 150 + i * 45, -i * 37));
      }
    });

    /* Under a night sky the land has to go to moonlight. Sand is warm by
       day, and left as it was the dunes looked lit by a sun that had set.
       One veil over the land, fading in with the night, cools the lot. */
    sky.appendChild(el('lk-d-veil lk-x-night'));

    flock(sky, 30, 230, -60, 4);
    return finish(sky);
  }

  /* ---------- choosing between them ---------- */
  /* Dunes is not offered on the password screen, but the Dunes theme draws
     it behind the board, so it stays buildable by name. */
  const BUILDERS = { valley, dunes };

  /** @param {String} key  anything unknown falls back to the valley */
  function build(key) { return (BUILDERS[key] || valley)(); }

  return { LIST, build, has: k => !!BUILDERS[k] };
})();
