import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircleMore, Plus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { requireViewer } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chats" };

export default async function ChatsPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data: rooms } = await supabase
    .from("chat_rooms")
    .select("*")
    .order("last_message_at", { ascending: false });

  const otherIds = (rooms ?? []).map((room) => room.user_a === viewer.id ? room.user_b : room.user_a);
  const roomIds = (rooms ?? []).map((room) => room.id);
  const [{ data: accounts }, { data: media }, { data: messages }] = rooms?.length
    ? await Promise.all([
        supabase.from("users").select("*").in("id", otherIds),
        supabase.from("profile_media").select("*").in("user_id", otherIds).eq("is_primary", true),
        supabase.from("messages").select("*").in("room_id", roomIds).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(250),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  return (
    <div className="page-shell narrow-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Your conversations</span>
          <h1>Chats</h1>
        </div>
        <Link href="/discover" className="icon-button bordered" title="Start a conversation"><Plus size={20} /></Link>
      </header>

      {(rooms ?? []).length ? (
        <div className="conversation-list">
          {(rooms ?? []).map((room) => {
            const otherId = room.user_a === viewer.id ? room.user_b : room.user_a;
            const account = (accounts ?? []).find((item) => item.id === otherId);
            if (!account) return null;
            const avatar = (media ?? []).find((item) => item.user_id === otherId)?.cloudinary_url;
            const roomMessages = (messages ?? []).filter((message) => message.room_id === room.id);
            const last = roomMessages[0];
            const unread = roomMessages.filter((message) => message.sender_id !== viewer.id && !message.read_at).length;
            return (
              <Link href={`/chat/${room.id}`} className="conversation-row" key={room.id}>
                <span className="avatar-wrap">
                  <Avatar name={account.display_name} src={avatar} size={54} />
                  <span className={`status-dot ${account.status === "online" ? "online" : ""}`} />
                </span>
                <span className="conversation-copy">
                  <span className="conversation-title">
                    <strong>{account.display_name}</strong>
                    <time>{formatRelativeTime(room.last_message_at)}</time>
                  </span>
                  <span className="conversation-preview">
                    {last ? (last.message_type === "text" || last.message_type === "emoji" ? last.content : `Sent ${last.message_type}`) : "Start the conversation"}
                  </span>
                </span>
                {unread > 0 && <span className="unread-badge">{unread > 9 ? "9+" : unread}</span>}
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={MessageCircleMore}
          title="No conversations yet"
          body="Your next good conversation is waiting in Discover."
          action={<Link className="button primary" href="/discover">Meet someone</Link>}
        />
      )}
    </div>
  );
}
