/* ============================================================
   Flowlist — Widgets
   A snap-in bar across the top plus a tray you pull them from.
   Hovering a tray card fades it up and shows ADD; clicking drops
   the widget at the right-hand end. Edit mode makes the bar
   draggable left↔right and reveals per-widget delete buttons.
   ============================================================ */
const Widgets = (function () {
  const bar = document.getElementById('widgetbar');
  const tray = document.getElementById('tray-grid');
  const trayPanel = document.getElementById('widget-tray');
  const editBtn = document.getElementById('btn-widget-edit');

  let tick = null;

  /* The live widgets are painted again every second, but what they show
     changes once a minute at most. Putting the very same thing back still
     made the page lay itself out and sort its layers again - a few ms,
     once a second, landing in the middle of whatever was being scrolled on
     a 165 Hz screen. So a widget's insides are only replaced when there is
     something new to show. */
  function put(el, html) {
    if (el._shown === html) return;
    el._shown = html;
    el.innerHTML = html;
  }

  /* ============================================================
     CATALOGUE
     ============================================================ */
  const TYPES = {
    clock: {
      name: 'Clock', icon: 'clock', desc: 'Time and date, ticking live.',
      render(w, el) {
        const paint = () => {
          const d = new Date();
          put(el,
            '<span class="w-ic">' + UI.icon('clock') + '</span>' +
            '<span class="w-main">' +
              '<span class="w-big">' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</span>' +
              '<span class="w-sub">' + d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) + '</span>' +
            '</span>');
        };
        paint();
        return paint;
      }
    },

    weather: {
      name: 'Weather', icon: 'cloud', desc: 'Live conditions for your spot.',
      render(w, el) {
        el.innerHTML = '<span class="w-ic">' + UI.icon('cloud') + '</span>' +
          '<span class="w-main"><span class="w-big">--°</span><span class="w-sub">loading…</span></span>';
        loadWeather(el);
        el.onclick = e => {
          if (Store.settings().widgetEdit) return;
          const cfg = Store.settings().weather;
          UI.rename(el.getBoundingClientRect(), cfg.label, v => {
            geocode(v, el);
          }, 'City name — press Enter to look it up');
          e.stopPropagation();
        };
        return () => loadWeather(el);   // refreshed on the slow tick
      },
      slow: true
    },

    progress: {
      name: 'Day progress', icon: 'battery', desc: 'How much of the day is left.',
      render(w, el) {
        const paint = () => {
          const d = new Date();
          const mins = d.getHours() * 60 + d.getMinutes();
          const start = 7 * 60, end = 24 * 60;
          const pct = Math.max(0, Math.min(100, Math.round(((mins - start) / (end - start)) * 100)));
          put(el,
            '<span class="w-ic">' + UI.icon('battery') + '</span>' +
            '<span class="w-main">' +
              '<span class="w-big">' + pct + '%</span>' +
              '<span class="w-sub">of 7 AM → midnight</span>' +
            '</span>');
        };
        paint();
        return paint;
      }
    },

    tasks: {
      name: 'Today count', icon: 'today', desc: 'Done vs. planned for today.',
      render(w, el) {
        const paint = () => {
          const s = Store.get();
          const entries = s.today.map(t => Store.itemById(t.listId, t.itemId)).filter(Boolean);
          const done = entries.filter(i => i.done).length;
          put(el,
            '<span class="w-ic">' + UI.icon('today') + '</span>' +
            '<span class="w-main">' +
              '<span class="w-big">' + done + ' / ' + entries.length + '</span>' +
              '<span class="w-sub">' + (entries.length ? 'done today' : 'nothing planned') + '</span>' +
            '</span>');
        };
        paint();
        return paint;   // the 1s tick keeps it current
      }
    },

    gif: {
      name: 'GIF / image', icon: 'image', desc: 'A looping image of your choosing.',
      render(w, el) {
        const url = (w.config && w.config.url) || '';
        el.innerHTML = url
          ? '<img class="w-gif" src="' + UI.esc(url) + '" alt="">'
          : '<span class="w-ic">' + UI.icon('image') + '</span><span class="w-main"><span class="w-sub">click to set a URL</span></span>';
        el.onclick = e => {
          if (Store.settings().widgetEdit) return;
          e.stopPropagation();
          UI.rename(el.getBoundingClientRect(), url, v => {
            Store.mutate(() => { w.config = { url: v }; }, ['widgets']);
          }, 'Paste an image or GIF URL');
        };
        return null;
      }
    },

    headlines: {
      name: 'Headlines', icon: 'news', desc: 'Your own rotating list, with arrows.',
      render(w, el) {
        const lines = (w.config && w.config.lines) || [
          'Click me to write your own lines',
          'Use the arrows to page through them',
          'One per line when you edit'
        ];
        let i = (w.config && w.config.i) || 0;
        const paint = () => {
          i = ((i % lines.length) + lines.length) % lines.length;
          el.innerHTML =
            '<span class="w-ic">' + UI.icon('news') + '</span>' +
            '<span class="w-main w-news">' +
              '<span class="w-sub" style="font-size:11.5px;color:var(--text)">' + UI.esc(lines[i]) + '</span>' +
              '<span class="w-sub">' + (i + 1) + ' of ' + lines.length + '</span>' +
            '</span>' +
            '<span class="w-nav">' +
              '<button class="icon-btn" data-nav="-1">' + UI.icon('chevL') + '</button>' +
              '<button class="icon-btn" data-nav="1">' + UI.icon('chevR') + '</button>' +
            '</span>';
          el.querySelectorAll('[data-nav]').forEach(b => {
            b.onclick = ev => { ev.stopPropagation(); i += parseInt(b.dataset.nav, 10); paint(); };
          });
        };
        paint();
        el.onclick = e => {
          if (Store.settings().widgetEdit || e.target.closest('[data-nav]')) return;
          e.stopPropagation();
          UI.rename(el.getBoundingClientRect(), lines.join(' | '), v => {
            Store.mutate(() => { w.config = { lines: v.split('|').map(x => x.trim()).filter(Boolean) }; }, ['widgets']);
          }, 'Separate each line with |');
        };
        return null;
      }
    },

    quote: {
      name: 'Line of the day', icon: 'quote', desc: 'One short line, rotating daily.',
      render(w, el) {
        const LINES = [
          'Start where you are.', 'Small steps, every day.', 'Done beats perfect.',
          'One thing at a time.', 'Momentum is a choice.', 'Clear the small stuff first.',
          'Tomorrow you will thank today you.', 'Progress, not polish.'
        ];
        const day = Math.floor(Date.now() / 864e5);
        el.innerHTML =
          '<span class="w-ic">' + UI.icon('quote') + '</span>' +
          '<span class="w-main"><span class="w-sub" style="font-size:11.5px;color:var(--text)">' +
          UI.esc(LINES[day % LINES.length]) + '</span></span>';
        return null;
      }
    }
  };

  /* ============================================================
     WEATHER (Open-Meteo — no key required)
     ============================================================ */
  const WMO = {
    0: ['Clear', '☀'], 1: ['Mostly clear', '🌤'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁'],
    45: ['Fog', '🌫'], 48: ['Rime fog', '🌫'], 51: ['Light drizzle', '🌦'], 53: ['Drizzle', '🌦'],
    55: ['Heavy drizzle', '🌦'], 61: ['Light rain', '🌧'], 63: ['Rain', '🌧'], 65: ['Heavy rain', '🌧'],
    71: ['Light snow', '🌨'], 73: ['Snow', '🌨'], 75: ['Heavy snow', '❄'], 77: ['Snow grains', '❄'],
    80: ['Showers', '🌦'], 81: ['Showers', '🌧'], 82: ['Violent showers', '⛈'],
    85: ['Snow showers', '🌨'], 86: ['Snow showers', '🌨'], 95: ['Thunderstorm', '⛈'],
    96: ['Storm + hail', '⛈'], 99: ['Storm + hail', '⛈']
  };

  function loadWeather(el) {
    const cfg = Store.settings().weather;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + cfg.lat +
      '&longitude=' + cfg.lon + '&current=temperature_2m,weather_code&temperature_unit=fahrenheit';
    fetch(url)
      .then(r => r.json())
      .then(d => {
        const c = d && d.current;
        if (!c) throw new Error('no data');
        const w = WMO[c.weather_code] || ['—', '·'];
        el.innerHTML =
          '<span class="w-ic" style="font-size:17px;line-height:1">' + w[1] + '</span>' +
          '<span class="w-main">' +
            '<span class="w-big">' + Math.round(c.temperature_2m) + '°</span>' +
            '<span class="w-sub">' + w[0] + ' · ' + UI.esc(cfg.label) + '</span>' +
          '</span>';
      })
      .catch(() => {
        el.innerHTML = '<span class="w-ic">' + UI.icon('cloud') + '</span>' +
          '<span class="w-main"><span class="w-sub">offline · click to set city</span></span>';
      });
  }

  function geocode(name, el) {
    fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&name=' + encodeURIComponent(name))
      .then(r => r.json())
      .then(d => {
        const hit = d && d.results && d.results[0];
        if (!hit) { UI.toast('Could not find "' + name + '".'); return; }
        Store.mutate(s => {
          s.settings.weather = { lat: hit.latitude, lon: hit.longitude, label: hit.name };
        }, ['widgets']);
        UI.toast('Weather set to ' + hit.name + '.');
      })
      .catch(() => UI.toast('Location lookup needs an internet connection.'));
  }

  /* ============================================================
     BAR
     ============================================================ */
  const painters = [];
  let seenWidgets = new Set();

  function render() {
    const s = Store.get();
    painters.length = 0;

    // only widgets that were not on the bar a moment ago animate in
    const prevSeen = seenWidgets;
    seenWidgets = new Set(s.widgets.map(w => w.id));
    bar.innerHTML = '';
    bar.classList.toggle('editing', !!s.settings.widgetEdit);
    editBtn.classList.toggle('on', !!s.settings.widgetEdit);

    if (!s.widgets.length) {
      const d = document.createElement('span');
      d.className = 'widgetbar-empty';
      d.textContent = 'No widgets — add some with + →';
      bar.appendChild(d);
    }

    s.widgets.forEach(w => {
      const def = TYPES[w.type];
      if (!def) return;
      const el = document.createElement('div');
      el.className = 'widget' + (prevSeen.has(w.id) ? '' : ' just-added');
      el.dataset.dndItem = '1';
      el.dataset.widgetId = w.id;

      // painters own .w-inner and rewrite it on every tick; anything that must
      // outlive a repaint (the delete badge) is a sibling of it, not a child
      const inner = document.createElement('div');
      inner.className = 'w-inner';
      el.appendChild(inner);
      bar.appendChild(el);

      const painter = def.render(w, inner);
      if (painter) painters.push({ fn: painter, slow: !!def.slow });

      const x = document.createElement('button');
      x.className = 'w-x';
      x.innerHTML = UI.icon('x');
      x.title = 'Remove widget';
      x.onclick = ev => { ev.stopPropagation(); Store.removeWidget(w.id); };
      el.appendChild(x);

      el.addEventListener('pointerdown', ev => {
        if (!Store.settings().widgetEdit) return;
        if (ev.target.closest('.w-x')) return;
        DND.start(ev, { el, kind: 'widget', payload: { id: w.id }, axis: 'x' });
      });

      el.oncontextmenu = ev => {
        ev.preventDefault(); ev.stopPropagation();
        UI.menu(ev.clientX, ev.clientY, [
          { label: Store.settings().widgetEdit ? 'Finish arranging' : 'Rearrange widgets', icon: 'grid',
            onClick: () => toggleEdit() },
          { sep: true },
          { label: 'Remove widget', icon: 'trash', danger: true, onClick: () => Store.removeWidget(w.id) }
        ]);
      };
    });

    DND.zone(bar, {
      kind: 'widgets', accepts: ['widget'], axis: 'x',
      onDrop: (payload, index) => Store.moveWidget(payload.id, index)
    });
  }

  function renderTray() {
    tray.innerHTML = '';
    Object.keys(TYPES).forEach(key => {
      const def = TYPES[key];
      const card = document.createElement('div');
      card.className = 'tray-card';
      card.innerHTML =
        '<span class="tc-ic">' + UI.icon(def.icon) + '</span>' +
        '<span class="tc-name">' + UI.esc(def.name) + '</span>' +
        '<span class="tc-desc">' + UI.esc(def.desc) + '</span>' +
        '<span class="tc-add">ADD</span>';
      card.onclick = () => {
        Store.addWidget(key);
        UI.toast(def.name + ' added.');
      };
      tray.appendChild(card);
    });
  }

  function toggleEdit() {
    Store.mutate(s => { s.settings.widgetEdit = !s.settings.widgetEdit; }, ['widgets']);
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    Store.on('widgets', render);
    Store.on('*', render);

    editBtn.onclick = toggleEdit;

    const openTray = () => { trayPanel.classList.add('show'); };
    const closeTray = () => { trayPanel.classList.remove('show'); };
    document.getElementById('btn-widget-tray').onclick = e => {
      e.stopPropagation();
      trayPanel.classList.contains('show') ? closeTray() : openTray();
    };
    document.getElementById('tray-close').onclick = closeTray;
    document.addEventListener('pointerdown', e => {
      if (trayPanel.classList.contains('show') &&
          !trayPanel.contains(e.target) &&
          !e.target.closest('#btn-widget-tray')) closeTray();
    });

    renderTray();
    render();

    let ticks = 0;
    tick = setInterval(() => {
      ticks++;
      painters.forEach(p => { if (!p.slow || ticks % 600 === 0) p.fn(); });
    }, 1000);
  }

  return { init, render, TYPES };
})();
