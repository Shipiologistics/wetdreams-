import { createHash, createHmac } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const guestEmailDomain = "guest.wetdreams.local";

export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  const guestSecret = process.env.GUEST_AUTH_SECRET ?? process.env.CHAT_CLEANUP_SECRET ?? process.env.CRON_SECRET;

  if (!serviceKey || !guestSecret) {
    return NextResponse.json({ error: "GUEST_AUTH_NOT_CONFIGURED" }, { status: 500 });
  }

  const payload = await request.json().catch(() => null) as { deviceId?: unknown; location?: unknown } | null;
  const deviceId = typeof payload?.deviceId === "string" ? payload.deviceId.trim() : "";
  const location = typeof payload?.location === "string" ? payload.location.trim() : "";

  if (deviceId.length < 16 || deviceId.length > 200) {
    return NextResponse.json({ error: "INVALID_DEVICE" }, { status: 400 });
  }
  if (location.length > 100) {
    return NextResponse.json({ error: "INVALID_LOCATION" }, { status: 400 });
  }

  const admin = createAdminClient(serviceKey);
  const deviceHash = hashDeviceId(deviceId);

  const { data: isBanned, error: banError } = await admin.rpc("is_device_banned", { p_device_id: deviceId });
  if (banError) return NextResponse.json({ error: banError.message }, { status: 500 });
  if (isBanned) return NextResponse.json({ error: "DEVICE_BANNED" }, { status: 403 });

  const email = guestEmail(deviceHash);
  const password = guestPassword(deviceId, guestSecret);
  let mappedUserId: string | null;
  try {
    mappedUserId = await findMappedGuestUser(admin, deviceHash);
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "GUEST_CREATE_FAILED" },
      { status: 500 },
    );
  }

  if (!mappedUserId && !location) {
    return NextResponse.json({ error: "LOCATION_REQUIRED" }, { status: 400 });
  }

  let userId: string;
  try {
    userId = mappedUserId ?? await createGuestUser(admin, email, password);
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "GUEST_CREATE_FAILED" },
      { status: 500 },
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("location")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!location && !profile?.location) {
    return NextResponse.json({ error: "LOCATION_REQUIRED" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: userError } = await admin
    .from("users")
    .update({ display_name: "Guest", gender: "male", is_guest: true, updated_at: now })
    .eq("id", userId);
  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    password,
    user_metadata: { display_name: "Guest", gender: "male", is_guest: true },
    app_metadata: { is_guest: true },
  });
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

  const { error: deviceError } = await admin
    .from("guest_devices")
    .upsert({ device_hash: deviceHash, user_id: userId, last_seen_at: now }, { onConflict: "device_hash" });
  if (deviceError) return NextResponse.json({ error: deviceError.message }, { status: 500 });

  if (location && location !== profile?.location) {
    const { error: locationError } = await admin
      .from("profiles")
      .update({ location })
      .eq("user_id", userId);
    if (locationError) return NextResponse.json({ error: locationError.message }, { status: 500 });
  }

  return NextResponse.json({ email, password });
}

function hashDeviceId(deviceId: string) {
  return createHash("sha256").update(deviceId).digest("hex");
}

function guestEmail(deviceHash: string) {
  return `guest_${deviceHash.slice(0, 40)}@${guestEmailDomain}`;
}

function guestPassword(deviceId: string, secret: string) {
  return `${createHmac("sha256", secret).update(deviceId).digest("base64url")}Aa1!`;
}

function createAdminClient(serviceKey: string) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function findMappedGuestUser(admin: AdminClient, deviceHash: string) {
  const { data: mapping, error } = await admin
    .from("guest_devices")
    .select("user_id")
    .eq("device_hash", deviceHash)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!mapping?.user_id) return null;

  const { data, error: userError } = await admin.auth.admin.getUserById(mapping.user_id);
  if (userError || !data.user) return null;
  return mapping.user_id as string;
}

async function createGuestUser(admin: AdminClient, email: string, password: string) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Guest", gender: "male", is_guest: true },
    app_metadata: { is_guest: true },
  });

  if (!created.error && created.data.user) return created.data.user.id;

  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = listed.data?.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;

  throw new Error(created.error?.message ?? "GUEST_CREATE_FAILED");
}
