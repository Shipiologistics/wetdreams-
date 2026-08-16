import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.wetdreams.app",
  appName: "WetDreams",
  webDir: "android-web",
  server: {
    url: process.env.CAPACITOR_SERVER_URL ?? "https://wetdreams.vercel.app",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    buildOptions: {
      releaseType: "APK",
    },
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
