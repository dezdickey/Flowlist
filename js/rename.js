/* ============================================================
   Flowlist — renaming a note on purpose

   The text is read-only on a phone, so it is not typed into by being
   touched. This is the way back in: it lifts that for a moment, puts
   the cursor at the end, and locks it again when you are done.
   ============================================================ */
const Rename = (function () {

  /**
   * @param {Element} host  the note element
   * @param {String} sel    which field inside it to open
   */
  function open(host, sel) {
    const ta = host && host.querySelector(sel || '.note-text');
    if (!ta) return false;
    const wasLocked = ta.readOnly;
    ta.readOnly = false;
    /* A tap on a locked field has usually focused it already, and a phone
       brings its keyboard up when an editable field GAINS focus — not when
       a field that already has it stops being read-only. So let go first,
       and take it again now that it can be typed into. */
    if (wasLocked && document.activeElement === ta) ta.blur();
    ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { /* ignore */ }
    if (wasLocked) {
      const relock = () => {
        ta.readOnly = true;
        ta.removeEventListener('blur', relock);
      };
      ta.addEventListener('blur', relock);
    }
    return true;
  }

  /** Find the note element for an id, wherever it is on screen. */
  function find(itemId) {
    return document.querySelector('[data-item-id="' + itemId + '"]');
  }

  return { open, find };
})();
