#!/bin/bash
# Rebuild css/fonts.css from Google's copies — at build time, here, once.
#
# The point of the file it writes is that the reader's browser never talks
# to Google. This script does, because somebody has to; it just isn't them.
#
# Both faces are variable, so the latin block of each is one file covering
# every weight. Only latin is carried: latin-ext is another 112KB of
# Eastern European and Vietnamese coverage for a board written in English,
# and a character outside the range simply falls back to the system face.
set -e
S="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$S/.." && pwd)"
OUT="$ROOT/css/fonts.css"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
API="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Baloo+2:wght@600;700&display=swap"

mkdir -p "$S/fonts"
curl -s -A "$UA" "$API" -o "$S/gf.css"

# the latin src url for one family, taken from the block after the /* latin */ marker
url_for () {
  awk -v fam="$1" '
    /^\/\* /            { sub(/\/\* /,""); sub(/ \*\//,""); sub(/\r/,""); tag=$0 }
    /font-family/       { f=$0; gsub(/.*: .|.;.*/,"",f) }
    /src: url/          { u=$0; gsub(/.*url\(|\).*/,"",u);
                          if (tag == "latin" && f == fam) { print u; exit } }
  ' "$S/gf.css"
}
RANGE=$(grep -o "unicode-range: U+0000-00FF[^;]*" "$S/gf.css" | head -1 | sed 's/unicode-range: //')

curl -s -A "$UA" "$(url_for Inter)"     -o "$S/fonts/inter-latin.woff2"
curl -s -A "$UA" "$(url_for 'Baloo 2')" -o "$S/fonts/baloo-latin.woff2"

# a truncated download would be a silently broken app, so check the magic
for f in "$S/fonts/inter-latin.woff2" "$S/fonts/baloo-latin.woff2"; do
  [ "$(head -c4 "$f" | xxd -p)" = "774f4632" ] || { echo "not a woff2: $f" >&2; exit 1; }
done

face () {  # family, weights, file
  printf '@font-face {\n  font-family: "%s";\n  font-style: normal;\n  font-weight: %s;\n  font-display: swap;\n  unicode-range: %s;\n  src: url(data:font/woff2;base64,%s) format("woff2");\n}\n' \
    "$1" "$2" "$RANGE" "$(base64 -w0 "$3")"
}

{
  sed -n '1,/^   ====.*$/p' "$OUT" 2>/dev/null | head -0   # (header written below)
  cat "$S/fonts-header.txt"
  face "Inter"   "400 700" "$S/fonts/inter-latin.woff2"
  face "Baloo 2" "600 700" "$S/fonts/baloo-latin.woff2"
} > "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
