#!/usr/bin/env bash

set -euo pipefail

export JAVA_HOME="${JAVA_HOME:-/Users/a/.local/jdks/amazon-corretto-21.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export WETDREAMS_KEYSTORE_FILE="${WETDREAMS_KEYSTORE_FILE:-$HOME/.wetdreams-signing/wetdreams-release.jks}"
export WETDREAMS_KEY_ALIAS="${WETDREAMS_KEY_ALIAS:-wetdreams-release}"

if [[ -z "${WETDREAMS_KEYSTORE_PASSWORD:-}" ]]; then
  WETDREAMS_KEYSTORE_PASSWORD="$(security find-generic-password -a "$USER" -s WetDreamsAndroidKeystore -w)"
  export WETDREAMS_KEYSTORE_PASSWORD
fi
export WETDREAMS_KEY_PASSWORD="${WETDREAMS_KEY_PASSWORD:-$WETDREAMS_KEYSTORE_PASSWORD}"

cd "$(dirname "$0")/../android"
./gradlew clean assembleRelease -PsplitApks=true -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
./gradlew bundleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
