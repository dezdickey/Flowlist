/* ============================================================
   Flowlist — Presets
   A preset is a named, coloured, ordered group of categories.
   Firing one opens every category in it, in the group's own
   order, to the right of whatever is already on the board, and
   paints a solid band across that whole run.
   ============================================================ */
const Presets = (function () {
  const indexEl = document.getElementById('preset-index');
  const bandsEl = document.getElementById('preset-bands');
  const boardEl = document.getElementById('board');
  const boardWrap = document.getElementById('board-wrap');

  /* ============================================================
     PANEL
     ============================================================ */
  function render() {
    const s = Store.get();
    indexEl.innerHTML = '';

    if (!s.presets.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.style.padding = '16px 10px';
      p.innerHTML = 'No presets yet.<br><br>Make one with <b>+</b> above, then drag categories from the <b>Lists</b> panel into its box. Firing the preset opens them all at once, in the order you arranged them.';
      indexEl.appendChild(p);
      DND.clearZones(z => z.kind === 'preset');
      return;
    }

    s.presets.forEach(p => indexEl.appendChild(presetEl(p)));

    DND.clearZones(z => z.kind === 'preset');
    indexEl.querySelectorAll('.preset-drop').forEach(drop => {
      DND.zone(drop, {
        kind: 'preset', accepts: ['category', 'pmember'], axis: 'y',
        onDrop: (payload, index) => {
          Store.presetAddList(drop.dataset.presetId, payload.listId, index);
        }
      });
    });
  }

  function presetEl(preset) {
    const el = document.createElement('div');
    el.className = 'preset' + (preset.open ? ' open' : '');
    el.style.setProperty('--c', preset.color);
    el.dataset.presetId = preset.id;

    const head = document.createElement('div');
    head.className = 'preset-head';
    head.innerHTML =
      '<span class="preset-caret">' + UI.icon('chevR') + '</span>' +
      '<span class="preset-swatch"></span>' +
      '<span class="preset-name" title="' + UI.esc(preset.name) + '">' + UI.esc(preset.name) + '</span>' +
      '<span class="preset-count">' + preset.listIds.length + '</span>' +
      '<button class="icon-btn sm p-fire" title="Open every category in this preset">' + UI.icon('plus') + '</button>';

    head.onclick = e => {
      if (e.target.closest('.p-fire')) return;
      Store.mutate(() => { preset.open = !preset.open; }, ['presets']);
    };
    head.querySelector('.p-fire').onclick = e => { e.stopPropagation(); fire(preset); };
    head.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); presetMenu(e, preset); };
    el.appendChild(head);

    const drop = document.createElement('div');
    drop.className = 'preset-drop' + (preset.listIds.length ? '' : ' empty-hint');
    drop.dataset.presetId = preset.id;
    preset.listIds.forEach(id => {
      const list = Store.listById(id);
      if (!list) return;
      const m = document.createElement('div');
      m.className = 'pmember';
      m.dataset.dndItem = '1';
      m.style.setProperty('--c', list.color);
      m.innerHTML =
        '<span class="cat-swatch"></span>' +
        '<span class="pm-name" title="' + UI.esc(list.name) + '">' + UI.esc(list.name) + '</span>' +
        '<button class="icon-btn sm" title="Remove from preset">' + UI.icon('x') + '</button>';
      m.querySelector('button').onclick = ev => { ev.stopPropagation(); Store.presetRemoveList(preset.id, id); };
      m.addEventListener('pointerdown', ev => {
        if (ev.target.closest('button')) return;
        DND.start(ev, { el: m, kind: 'pmember', payload: { listId: id, presetId: preset.id }, axis: 'y' });
      });
      drop.appendChild(m);
    });
    el.appendChild(drop);
    return el;
  }

  function presetMenu(e, preset) {
    UI.menu(e.clientX, e.clientY, [
      { label: 'Open all (' + preset.listIds.length + ')', icon: 'plus', onClick: () => fire(preset) },
      { label: 'Close all', icon: 'minus', onClick: () => preset.listIds.forEach(id => Store.closeList(id)) },
      { sep: true },
      { label: 'Rename', icon: 'pencil', onClick: () => {
          const rect = e.target.closest('.preset-head').getBoundingClientRect();
          UI.rename(rect, preset.name, v => Store.mutate(() => { preset.name = v || 'Untitled'; }, ['presets', 'board']));
        } },
      { sep: true },
      { head: 'Colour' },
      { html: '', mount: d => d.appendChild(UI.colorBlock(preset.color, c =>
          Store.mutate(() => { preset.color = c; }, ['presets', 'board']))) },
      { sep: true },
      { label: 'Delete preset', icon: 'trash', danger: true,
        onClick: () => { if (UI.confirmDelete(preset.name)) Store.deletePreset(preset.id); } }
    ]);
  }

  /* ============================================================
     FIRING A PRESET
     ============================================================ */
  function fire(preset) {
    if (!preset.listIds.length) { UI.toast('That preset is empty — drag some categories into it first.'); return; }

    let opened = 0, collapsed = 0;
    preset.listIds.forEach(id => {
      if (Store.isOpen(id)) {
        // already on the board — just retag it so the band covers it
        Store.mutate(() => { const l = Store.listById(id); if (l) l.presetId = preset.id; }, null, { silent: true });
        return;
      }
      const res = Store.openList(id, { presetId: preset.id });
      if (res.ok) { opened++; if (res.collapsed) collapsed++; }
    });

    Store.emit(['board', 'lists']);
    if (collapsed) UI.toast(opened + ' opened — ' + collapsed + ' arrived collapsed (board is at ' + Store.settings().maxOpen + ').');
    else if (opened) UI.toast(preset.name + ' — ' + opened + ' opened.');
  }

  /* ============================================================
     COLOUR BANDS ACROSS THE BOARD
     ============================================================ */
  function renderBands() {
    bandsEl.innerHTML = '';
    const s = Store.get();

    // contiguous runs of open lists sharing a presetId
    const runs = [];
    let cur = null;
    s.board.forEach(id => {
      const l = Store.listById(id);
      const pid = l && l.presetId;
      if (pid && cur && cur.presetId === pid) cur.ids.push(id);
      else {
        if (cur && cur.presetId) runs.push(cur);
        cur = pid ? { presetId: pid, ids: [id] } : null;
      }
    });
    if (cur && cur.presetId) runs.push(cur);

    const wrapRect = boardWrap.getBoundingClientRect();
    let any = false;

    runs.forEach(run => {
      const preset = Store.presetById(run.presetId);
      if (!preset) return;
      const els = run.ids.map(id => boardEl.querySelector('.list[data-list-id="' + id + '"]')).filter(Boolean);
      if (!els.length) return;

      const first = els[0].getBoundingClientRect();
      const last = els[els.length - 1].getBoundingClientRect();
      const left = first.left - wrapRect.left;
      const width = last.right - first.left;
      if (width <= 0 || left + width < 0 || left > wrapRect.width) return;

      const band = document.createElement('div');
      band.className = 'band';
      band.style.setProperty('--c', preset.color);
      band.style.left = Math.max(0, left) + 'px';
      band.style.width = Math.min(width, wrapRect.width - Math.max(0, left)) + 'px';
      band.dataset.label = preset.name;
      bandsEl.appendChild(band);
      any = true;
    });

    boardWrap.classList.toggle('has-bands', any);
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    Store.on('presets', render);
    Store.on('*', render);
    Store.on('board', renderBands);

    document.getElementById('btn-add-preset').onclick = e => {
      const p = Store.addPreset('Untitled');
      const rect = e.target.getBoundingClientRect();
      UI.rename(rect, '', v => Store.mutate(() => { p.name = v || 'Untitled'; }, ['presets']), 'Name this preset');
    };

    render();
  }

  return { init, render, renderBands, fire };
})();
