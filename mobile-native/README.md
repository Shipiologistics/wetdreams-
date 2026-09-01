# Kizo Host Native

Bare React Native Android app for Kizo hosts. It shares the production Supabase project and web API contracts with `https://wetdreams.vercel.app`.

## Development

```bash
npm install
npm run start
npm run android
```

The Android application id is `com.wetdreams.app`. Firebase client configuration belongs in `android/app/google-services.json`; no Firebase, Supabase service-role, Agora certificate, or Cloudinary secret is bundled in the app.

## Signed Android Release

The signing keystore is kept outside Git. On this workstation its password is stored in the macOS Keychain under `WetDreamsAndroidKeystore`.

```bash
npm run build:android:release
```

Outputs:

- `android/app/build/outputs/apk/release/app-arm64-v8a-release.apk`
- `android/app/build/outputs/apk/release/app-armeabi-v7a-release.apk`
- `android/app/build/outputs/bundle/release/app-release.aab`

The APK is for direct sideloading. The AAB is for a store submission and cannot be installed directly.
