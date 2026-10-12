#!/bin/sh
# Why did a suite fail? Prints the score and the failing assertions only.
#
#   tests/why.sh                 every suite that failed in the last run
#   tests/why.sh canvas2test     just that one
#   tests/why.sh canvas2 gate    any whose name contains these words
#
# Read this instead of opening tests/_run/_fail_<name>.html. Those pages are
# the whole app inlined - about 1.1 MB each, roughly 275,000 tokens - and the
# part worth reading is a handful of lines. Opening one costs a quarter of a
# context window and tells you nothing the output below does not.
#
# No browser is run: the page was already saved with its results in it.

set -u
cd "$(dirname "$0")" || exit 1

[ -d _run ] || { echo "No _run folder. Run tests/runall.sh first."; exit 1; }

# Collect the failure pages, filtered by any words given.
PAGES=""
for h in _run/_fail_*.html; do
  [ -e "$h" ] || continue
  n=$(basename "$h" .html); n=${n#_fail_}
  if [ $# -gt 0 ]; then
    keep=0
    for w in "$@"; do case "$n" in *"$w"*) keep=1;; esac; done
    [ "$keep" = "1" ] || continue
  fi
  PAGES="$PAGES $h"
done

if [ -z "$PAGES" ]; then
  if [ $# -gt 0 ]; then echo "No failing suite matches: $*"; else echo "Nothing failed in the last run."; fi
  exit 0
fi

for h in $PAGES; do
  n=$(basename "$h" .html); n=${n#_fail_}
  score=$(grep -o "<title>[^<]*</title>" "$h" 2>/dev/null | head -1 | sed 's/<[^>]*>//g')
  echo "=== $n   ${score:-no score in title}"
  sed -n '/<pre/,/<\/pre>/p' "$h" 2>/dev/null \
    | sed 's/<[^>]*>//g' \
    | grep -E '^ *(FAIL|THREW)' \
    | sed 's/^ */  /'
  echo
done

echo "Full pages are in tests/_run/ if one is truly needed - see the note at the top of this script."
