/* ============================================================
   Flowlist — the keyboard shortcuts, and which are switched on

   Every shortcut the app answers to is listed here once, with what it
   does, so Settings can offer a switch for each and every place that
   handles a key asks the same question: is this one on?

   All on to start. What is switched off is written into the board's
   settings as { id: true }, so it is the same on every device.
   ============================================================ */
const Keys = (function () {

  const LIST = [
    { id: 'undo',          keys: 'Ctrl+Z',    what: 'Bring back the last thing deleted',                     where: 'Anywhere' },
    { id: 'close',         keys: 'Esc',       what: 'Close Settings or the widget tray, or leave full screen', where: 'Anywhere' },
    { id: 'settings',      keys: ',',         what: 'Open Settings',                                          where: 'Anywhere' },
    { id: 'lists',         keys: '[',         what: 'Show or hide Categories',                                where: 'The board' },
    { id: 'todayBracket',  keys: ']',         what: 'Show or hide Do Today',                                  where: 'The board' },
    { id: 'todayT',        keys: 'T',         what: 'Show or hide Do Today',                                  where: 'The board' },
    { id: 'presets',       keys: 'P',         what: 'Show or hide Presets',                                   where: 'The board' },
    { id: 'canvas',        keys: 'C',         what: 'Go to the canvas',                                       where: 'The board' },
    { id: 'board',         keys: 'B',         what: 'Back to the board',                                      where: 'The board' },
    { id: 'newNote',       keys: 'N',         what: 'A new note at the top of the first open column',         where: 'The board' },
    { id: 'noteEnter',     keys: 'Enter',     what: 'Start a new note under the one you are typing in',       where: 'Typing in a note' },
    { id: 'noteBackspace', keys: 'Backspace', what: 'Delete a note that is empty',                            where: 'Typing in a note' },
    { id: 'canvasSelect',  keys: 'V',         what: 'Select',                                                 where: 'The canvas' },
    { id: 'canvasPen',     keys: 'P',         what: 'Pen',                                                    where: 'The canvas' },
    { id: 'canvasArrow',   keys: 'A',         what: 'Arrow',                                                  where: 'The canvas' },
    { id: 'canvasErase',   keys: 'E',         what: 'Eraser',                                                 where: 'The canvas' },
    { id: 'canvasSweep',   keys: 'S',         what: 'Sweep',                                                  where: 'The canvas' },
    { id: 'canvasFit',     keys: 'F',         what: 'Fit everything on screen',                               where: 'The canvas' },
    { id: 'canvasDelete',  keys: 'Delete',    what: 'Delete the card that is selected',                       where: 'The canvas' }
  ];

  /** Is this shortcut switched on? Anything not listed as off is on. */
  function on(id) {
    const off = (typeof Store !== 'undefined' && Store.settings().keysOff) || {};
    return !off[id];
  }

  /** Switch one on or off, or every one of them with id '*'. */
  function set(id, want) {
    Store.mutate(s => {
      const off = Object.assign({}, s.settings.keysOff || {});
      (id === '*' ? LIST.map(k => k.id) : [id]).forEach(k => {
        if (want) delete off[k]; else off[k] = true;
      });
      s.settings.keysOff = off;
    }, null, { silent: true });
  }

  return { LIST, on, set };
})();
