"use client";

import { createClient } from "@/lib/supabase/client";

const deviceKey = "p2c_device_id";
const maxAge = 60 * 60 * 24 * 400;

export function getOrCreateDeviceId() {
  let deviceId = window.localStorage.getItem(deviceKey) ?? readDeviceCookie();
  if (!deviceId || deviceId.length < 16) deviceId = window.crypto.randomUUID();
  window.localStorage.setItem(deviceKey, deviceId);
  document.cookie = `${deviceKey}=${encodeURIComponent(deviceId)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  return deviceId;
}

export async function registerCurrentDevice() {
  const deviceId = getOrCreateDeviceId();
  const { error } = await createClient().rpc("register_device", { p_device_id: deviceId });
  if (error) throw error;
}

function readDeviceCookie() {
  const value = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${deviceKey}=`))
    ?.split("=")[1];
  return value ? decodeURIComponent(value) : null;
}
