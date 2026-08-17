"use client";

import { useEffect, useLayoutEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export const recoveryKey = "wetdreams:discover-session-recovery";
export const justAuthenticatedKey = "wetdreams:discover-just-authenticated";
const recoveringClass = "wetdreams-auth-recovering";
const recoveryCooldownMs = 5_000;
const inlineAuthEvent = "wetdreams:inline-auth-started";

export function markDiscoverAuthRecovering() {
  try {
    window.sessionStorage.setItem(justAuthenticatedKey, String(Date.now()));
    document.documentElement.classList.add(recoveringClass);
  } catch {
    // Browser storage can be unavailable in private modes; recovery still works after hydration.
  }
}

export function DiscoverSessionRecovery() {
  useLayoutEffect(() => {
    if (window.sessionStorage.getItem(justAuthenticatedKey)) {
      document.documentElement.classList.add(recoveringClass);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let recovering = false;
    let inlineAuthStarted = false;

    async function recoverSignedInView() {
      if (!active || recovering || inlineAuthStarted) return;

      const { data, error } = await createClient().auth.getSession();
      if (error || !data.session || !active || inlineAuthStarted) {
        document.documentElement.classList.remove(recoveringClass);
        window.sessionStorage.removeItem(justAuthenticatedKey);
        return;
      }

      const lastRecovery = Number(window.sessionStorage.getItem(recoveryKey) ?? 0);
      if (Date.now() - lastRecovery < recoveryCooldownMs) return;

      recovering = true;
      window.sessionStorage.setItem(recoveryKey, String(Date.now()));
      window.location.replace("/discover");
    }

    const handleInlineAuth = () => {
      inlineAuthStarted = true;
    };
    window.addEventListener(inlineAuthEvent, handleInlineAuth);
    void recoverSignedInView();
    const handlePageShow = () => void recoverSignedInView();
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      active = false;
      window.removeEventListener(inlineAuthEvent, handleInlineAuth);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return null;
}
