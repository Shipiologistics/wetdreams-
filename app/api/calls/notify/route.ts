import { authenticateApiRequest } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { firebaseConfigured, sendFcmMessage } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { callId?: string } | null;
  if (!body?.callId) return Response.json({ error: "CALL_REQUIRED" }, { status: 400 });

  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const callerId = auth.userId;

  const admin = createServiceClient();
  const { data: call, error: callError } = await admin
    .from("calls")
    .select("id, room_id, caller_id, receiver_id, call_type, status")
    .eq("id", body.callId)
    .single();
  if (callError || !call) return Response.json({ error: "CALL_NOT_FOUND" }, { status: 404 });
  if (call.caller_id !== callerId) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (call.status !== "ringing") return Response.json({ skipped: true, reason: "not_ringing" });

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("token")
    .eq("user_id", call.receiver_id)
    .eq("enabled", true)
    .order("last_seen_at", { ascending: false })
    .limit(5);

  if (!tokens?.length) return Response.json({ sent: 0, reason: "no_tokens" });
  if (!firebaseConfigured()) return Response.json({ sent: 0, reason: "firebase_not_configured" });

  const [{ data: caller }, { data: callerMedia }] = await Promise.all([
    admin.from("users").select("display_name").eq("id", call.caller_id).single(),
    admin
      .from("profile_media")
      .select("cloudinary_url")
      .eq("user_id", call.caller_id)
      .eq("is_primary", true)
      .maybeSingle(),
  ]);

  let sent = 0;
  const deadTokens: string[] = [];
  await Promise.all(tokens.map(async ({ token }) => {
    try {
      await sendFcmMessage({
        token,
        title: `Incoming ${call.call_type} call`,
        body: caller?.display_name ?? "WetDreams call",
        channelId: "incoming_calls",
        collapseKey: `call:${call.id}`,
        notification: false,
        data: {
          type: "incoming_call",
          callId: call.id,
          roomId: call.room_id,
          url: `/chat/${call.room_id}`,
          callType: call.call_type,
          callerName: caller?.display_name ?? "WetDreams",
          callerImage: callerMedia?.cloudinary_url ?? "",
        },
      });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNREGISTERED") || message.includes("INVALID_ARGUMENT")) {
        deadTokens.push(token);
      } else {
        console.warn("FCM call notification failed", message);
      }
    }
  }));

  if (deadTokens.length) {
    await admin.from("push_tokens").update({ enabled: false }).in("token", deadTokens);
  }

  return Response.json({ sent, disabled: deadTokens.length });
}
