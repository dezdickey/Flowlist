#!/bin/bash
# ============================================================
# Flowlist — fetch what is needed to build the APK
#
# Everything lands in ./toolchain and nowhere else: no installer, no
# registry entries, no PATH changes, nothing outside this folder. Delete
# the folder and the machine is exactly as it was.
#
# What it fetches, and roughly what it costs on disk:
#
#     Temurin JDK 17            ~330 MB   javac, jar, keytool
#     Android command-line tools ~200 MB   sdkmanager, and the fetcher
#     platform android-34        ~85 MB    android.jar to compile against
#     build-tools 34.0.0         ~60 MB    aapt2, d8, zipalign, apksigner
#
# About 700 MB settled, and it needs roughly twice that while unpacking.
# ============================================================
set -e
cd "$(dirname "$0")"
TC="$(pwd)/toolchain"
mkdir -p "$TC"

JDK_URL="https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk"
CLT_URL="https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"

have () { [ -e "$1" ]; }

# ---------- JDK ----------
if have "$TC/jdk/bin/javac.exe" || have "$TC/jdk/bin/javac"; then
  echo "· jdk already here"
else
  echo "· fetching the jdk"
  curl -L --fail --progress-bar "$JDK_URL" -o "$TC/jdk.zip"
  echo "· unpacking"
  ( cd "$TC" && unzip -q -o jdk.zip )
  # it unpacks as jdk-17.x.y+z; give it a stable name
  d="$(find "$TC" -maxdepth 1 -type d -name 'jdk-*' | head -1)"
  [ -n "$d" ] || { echo "could not find the unpacked jdk" >&2; exit 1; }
  mv "$d" "$TC/jdk"
  rm -f "$TC/jdk.zip"
fi
export JAVA_HOME="$TC/jdk"
"$JAVA_HOME/bin/javac" -version

# ---------- Android command-line tools ----------
SDK="$TC/sdk"
if have "$SDK/cmdline-tools/latest/bin/sdkmanager.bat"; then
  echo "· sdk tools already here"
else
  echo "· fetching the android command-line tools"
  mkdir -p "$SDK/cmdline-tools"
  curl -L --fail --progress-bar "$CLT_URL" -o "$TC/clt.zip"
  echo "· unpacking"
  ( cd "$SDK/cmdline-tools" && unzip -q -o "$TC/clt.zip" && rm -rf latest && mv cmdline-tools latest )
  rm -f "$TC/clt.zip"
fi

SDKMAN="$SDK/cmdline-tools/latest/bin/sdkmanager.bat"
[ -f "$SDKMAN" ] || SDKMAN="$SDK/cmdline-tools/latest/bin/sdkmanager"

# ---------- the two packages that matter ----------
echo "· accepting the sdk licences"
yes | "$SDKMAN" --sdk_root="$SDK" --licenses >/dev/null 2>&1 || true

echo "· fetching platform 34 and build-tools 34"
"$SDKMAN" --sdk_root="$SDK" "platforms;android-34" "build-tools;34.0.0"

echo
echo "ready. toolchain is $(du -sh "$TC" 2>/dev/null | cut -f1) in $TC"
echo "now run ./build-apk.sh"
