"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MessageCircle, Phone, Video } from "lucide-react";
import { CoinTopupModal } from "@/components/coin-topup-modal";
import { notifyIncomingCall } from "@/lib/call-notifications";
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
  const [topupOpen, setTopupOpen] = useState(false);
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
      setError(messageForError(errorMessage(caught, "Could not open chat.")));
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
      const { data: callId, error: callError } = await createClient().rpc("start_call", { p_room_id: room, p_call_type: type });
      if (callError) throw callError;
      if (callId) void notifyIncomingCall(callId);
      router.push(`/chat/${room}?call=${type}`);
    } catch (caught) {
      const message = errorMessage(caught, "Could not start call.");
      if (message.includes("INSUFFICIENT_BALANCE")) {
        setTopupOpen(true);
        setError("Request coins on WhatsApp to start this call.");
      } else {
        setError(messageForError(message));
      }
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
      <CoinTopupModal
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        onComplete={() => setError("WhatsApp opened. Admin will credit coins after payment confirmation.")}
      />
    </div>
  );
}

function errorMessage(caught: unknown, fallback: string) {
  if (caught instanceof Error) return caught.message;
  if (caught && typeof caught === "object" && "message" in caught) {
    return String((caught as { message?: unknown }).message ?? fallback);
  }
  return fallback;
}
