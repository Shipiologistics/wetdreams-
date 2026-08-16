"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { createClient } from "@/lib/supabase/client";

export function NativeAppBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;

    let mounted = true;
    const supabase = createClient();

    async function registerPushToken() {
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== "granted") return;
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
      authSubscription.data.subscription.unsubscribe();
    };
  }, []);

  return null;
}
