import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { firebaseConfigured, sendFcmMessage } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { messageId?: string } | null;
  if (!body?.messageId) return Response.json({ error: "MESSAGE_REQUIRED" }, { status: 400 });

  const userClient = await createClient();
  const { data: claims } = await userClient.auth.getClaims();
  const senderId = claims?.claims?.sub;
  if (!senderId) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const admin = createServiceClient();
  const { data: message, error: messageError } = await admin
    .from("messages")
    .select("id, room_id, sender_id, message_type, content, expires_at")
    .eq("id", body.messageId)
    .single();
  if (messageError || !message) return Response.json({ error: "MESSAGE_NOT_FOUND" }, { status: 404 });
  if (message.sender_id !== senderId) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (new Date(message.expires_at).getTime() <= Date.now()) return Response.json({ skipped: true, reason: "expired" });

  const { data: room, error: roomError } = await admin
    .from("chat_rooms")
    .select("id, user_a, user_b, room_type, status")
    .eq("id", message.room_id)
    .single();
  if (roomError || !room) return Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
  if (room.room_type === "random") return Response.json({ skipped: true, reason: "ephemeral_random_room" });
  if (room.status !== "active") return Response.json({ skipped: true, reason: "room_not_active" });

  const receiverId = room.user_a === senderId ? room.user_b : room.user_b === senderId ? room.user_a : null;
  if (!receiverId || receiverId === senderId) return Response.json({ skipped: true, reason: "no_receiver" });

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("token")
    .eq("user_id", receiverId)
    .eq("enabled", true)
    .order("last_seen_at", { ascending: false })
    .limit(5);

  if (!tokens?.length) return Response.json({ sent: 0, reason: "no_tokens" });
  if (!firebaseConfigured()) return Response.json({ sent: 0, reason: "firebase_not_configured" });

  const { data: sender } = await admin
    .from("users")
    .select("display_name")
    .eq("id", senderId)
    .single();

  const title = sender?.display_name ?? "New message";
  const bodyText = messageBody(message.message_type, message.content);
  let sent = 0;
  const deadTokens: string[] = [];

  await Promise.all(tokens.map(async ({ token }) => {
    try {
      await sendFcmMessage({
        token,
        title,
        body: bodyText,
        channelId: "messages",
        collapseKey: `room:${room.id}`,
        clickAction: "OPEN_CHAT",
        data: {
          type: "chat_message",
          messageId: message.id,
          roomId: room.id,
          url: `/chat/${room.id}`,
          senderId,
          senderName: title,
        },
      });
      sent += 1;
    } catch (error) {
      const notificationError = error instanceof Error ? error.message : "";
      if (notificationError.includes("UNREGISTERED") || notificationError.includes("INVALID_ARGUMENT")) {
        deadTokens.push(token);
      } else {
        console.warn("FCM message notification failed", notificationError);
      }
    }
  }));

  if (deadTokens.length) {
    await admin.from("push_tokens").update({ enabled: false }).in("token", deadTokens);
  }

  if (sent > 0) {
    await admin
      .from("messages")
      .update({ delivered_at: new Date().toISOString() })
      .eq("id", message.id)
      .is("delivered_at", null);
  }

  return Response.json({ sent, disabled: deadTokens.length, delivered: sent > 0 });
}

function messageBody(messageType: string, content: string | null) {
  if (messageType === "text") return (content?.trim() || "New message").slice(0, 140);
  if (messageType === "emoji") return content?.trim() || "Sent an emoji";
  if (messageType === "image") return "Sent a photo";
  if (messageType === "video") return "Sent a video";
  return "New message";
}
