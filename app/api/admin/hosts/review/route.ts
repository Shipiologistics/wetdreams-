import { authenticateApiRequest } from "@/lib/api-auth";
import { firebaseConfigured, sendFcmMessage } from "@/lib/firebase-admin";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewBody =
  | { action: "review_request"; requestId: string; approve: boolean; notes?: string }
  | { action: "set_verification"; userId: string; verified: boolean; notes?: string };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as ReviewBody | null;
  if (!body || !isReviewBody(body)) {
    return Response.json({ error: "INVALID_REVIEW_REQUEST" }, { status: 400 });
  }

  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const notes =
    typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
  let targetUserId: string | null = body.action === "set_verification" ? body.userId : null;
  const approving = body.action === "review_request" ? body.approve : body.verified;
  const admin = createServiceClient();

  if (body.action === "review_request") {
    const { data: hostRequest, error: hostRequestError } = await admin
      .from("host_requests")
      .select("user_id")
      .eq("id", body.requestId)
      .maybeSingle();
    if (hostRequestError) {
      return Response.json({ error: hostRequestError.message }, { status: 500 });
    }
    targetUserId = hostRequest?.user_id ?? null;
  }

  const { data: currentHost, error: currentHostError } = targetUserId
    ? await admin
        .from("users")
        .select("is_verified")
        .eq("id", targetUserId)
        .maybeSingle()
    : { data: null, error: null };
  if (currentHostError) {
    return Response.json({ error: currentHostError.message }, { status: 500 });
  }

  if (body.action === "review_request") {
    const { error } = await auth.client.rpc("admin_review_host_request", {
      p_request_id: body.requestId,
      p_approve: body.approve,
      p_notes: notes,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await auth.client.rpc("admin_set_user_verification", {
      p_target_user: body.userId,
      p_verified: body.verified,
      p_notes: notes,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
  }

  const notification = approving && currentHost?.is_verified === false && targetUserId
    ? await notifyHostApproval(admin, targetUserId)
    : { notified: false, sent: 0, disabled: 0 };

  return Response.json({ reviewed: true, ...notification });
}

function isReviewBody(body: ReviewBody) {
  if (body.action === "review_request") {
    return typeof body.requestId === "string" && body.requestId.length > 0 && typeof body.approve === "boolean";
  }
  if (body.action === "set_verification") {
    return typeof body.userId === "string" && body.userId.length > 0 && typeof body.verified === "boolean";
  }
  return false;
}

async function notifyHostApproval(admin: ReturnType<typeof createServiceClient>, userId: string) {
  const { data: host } = await admin
    .from("users")
    .select("id, role, gender, is_guest, is_verified")
    .eq("id", userId)
    .maybeSingle();

  if (!host || host.role !== "user" || host.gender !== "female" || host.is_guest || !host.is_verified) {
    return { notified: false, sent: 0, disabled: 0 };
  }

  const { error: notificationError } = await admin.from("app_notifications").insert({
    user_id: userId,
    type: "system",
    title: "You are approved to host",
    body: "You can start hosting now. Set your chat, audio, and video rates, or keep the defaults.",
    href: "/profile#rates",
    metadata: { destination: "host_rates" },
  });
  if (notificationError) {
    console.warn("Host approval in-app notification failed", notificationError.message);
    return { notified: false, sent: 0, disabled: 0 };
  }

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("token")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("last_seen_at", { ascending: false })
    .limit(5);

  if (!tokens?.length || !firebaseConfigured()) return { notified: true, sent: 0, disabled: 0 };

  let sent = 0;
  const deadTokens: string[] = [];
  await Promise.all(tokens.map(async ({ token }) => {
    try {
      await sendFcmMessage({
        token,
        title: "You are approved to host",
        body: "You can start hosting now. Set your chat, audio, and video rates, or keep the defaults.",
        channelId: "messages",
        collapseKey: `host-approved:${userId}`,
        notification: false,
        clickAction: "OPEN_PROFILE",
        data: {
          type: "host_approved",
          url: "/profile#rates",
          destination: "host_rates",
        },
      });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNREGISTERED") || message.includes("INVALID_ARGUMENT")) {
        deadTokens.push(token);
      } else {
        console.warn("FCM host approval notification failed", message);
      }
    }
  }));

  if (deadTokens.length) {
    await admin.from("push_tokens").update({ enabled: false }).in("token", deadTokens);
  }

  return { notified: true, sent, disabled: deadTokens.length };
}
