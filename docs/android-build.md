# Kizo Android Build

The Android app is a Capacitor shell for the production Kizo web app.

## App Identity

- App name: `Kizo`
- Package id: `com.wetdreams.app`
- Version name: `1.0.0`
- Version code: `1`
- Default server URL: `https://wetdreams.vercel.app`

## Required Local Tools

- JDK 21
- Android Studio with Android SDK platform 36
- Android SDK build tools

This machine currently cannot build the APK until Java and the Android SDK are installed.

## Push Notifications

Android push notifications use Firebase Cloud Messaging through Capacitor Push Notifications.

1. Create a Firebase Android app with package id `com.wetdreams.app`.
2. Download `google-services.json`.
3. Place it at `android/app/google-services.json`.
4. Do not commit that file.

The app requests notification permission and registers the FCM token after sign-in. Tokens are saved in `public.push_tokens`.

## Permissions

The Android manifest declares only the permissions needed for the mobile chat/call experience:

- `INTERNET`
- `CAMERA`
- `RECORD_AUDIO`
- `MODIFY_AUDIO_SETTINGS`
- `POST_NOTIFICATIONS`
- `VIBRATE`

Camera and microphone are required for video/audio calls. Notifications are required for push alerts and incoming-call notifications on Android 13+.

## Build Commands

Sync native project:

```bash
npm run android:sync
```

Debug APK:

```bash
npm run android:build:debug
```

Release APK:

```bash
npm run android:build:release
```

For sideloading, use a signed release APK, not a debug APK. Keep the signing key private and reuse it for future updates, otherwise Android will not install upgrades over the previous version.

## Play Protect Notes

No build can guarantee that Play Protect will never warn on sideload. To reduce risk:

- use the normal Android Gradle build system,
- keep permissions minimal and explain them clearly,
- sign release APKs with a stable private key,
- avoid obfuscators, downloaders, hidden installers, or background abuse,
- host downloads from a trusted HTTPS domain,
- keep version name/code accurate.
