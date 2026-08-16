# WetDreams Android Release Notes

## 1.0.0 - Initial sideload release

- User-facing Android app shell for WetDreams.
- Loads the production app at `https://wetdreams.vercel.app`.
- Requests camera and microphone access for Agora audio/video calling.
- Requests Android notification permission for push alerts and incoming-call notifications.
- Registers Firebase Cloud Messaging tokens after sign-in.
- Uses package id `com.wetdreams.app`.
- Uses target SDK 36 and minimum SDK 24.

Known setup requirement:

- Add `android/app/google-services.json` from Firebase before building a push-enabled APK.
