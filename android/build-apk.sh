#!/bin/bash
# ============================================================
# Flowlist — build the APK
#
# No Gradle. Gradle would want a wrapper, a daemon, a dependency cache
# and a few gigabytes of disk to hold them, and this app depends on
# nothing but the Android platform itself. So the tools that actually
# make an APK are called directly:
#
#     aapt2      compile and link the resources and the manifest
#     javac      compile the one class against android.jar
#     d8         turn those class files into Android's own bytecode
#     jar        put the result inside the apk
#     zipalign   line the file up so Android can map it without copying
#     apksigner  sign it, because Android installs nothing unsigned
#
# It needs a JDK and the Android build tools; setup-toolchain.sh next
# door fetches both into ./toolchain and touches nothing else.
#
#   ./build-apk.sh            build with the copy of the app in assets/
#   ./build-apk.sh --refresh  rebuild that copy from the source first
# ============================================================
set -e
cd "$(dirname "$0")"
HERE="$(pwd)"
ROOT="$(cd .. && pwd)"

TC="$HERE/toolchain"
JDK="${JAVA_HOME:-$TC/jdk}"
SDK="${ANDROID_SDK_ROOT:-$TC/sdk}"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"

OUT="$HERE/out"
KEYSTORE="$HERE/flowlist.keystore"
PWFILE="$HERE/flowlist.keystore.password"

# On Windows these are aapt2.exe, d8.bat, apksigner.bat and so on, and
# calling the bare name finds nothing. Resolve each once, properly.
tool () {
  for e in "" ".exe" ".bat" ".cmd"; do
    [ -f "$1$e" ] && { printf '%s' "$1$e"; return 0; }
  done
  echo "missing tool: $1  — run ./setup-toolchain.sh first" >&2
  exit 1
}

AAPT2="$(tool "$BT/aapt2")"
D8="$(tool "$BT/d8")"
ZIPALIGN="$(tool "$BT/zipalign")"
APKSIGNER="$(tool "$BT/apksigner")"
JAVAC="$(tool "$JDK/bin/javac")"
JAR="$(tool "$JDK/bin/jar")"
KEYTOOL="$(tool "$JDK/bin/keytool")"
[ -f "$PLATFORM" ] || { echo "missing: $PLATFORM — run ./setup-toolchain.sh first" >&2; exit 1; }

# d8 and apksigner are .bat wrappers that go looking for a JVM, and they
# look in the environment, not in this script's variables. Handed a
# /c/... path they find nothing, so it goes across in Windows form.
export JAVA_HOME
if command -v cygpath >/dev/null 2>&1; then
  JAVA_HOME="$(cygpath -w "$JDK")"
else
  JAVA_HOME="$JDK"
fi

# ---------- the app itself ----------
if [ "$1" = "--refresh" ]; then
  echo "· folding the app into one file"
  sh "$ROOT/bundle.sh" "$ROOT" "$HERE/assets/index.html" phone
fi
[ -f "$HERE/assets/index.html" ] || {
  echo "assets/index.html is missing — run: ./build-apk.sh --refresh" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/dex" "$OUT/gen"

# ---------- resources ----------
echo "· compiling resources"
"$AAPT2" compile --dir "$HERE/res" -o "$OUT/res.zip"

echo "· linking"
"$AAPT2" link \
  -o "$OUT/base.apk" \
  -I "$PLATFORM" \
  --manifest "$HERE/AndroidManifest.xml" \
  --java "$OUT/gen" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  --version-code "${VERSION_CODE:-1}" \
  --version-name "${VERSION_NAME:-1.0}" \
  -A "$HERE/assets" \
  "$OUT/res.zip"

# ---------- the class ----------
echo "· compiling java"
"$JAVAC" -nowarn -encoding UTF-8 \
  -source 8 -target 8 \
  -bootclasspath "$PLATFORM" \
  -classpath "$PLATFORM" \
  -d "$OUT/classes" \
  $(find "$HERE/java" "$OUT/gen" -name '*.java')

echo "· dexing"
"$D8" --release --min-api 24 --lib "$PLATFORM" \
  --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')

echo "· putting the code in"
( cd "$OUT/dex" && "$JAR" uf "$OUT/base.apk" classes.dex )

# ---------- sign ----------
# A self-signed key, made once and kept. Android will not install an
# unsigned app — and it will not install an update signed by a different
# key either, so if this file is lost the only way to update is to
# uninstall first, which takes the board on the phone with it. Keep it.
if [ ! -f "$KEYSTORE" ]; then
  echo "· making a signing key (once only)"
  PW="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | cut -c1-24)"
  printf '%s\n' "$PW" > "$PWFILE"
  chmod 600 "$PWFILE" 2>/dev/null || true
  "$KEYTOOL" -genkeypair \
    -keystore "$KEYSTORE" -storetype PKCS12 \
    -storepass "$PW" -keypass "$PW" \
    -alias flowlist -keyalg RSA -keysize 2048 -validity 10950 \
    -dname "CN=Flowlist, O=Flowlist, C=US" >/dev/null
  echo "  key:      $KEYSTORE"
  echo "  password: $PWFILE"
  echo "  keep both, or you will not be able to update the app in place"
fi
PW="$(cat "$PWFILE")"

echo "· aligning"
"$ZIPALIGN" -p -f 4 "$OUT/base.apk" "$OUT/aligned.apk"

echo "· signing"
"$APKSIGNER" sign \
  --ks "$KEYSTORE" --ks-pass "pass:$PW" --key-pass "pass:$PW" \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out "$ROOT/Flowlist.apk" "$OUT/aligned.apk"

"$APKSIGNER" verify --print-certs "$ROOT/Flowlist.apk" | head -2

echo
echo "built: $ROOT/Flowlist.apk  ($(wc -c < "$ROOT/Flowlist.apk") bytes)"
