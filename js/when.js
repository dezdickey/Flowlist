/* ============================================================
   Flowlist — putting a note off to a day

   Today and Tomorrow were the only two answers a note could give to
   "when". A note has always carried the day it is for rather than a flag
   (see `tomorrow` in js/store.js), so the field could already hold any
   date — there was simply no way to say one. This is that way: a date, and
   a time on that date if you want one.

   It opens inside the ordinary context menu rather than in a dialog of its
   own, so it arrives where the pointer already is and closes the way every
   other menu does. The date field is the browser's own, which means the
   phone gets its native date wheel for nothing.
   ============================================================ */
const When = (function () {

  /* A note cannot be put off to a day that has gone. Today is allowed and
     means Do Today, which is what today means everywhere else in the app. */
  const floor = () => Store.dayKey();

  const pretty = key => {
    const p = key.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2])
      .toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  };

  /**
   * Put a note on a day, with or without a time.
   * Today is not a date to this app — it is the Do Today pile — so choosing
   * today puts it there instead, which is the same rule the calendar drops
   * follow.
   */
  function set(listId, itemId, day, hour) {
    if (!day) return;
    Store.mutate(() => {
      const it = Store.itemById(listId, itemId);
      if (it) it.hour = (hour === '' || hour === null || hour === undefined) ? null : +hour;
    }, null, { silent: true });
    if (day === Store.dayKey()) {
      Store.setDay(listId, itemId, null);
      Store.addToToday(listId, itemId);
      UI.toast('On Do Today.');
      return;
    }
    Store.setDay(listId, itemId, day);
    UI.toast('Put off to ' + pretty(day) + '.');
  }

  /**
   * The picker itself.
   * @param {Event} ev       where to put the menu
   * @param {String} listId
   * @param {String} itemId
   */
  function pick(ev, listId, itemId) {
    const item = Store.itemById(listId, itemId);
    if (!item) return;
    const x = (ev && (ev.clientX || ev.pageX)) || 160;
    const y = (ev && (ev.clientY || ev.pageY)) || 160;

    /* start from wherever it already stands, or tomorrow if it stands nowhere */
    const startDay = Store.dayOf(item) || Store.nextDayKey();
    const startHour = (item.hour === null || item.hour === undefined) ? '' : String(item.hour);

    let dateEl = null, timeEl = null;

    UI.menu(x, y, [
      { head: 'Put this off to' },
      { mount: box => {
          box.className = 'when-box';

          dateEl = document.createElement('input');
          dateEl.type = 'date';
          dateEl.className = 'when-date';
          dateEl.value = startDay;
          dateEl.min = floor();
          box.appendChild(dateEl);

          timeEl = document.createElement('select');
          timeEl.className = 'when-time';
          timeEl.appendChild(new Option('No time', ''));
          for (let h = 0; h < 24; h++) timeEl.appendChild(new Option(UI.hourLabel(h), String(h)));
          timeEl.value = startHour;
          box.appendChild(timeEl);

          /* Enter in the date field means "that one, then" — the same as
             pressing Set, which is otherwise a trip across the menu. */
          dateEl.onkeydown = e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const d = dateEl.value, h = timeEl.value;
            UI.close();
            set(listId, itemId, d, h);
          };
          setTimeout(() => { try { dateEl.focus(); } catch (e) { /* never mind */ } }, 0);
        } },
      { label: 'Set', icon: 'check',
        onClick: () => set(listId, itemId, dateEl && dateEl.value, timeEl && timeEl.value) },
      { sep: true },
      { label: 'Today', icon: 'today', onClick: () => set(listId, itemId, Store.dayKey(), timeEl && timeEl.value) },
      { label: 'Tomorrow', icon: 'calendar', onClick: () => set(listId, itemId, Store.nextDayKey(), timeEl && timeEl.value) },
      { sep: true },
      { label: 'No day at all', icon: 'x', danger: true,
        onClick: () => { Store.setDay(listId, itemId, null); UI.toast('Taken off its day.'); } }
    ]);
  }

  return { pick, set, pretty };
})();
