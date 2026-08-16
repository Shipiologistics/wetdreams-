"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useRouter } from "next/navigation";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { createClient } from "@/lib/supabase/client";

export function NativeAppBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;

    let mounted = true;
    const supabase = createClient();
    const pushEnabled = process.env.NEXT_PUBLIC_ANDROID_PUSH_ENABLED === "true";

    async function registerPushToken() {
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== "granted") return;
      if (!pushEnabled) {
        console.info("Android notification permission is granted. Push token registration is disabled until the push provider is configured.");
        return;
      }
      await PushNotifications.register();
    }

    const registration = PushNotifications.addListener("registration", async ({ value }) => {
      if (!mounted) return;
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      await supabase.rpc("register_push_token", {
        p_token: value,
        p_device_id: getOrCreateDeviceId(),
        p_platform: "android",
      });
    });

    const registrationError = PushNotifications.addListener("registrationError", (error) => {
      console.warn("Push registration failed", error);
    });

    const actionPerformed = PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const roomId = typeof notification.data?.roomId === "string" ? notification.data.roomId : null;
      if (roomId) router.push(`/chat/${roomId}`);
    });

    void registerPushToken().catch((error) => {
      console.warn("Push permission request failed", error);
    });

    const authSubscription = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void registerPushToken().catch(() => undefined);
      }
    });

    return () => {
      mounted = false;
      void registration.then((listener) => listener.remove());
      void registrationError.then((listener) => listener.remove());
      void actionPerformed.then((listener) => listener.remove());
      authSubscription.data.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
