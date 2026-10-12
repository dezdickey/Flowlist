#!/bin/bash
# Fold index.html, its stylesheets and scripts, and one test suite into a
# single page that headless Chrome can load from disk.
#
#   build.sh <suite.js> <out.html>
#
# The suite is appended just before </body>, after every app script, so
# it runs against the real app with nothing stubbed unless it stubs it.
#
# These suites used to live in a temporary scratch folder and were lost
# when it was cleared. They live here now, beside the app they test.
set -e
TESTS="$(cd "$(dirname "$0")" && pwd -W)"
ROOT="$(cd "$TESTS/.." && pwd)"
SUITE="$1"; OUT="$2"
cd "$ROOT"
awk -v suite="$TESTS/$SUITE" '
/<link rel="stylesheet" href="css\// {
  match($0, /css\/[a-z]+\.css/); f = substr($0, RSTART, RLENGTH)
  print "<style>"; while ((getline l < f) > 0) print l; close(f); print "</style>"; next
}
/<script src="js\// {
  match($0, /js\/[a-z]+\.js/); f = substr($0, RSTART, RLENGTH)
  print "<script>"; while ((getline l < f) > 0) print l; close(f); print "</scr" "ipt>"; next
}
/<\/body>/ {
  if (suite != "") {
    print "<script>"; while ((getline l < suite) > 0) print l; close(suite); print "</scr" "ipt>"
  }
  print; next
}
{ print }' index.html > "$OUT"
