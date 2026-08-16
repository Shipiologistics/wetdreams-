"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MessageCircle, Phone, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { messageForError } from "@/lib/format";

export function HostProfileActions({
  hostId,
  username,
  viewerId,
  busy,
}: {
  hostId: string;
  username: string;
  viewerId: string | null;
  busy: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"chat" | "audio" | "video" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const self = viewerId === hostId;

  async function getRoom() {
    const { data, error: roomError } = await createClient().rpc("create_or_get_direct_room", {
      p_target_user: hostId,
    });
    if (roomError) throw roomError;
    return data;
  }

  async function openChat() {
    if (!viewerId) {
      router.push(`/login?next=/u/${username}`);
      return;
    }
    if (self) return;
    setPending("chat");
    setError(null);
    try {
      const room = await getRoom();
      router.push(`/chat/${room}`);
    } catch (caught) {
      setError(messageForError(caught instanceof Error ? caught.message : "Could not open chat."));
      setPending(null);
    }
  }

  async function startCall(type: "audio" | "video") {
    if (!viewerId) {
      router.push(`/login?next=/u/${username}`);
      return;
    }
    if (self || busy) return;
    setPending(type);
    setError(null);
    try {
      const room = await getRoom();
      const { error: callError } = await createClient().rpc("start_call", { p_room_id: room, p_call_type: type });
      if (callError) throw callError;
      router.push(`/chat/${room}?call=${type}`);
    } catch (caught) {
      setError(messageForError(caught instanceof Error ? caught.message : "Could not start call."));
      setPending(null);
    }
  }

  return (
    <div className="host-profile-actions">
      <div>
        <button className="button primary large" type="button" onClick={openChat} disabled={!!pending || self}>
          {pending === "chat" ? <LoaderCircle className="spin" size={20} /> : <MessageCircle size={20} />}
          Message
        </button>
        <button className="icon-button bordered" type="button" title={busy ? "Busy" : "Audio call"} onClick={() => startCall("audio")} disabled={!!pending || busy || self}>
          {pending === "audio" ? <LoaderCircle className="spin" size={19} /> : <Phone size={19} />}
        </button>
        <button className="icon-button bordered" type="button" title={busy ? "Busy" : "Video call"} onClick={() => startCall("video")} disabled={!!pending || busy || self}>
          {pending === "video" ? <LoaderCircle className="spin" size={19} /> : <Video size={19} />}
        </button>
      </div>
      {error && <p className="card-error" role="alert">{error}</p>}
    </div>
  );
}
