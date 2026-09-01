"use client";

import { useEffect, useRef } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { usePathname, useRouter } from "next/navigation";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { createClient } from "@/lib/supabase/client";

const homePath = "/discover";

export function NativeAppBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;

    let mounted = true;
    const supabase = createClient();

    async function registerPushToken() {
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== "granted") return;
      await PushNotifications.createChannel({
        id: "incoming_calls",
        name: "Incoming calls",
        description: "Kizo incoming call alerts",
        importance: 5,
        visibility: 1,
        sound: "default",
        vibration: true,
      });
      await PushNotifications.createChannel({
        id: "messages",
        name: "Messages",
        description: "Kizo chat message alerts",
        importance: 4,
        visibility: 1,
        sound: "default",
        vibration: true,
      });
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
      const url = typeof notification.data?.url === "string" ? notification.data.url : null;
      if (url?.startsWith("/")) {
        router.push(url);
        return;
      }
      const roomId = typeof notification.data?.roomId === "string" ? notification.data.roomId : null;
      if (roomId) router.push(`/chat/${roomId}`);
    });

    const backButton = CapacitorApp.addListener("backButton", async ({ canGoBack }) => {
      const closeButton = document.querySelector<HTMLButtonElement>(".modal [title='Close']");
      if (closeButton) {
        closeButton.click();
        return;
      }

      const currentPath = pathnameRef.current || window.location.pathname;
      const isHome = currentPath === "/" || currentPath === homePath;
      const randomChatBackButton = document.querySelector<HTMLButtonElement>(".random-chat-back-button");
      if (randomChatBackButton) {
        randomChatBackButton.click();
        return;
      }

      if (isHome) {
        if (window.confirm("Do you want to exit the app?")) {
          await CapacitorApp.exitApp();
        }
        return;
      }

      if (canGoBack && window.history.length > 1) {
        window.history.back();
        return;
      }

      router.replace(homePath);
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
      void backButton.then((listener) => listener.remove());
      authSubscription.data.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
