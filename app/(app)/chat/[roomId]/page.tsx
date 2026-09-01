import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/chat-room";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Conversation" };

export default async function ChatRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const viewer = await requireViewer();
  const supabase = await createClient();

  const { data: room } = await supabase.from("chat_rooms").select("*").eq("id", roomId).maybeSingle();
  if (!room || room.status !== "active") notFound();

  const otherId = room.user_a === viewer.id ? room.user_b : room.user_a;
  const readAt = new Date().toISOString();
  await Promise.all([
    supabase.rpc("mark_room_read", { p_room_id: roomId }),
    supabase
      .from("app_notifications")
      .update({ read_at: readAt })
      .eq("user_id", viewer.id)
      .eq("href", `/chat/${roomId}`)
      .is("read_at", null),
    supabase
      .from("app_notifications")
      .update({ read_at: readAt })
      .eq("user_id", viewer.id)
      .filter("metadata->>room_id", "eq", roomId)
      .is("read_at", null),
  ]);

  const [{ data: account }, { data: profile }, { data: media }, { data: messages }, { data: calls }, { data: blockState }] = await Promise.all([
    supabase.from("users").select("*").eq("id", otherId).single(),
    supabase.from("profiles").select("*").eq("user_id", otherId).single(),
    supabase.from("profile_media").select("*").eq("user_id", otherId).order("position"),
    supabase.from("messages").select("*").eq("room_id", roomId).gt("expires_at", new Date().toISOString()).order("created_at").limit(200),
    supabase.from("calls").select("*").eq("room_id", roomId).in("status", ["ringing", "ongoing"]).order("created_at", { ascending: false }).limit(1),
    supabase.rpc("get_room_block_state", { p_room_id: roomId }).maybeSingle(),
  ]);

  if (!account || !profile) notFound();

  return (
    <ChatRoom
      viewerId={viewer.id}
      viewerGender={viewer.account.gender}
      viewerIsHost={viewer.account.is_verified}
      initialCoins={Number(viewer.wallet.coins_balance)}
      initialBeans={viewer.account.is_verified ? Number(viewer.wallet.beans_balance) : 0}
      room={room}
      other={account}
      profile={profile}
      media={media ?? []}
      initialMessages={messages ?? []}
      initialCall={calls?.[0] ?? null}
      initialBlockState={{
        viewerBlockedOther: blockState?.viewer_blocked_other ?? false,
        otherBlockedViewer: blockState?.other_blocked_viewer ?? false,
      }}
    />
  );
}
