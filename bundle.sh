#!/bin/sh
# Fold the whole app into one file. A phone handed a single .html can open it;
# handed an index.html with 19 siblings it usually cannot reach them.
#
#   bundle.sh <src> <out> [hosted]
#
# "hosted" flips the one-password screen on by default, so a browser opening
# it is asked for the passphrase rather than three blank fields, and turns
# on the wrong-try limit that goes with it. Fill the database URL in once in
# Settings -> Sync and the passphrase is then the only thing left to type.
#
# OMIT is an optional space-separated list of file names to leave out
# entirely - "OMIT='canvas.js canvas.css' sh bundle.sh ..." builds a copy
# with no canvas in it. A module left out has to be one whose callers are
# guarded with `typeof Thing !== 'undefined'`, or the board will not open.
# Names are matched without their folder.
SRC="$1"; OUT="$2"; MODE="$3"
cd "$SRC" || exit 1
awk -v omit=" $OMIT " '
  function left_out(path,   base) {
    if (omit == "  ") return 0
    base = path; sub(/^.*\//, "", base)
    return index(omit, " " base " ") > 0
  }
  /<link[^>]*href="css\// {
    match($0, /href="css\/[^"]+"/); f = substr($0, RSTART+6, RLENGTH-7);
    if (left_out(f)) { print "<!-- " f " left out of this build -->"; next }
    print "<style>/* " f " */";
    while ((getline line < f) > 0) print line;
    close(f); print "</style>"; next
  }
  /<script[^>]*src="js\// {
    match($0, /src="js\/[^"]+"/); f = substr($0, RSTART+5, RLENGTH-6);
    if (left_out(f)) { print "<!-- " f " left out of this build -->"; next }
    print "<script>/* " f " */";
    while ((getline line < f) > 0) print line;
    close(f); print "</script>"; next
  }
  { print }
' index.html > "$OUT"

# a file that was meant to be left out and is still in there would ship the
# very thing the build was asked not to ship, so it is checked, not assumed
for n in $OMIT; do
  if grep -q "^<script>/\* js/$n \*/\|^<style>/\* css/$n \*/" "$OUT"; then
    echo "bundle: $n was supposed to be left out and is still in there" >&2; exit 1
  fi
  grep -q "$n left out of this build" "$OUT" || {
    echo "bundle: $n is not referenced by index.html - check the name" >&2; exit 1; }
done

if [ "$MODE" = "hosted" ] || [ "$MODE" = "phone" ]; then
  # the only differences between the hosted copy and the one on disk
  sed -i 's/^\( *\)gate: false,$/\1gate: true,/' "$OUT"
  sed -i 's/^\( *\)tries: 0$/\1tries: 2/' "$OUT"

  # a bundle that quietly failed to switch these on would be worse than none
  grep -q 'gate: true,' "$OUT" || { echo "bundle: could not switch the gate on" >&2; exit 1; }
  grep -q 'tries: 2'    "$OUT" || { echo "bundle: could not set the try limit" >&2; exit 1; }
fi

if [ "$MODE" = "phone" ]; then
  # The single file travels alone. A manifest link pointing at a file that
  # is not beside it is a 404 on every load and buys nothing: a page opened
  # from disk cannot be installed anyway.
  sed -i '/rel="manifest"/d' "$OUT"
  if grep -q 'rel="manifest"' "$OUT"; then
    echo "bundle: the manifest link is still there" >&2; exit 1
  fi
fi
