#!/bin/bash
# Every assertion by name, pass or fail, from the last run's pages — so two
# runs can be compared line by line, and "nothing new broke" is a fact
# rather than a hope.
#
#   tests/snapshot.sh > before.txt   ... change things, rerun ...
#   tests/snapshot.sh > after.txt
#   diff before.txt after.txt
cd "$(dirname "$0")"
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
W="$(pwd -W)/_run"
for h in _run/*test.html; do
  case "$(basename "$h")" in _fail_*) continue;; esac
  n=$(basename "$h" .html)
  "$CH" --headless=new --disable-gpu --no-sandbox --allow-file-access-from-files \
        --window-size=1500,1050 --virtual-time-budget=90000 --dump-dom "file:///$W/$n.html" 2>/dev/null \
    | sed -n '/<pre/,/<\/pre>/p' | sed 's/<[^>]*>//g' \
    | grep -E '^ *(PASS|FAIL|THREW)' | sed 's/   \[.*$//' | sed "s|^ *|$n  |"
done
