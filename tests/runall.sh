#!/bin/bash
# Run every suite and add up the score.
#
#   tests/runall.sh            everything
#   tests/runall.sh today tap  only the suites whose names contain these words
#
# Things this has to get right, each learned the hard way:
#   - the window must be big enough. The canvas suite drags cards about,
#     and in a short window they land off screen.
#   - not every suite reports in the title, so the body is read as well.
#   - offlinetest reads the real site/sw.js, so it is copied beside the
#     bundles, and reading a local file needs --allow-file-access-from-files.
#   - a failing suite's page is kept in _run/_fail_<name>.html, so the
#     failing assertion can be read afterwards rather than guessed at.
TESTS="$(cd "$(dirname "$0")" && pwd -W)"   # C:/... form: a file:// URL needs the drive letter
ROOT="$(cd "$TESTS/.." && pwd)"
W="$TESTS/_run"; mkdir -p "$W"; rm -f "$W"/_fail_*.html
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
TP=0; TF=0; BAD=""

cp "$ROOT/site/sw.js" "$W/sw.js" 2>/dev/null

run () { # $1 = url, $2 = label
  dom=$("$CH" --headless=new --disable-gpu --no-sandbox --allow-file-access-from-files \
          --window-size=1500,1050 --virtual-time-budget=90000 --dump-dom "$1" 2>/dev/null)
  line=$(echo "$dom" | grep -o "<title>[^<]*</title>" | head -1 | sed 's/<[^>]*>//g')
  case "$line" in
    *passed*) ;;
    *) line=$(echo "$dom" | grep -o "[0-9]\+ passed,\? [0-9]\+ failed" | head -1) ;;
  esac
  p=$(echo "$line" | grep -o "[0-9]\+ passed" | grep -o "[0-9]\+")
  f=$(echo "$line" | grep -o "[0-9]\+ failed" | grep -o "[0-9]\+")
  [ -z "$p" ] && p=0
  [ -z "$f" ] && f=0
  TP=$((TP+p)); TF=$((TF+f))
  if [ "$f" != "0" ] || [ "$p" = "0" ]; then
    echo "$dom" > "$W/_fail_$2.html"
    BAD="$BAD $2"
    printf '  %-16s %s   <-- LOOK\n' "$2" "${line:-no score}"
  else
    printf '  %-16s %s\n' "$2" "$line"
  fi
}

want () {  # does this suite match the filter words, if any were given
  [ $# -le 1 ] && return 0
  n="$1"; shift
  for w in "$@"; do case "$n" in *"$w"*) return 0;; esac; done
  return 1
}

for j in "$TESTS"/*test.js; do
  n=$(basename "$j" .js)
  want "$n" "$@" || continue
  bash "$TESTS/build.sh" "$n.js" "$W/$n.html" || { echo "build failed: $n"; continue; }
  run "file:///$W/$n.html" "$n"
done

echo
echo "TOTAL  $TP passed  $TF failed"
[ -n "$BAD" ] && echo "CHECK: $BAD"
[ "$TF" = "0" ]
