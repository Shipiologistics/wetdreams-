"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { ChatOpeningShell } from "@/components/chat-opening-shell";
import { formatRelativeTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Account, ChatRoom, Message, ProfileMedia } from "@/lib/view-models";

type ConversationListProps = {
  viewerId: string;
  rooms: ChatRoom[];
  accounts: Account[];
  media: ProfileMedia[];
  messages: Message[];
};

type OpeningChat = {
  href: string;
  name: string;
  username: string;
  avatar?: string | null;
  status: string;
};

export function ConversationList({ viewerId, rooms, accounts, media, messages }: ConversationListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [opening, setOpening] = useState<OpeningChat | null>(null);

  useEffect(() => {
    const roomIds = rooms
      .filter((room) => messages.some((message) => (
        message.room_id === room.id && message.sender_id !== viewerId && !message.delivered_at
      )))
      .map((room) => room.id);

    if (!roomIds.length) return;
    const supabase = createClient();
    void Promise.all(roomIds.map((roomId) => supabase.rpc("mark_room_delivered", { p_room_id: roomId })));
  }, [messages, rooms, viewerId]);

  const conversations = useMemo(() => rooms.map((room) => {
    const otherId = room.user_a === viewerId ? room.user_b : room.user_a;
    const account = accounts.find((item) => item.id === otherId);
    if (!account) return null;
    const avatar = media.find((item) => item.user_id === otherId)?.cloudinary_url;
    const roomMessages = messages.filter((message) => message.room_id === room.id);
    const last = roomMessages[0];
    const unread = roomMessages.filter((message) => message.sender_id !== viewerId && !message.read_at).length;
    const status = account.status === "online"
      ? "online"
      : account.status === "busy" || account.status === "in_call"
        ? "busy"
        : "loading...";

    return { room, account, avatar, last, unread, status, href: `/chat/${room.id}` };
  }).filter(Boolean).sort((first, second) => {
    const firstTime = new Date(first?.last?.created_at ?? first?.room.last_message_at ?? 0).getTime();
    const secondTime = new Date(second?.last?.created_at ?? second?.room.last_message_at ?? 0).getTime();
    return secondTime - firstTime;
  }), [accounts, media, messages, rooms, viewerId]);

  if (opening && opening.href !== pathname) {
    return <ChatOpeningShell name={opening.name} username={opening.username} avatar={opening.avatar} status={opening.status} />;
  }

  return (
    <div className="conversation-list">
      {conversations.map((conversation) => {
        if (!conversation) return null;
        const { room, account, avatar, last, unread, status, href } = conversation;
        return (
          <Link
            href={href}
            prefetch
            className="conversation-row"
            key={room.id}
            onPointerDown={() => router.prefetch(href)}
            onPointerEnter={() => router.prefetch(href)}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              setOpening({ href, name: account.display_name, username: account.username, avatar, status });
              router.push(href, { scroll: false });
            }}
          >
            <span className="avatar-wrap">
              <Avatar name={account.display_name} src={avatar} size={54} />
              <span className={`status-dot ${account.status === "online" ? "online" : account.status === "busy" || account.status === "in_call" ? "busy" : ""}`} />
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
  );
}
