"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const recoveryKey = "wetdreams:discover-session-recovery";
const recoveryCooldownMs = 5_000;
const inlineAuthEvent = "wetdreams:inline-auth-started";

export function DiscoverSessionRecovery() {
  useEffect(() => {
    let active = true;
    let recovering = false;
    let inlineAuthStarted = false;

    async function recoverSignedInView() {
      if (!active || recovering || inlineAuthStarted) return;

      const { data, error } = await createClient().auth.getSession();
      if (error || !data.session || !active || inlineAuthStarted) return;

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
