"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { getOrCreateDeviceId } from "@/lib/device-id";

const sessionKey = "wd_visitor_session_id";
const idleOfflineMs = 10 * 60 * 1000;
const heartbeatMs = 30 * 1000;
const activityEvents = ["pointerdown", "keydown", "touchstart", "scroll"] as const;

export function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    let stopped = false;
    let lastActivityAt = Date.now();
    let knownPresence: "online" | "offline" | null = null;
    let idleTimer: number | null = null;
    const isNativeApp = Capacitor.isNativePlatform();

    function getSessionId() {
      let sessionId = window.sessionStorage.getItem(sessionKey);
      if (!sessionId || sessionId.length < 16) {
        sessionId = window.crypto.randomUUID();
        window.sessionStorage.setItem(sessionKey, sessionId);
      }
      return sessionId;
    }

    async function heartbeat(presence: "online" | "offline" = "online", force = false) {
      if (stopped) return;
      if (!force && knownPresence === "offline" && presence === "offline") return;
      knownPresence = presence;
      await fetch("/api/visitors/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getSessionId(),
          deviceId: getOrCreateDeviceId(),
          path: window.location.pathname,
          presence,
        }),
        keepalive: true,
      }).catch(() => undefined);
    }

    function scheduleIdleOffline() {
      if (idleTimer) window.clearTimeout(idleTimer);
      if (isNativeApp) return;
      const remaining = Math.max(0, idleOfflineMs - (Date.now() - lastActivityAt));
      idleTimer = window.setTimeout(() => {
        void heartbeat("offline", true);
      }, remaining);
    }

    function markActive() {
      if (stopped || document.visibilityState === "hidden") return;
      lastActivityAt = Date.now();
      if (knownPresence !== "online") void heartbeat("online", true);
      scheduleIdleOffline();
    }

    function visibilityChanged() {
      if (document.visibilityState === "hidden") {
        void heartbeat("offline", true);
        return;
      }
      lastActivityAt = Date.now();
      void heartbeat("online", true);
      scheduleIdleOffline();
    }

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markActive, { passive: true });
    });
    document.addEventListener("visibilitychange", visibilityChanged);
    function pageHidden() {
      void heartbeat("offline", true);
    }

    window.addEventListener("pagehide", pageHidden);

    void heartbeat();
    scheduleIdleOffline();
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (isNativeApp || Date.now() - lastActivityAt < idleOfflineMs) {
        void heartbeat("online");
      } else {
        void heartbeat("offline");
      }
    }, heartbeatMs);
    return () => {
      window.clearInterval(id);
      if (idleTimer) window.clearTimeout(idleTimer);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markActive);
      });
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pagehide", pageHidden);
      void heartbeat("offline", true);
      stopped = true;
    };
  }, [pathname]);

  return null;
}
