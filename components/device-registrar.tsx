"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerCurrentDevice } from "@/lib/device-id";

export function DeviceRegistrar() {
  const router = useRouter();

  useEffect(() => {
    registerCurrentDevice().catch(async (caught) => {
      if (caught instanceof Error && caught.message.includes("DEVICE_BANNED")) {
        await createClient().auth.signOut();
        router.push("/device-banned");
      }
    });
  }, [router]);

  return null;
}
