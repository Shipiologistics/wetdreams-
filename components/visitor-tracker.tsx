"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getOrCreateDeviceId } from "@/lib/device-id";

const sessionKey = "wd_visitor_session_id";

export function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    let stopped = false;

    function getSessionId() {
      let sessionId = window.sessionStorage.getItem(sessionKey);
      if (!sessionId || sessionId.length < 16) {
        sessionId = window.crypto.randomUUID();
        window.sessionStorage.setItem(sessionKey, sessionId);
      }
      return sessionId;
    }

    async function heartbeat() {
      if (stopped) return;
      await fetch("/api/visitors/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getSessionId(),
          deviceId: getOrCreateDeviceId(),
          path: window.location.pathname,
        }),
        keepalive: true,
      }).catch(() => undefined);
    }

    void heartbeat();
    const id = window.setInterval(heartbeat, 30000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [pathname]);

  return null;
}
