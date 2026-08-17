import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { destroyCloudinaryAsset, isCloudinaryConfigured } from "@/lib/cloudinary";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExpiredMessage = Database["public"]["Functions"]["get_expired_chat_messages_for_cleanup"]["Returns"][number];

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length);
  return request.nextUrl.searchParams.get("secret");
}

export async function GET(request: NextRequest) {
  const cleanupSecret = process.env.CHAT_CLEANUP_SECRET ?? process.env.CRON_SECRET;
  const providedSecret = getBearerToken(request);

  if (!cleanupSecret || providedSecret !== cleanupSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 500);
  const { data: expired, error: listError } = await supabase.rpc("get_expired_chat_messages_for_cleanup", {
    p_secret: cleanupSecret,
    p_limit: Number.isFinite(limit) ? limit : 500,
  });

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  const deletableIds: string[] = [];
  const cloudinaryFailures: Array<{ id: string; reason: string }> = [];
  let cloudinaryDeleted = 0;
  let cloudinarySkipped = 0;

  for (const message of expired ?? []) {
    const asset = getCloudinaryAsset(message);
    if (!asset) {
      deletableIds.push(message.id);
      continue;
    }

    if (!isCloudinaryConfigured()) {
      cloudinarySkipped += 1;
      cloudinaryFailures.push({ id: message.id, reason: "Cloudinary credentials missing" });
      continue;
    }

    try {
      await destroyCloudinaryAsset(asset);
      cloudinaryDeleted += 1;
      deletableIds.push(message.id);
    } catch (caught) {
      cloudinaryFailures.push({
        id: message.id,
        reason: caught instanceof Error ? caught.message : "Cloudinary cleanup failed",
      });
    }
  }

  let deleted = 0;
  if (deletableIds.length > 0) {
    const { data, error: deleteError } = await supabase.rpc("delete_expired_chat_messages", {
      p_secret: cleanupSecret,
      p_message_ids: deletableIds,
    });

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
    deleted = data ?? 0;
  }

  const notificationCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: notificationsDeleted, error: notificationsDeleteError } = await createServiceClient()
    .from("app_notifications")
    .delete({ count: "exact" })
    .lt("created_at", notificationCutoff);

  if (notificationsDeleteError) {
    return NextResponse.json({ error: notificationsDeleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    scanned: expired?.length ?? 0,
    deleted,
    notificationsDeleted: notificationsDeleted ?? 0,
    cloudinaryDeleted,
    cloudinarySkipped,
    cloudinaryFailed: cloudinaryFailures.length,
    failures: cloudinaryFailures.slice(0, 10),
  });
}

function getCloudinaryAsset(message: ExpiredMessage) {
  if (!message.cloudinary_public_id || !message.cloudinary_resource_type) return null;
  return {
    publicId: message.cloudinary_public_id,
    resourceType: message.cloudinary_resource_type,
  };
}
