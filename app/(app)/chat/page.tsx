import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircleMore, Plus } from "lucide-react";
import { ConversationList } from "@/components/conversation-list";
import { EmptyState } from "@/components/empty-state";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chats" };

export default async function ChatsPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data: rooms } = await supabase
    .from("chat_rooms")
    .select("*")
    .or(`user_a.eq.${viewer.id},user_b.eq.${viewer.id}`)
    .eq("status", "active")
    .neq("room_type", "random")
    .order("last_message_at", { ascending: false })
    .limit(80);

  const otherIds = Array.from(new Set((rooms ?? []).map((room) => room.user_a === viewer.id ? room.user_b : room.user_a)));
  const roomIds = (rooms ?? []).map((room) => room.id);
  const now = new Date().toISOString();
  const [{ data: accounts }, { data: media }, { data: messages }, unreadResult] = rooms?.length
    ? await Promise.all([
        supabase.from("users").select("*").in("id", otherIds),
        supabase.from("profile_media").select("*").in("user_id", otherIds).eq("is_primary", true),
        supabase.from("messages").select("*").in("room_id", roomIds).gt("expires_at", now).order("created_at", { ascending: false }).limit(250),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .in("room_id", roomIds)
          .neq("sender_id", viewer.id)
          .is("read_at", null)
          .gt("expires_at", now),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { count: 0 }];

  const unreadTotal = unreadResult.count ?? 0;

  return (
    <div className="page-shell narrow-page">
      <header className="page-header app-page-header">
        <div>
          <span className="eyebrow">Your conversations</span>
          <h1>Chats</h1>
        </div>
        <div className="chat-header-actions">
          {unreadTotal > 0 && (
            <span className="chat-unread-pill" aria-label={`${unreadTotal} unread messages`}>
              {unreadTotal > 99 ? "99+" : unreadTotal} unread
            </span>
          )}
          <Link href="/discover" className="icon-button bordered" title="Start a conversation"><Plus size={20} /></Link>
        </div>
      </header>

      {(rooms ?? []).length ? (
        <ConversationList
          viewerId={viewer.id}
          rooms={rooms ?? []}
          accounts={accounts ?? []}
          media={media ?? []}
          messages={messages ?? []}
        />
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
