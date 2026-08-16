"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import {
  CircleAlert,
  Coins,
  ImagePlus,
  LoaderCircle,
  MoreVertical,
  Phone,
  Send,
  ShieldAlert,
  SmilePlus,
  Video,
  X,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { AgoraCallSession } from "@/components/agora-call-session";
import { CoinTopupModal } from "@/components/coin-topup-modal";
import { GlobalBackButton } from "@/components/global-back-button";
import { TipButton } from "@/components/tip-button";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { formatRelativeTime, messageForError } from "@/lib/format";
import type { Account, ChatRoom as Room, Message, Profile, ProfileMedia } from "@/lib/view-models";
import type { Database } from "@/lib/database.types";

type Call = Database["public"]["Tables"]["calls"]["Row"];
const emoji = ["😀", "😂", "❤️", "✨", "👍", "🙌", "🔥", "🤍"];

type ChatMediaUpload = {
  type: "image" | "video";
  url: string;
  publicId: string;
  resourceType: string;
};

type BlockState = {
  viewerBlockedOther: boolean;
  otherBlockedViewer: boolean;
};

export function ChatRoom({
  viewerId,
  initialWallet,
  room,
  other,
  profile,
  media,
  initialMessages,
  initialCall,
  initialBlockState,
}: {
  viewerId: string;
  initialWallet: number;
  room: Room;
  other: Account;
  profile: Profile;
  media: ProfileMedia[];
  initialMessages: Message[];
  initialCall: Call | null;
  initialBlockState: BlockState;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [typing, setTyping] = useState(false);
  const [wallet, setWallet] = useState(initialWallet);
  const [activeCall, setActiveCall] = useState(initialCall);
  const [blockState, setBlockState] = useState(initialBlockState);
  const [otherAccount, setOtherAccount] = useState(other);
  const [topupOpen, setTopupOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  const primaryImage = media.find((item) => item.is_primary)?.cloudinary_url ?? media[0]?.cloudinary_url;
  const count = Math.max(room.message_count, messages.length);
  const paywalled = count >= 10 && !profile.free_chat_enabled && Number(profile.chat_rate_coins) > 0;
  const blocked = blockState.viewerBlockedOther || blockState.otherBlockedViewer;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${room.id}` },
        (payload) => {
          const message = payload.new as Message;
          setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
          if (message.sender_id !== viewerId) void supabase.rpc("mark_room_read", { p_room_id: room.id });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `room_id=eq.${room.id}` },
        (payload) => {
          const message = payload.old as Pick<Message, "id">;
          setMessages((current) => current.filter((item) => item.id !== message.id));
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId !== viewerId) {
          setTyping(Boolean(payload.typing));
          if (payload.typing) window.setTimeout(() => setTyping(false), 1800);
        }
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `room_id=eq.${room.id}` },
        (payload) => setActiveCall(payload.new as Call),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls", filter: `room_id=eq.${room.id}` },
        (payload) => setActiveCall(payload.new as Call),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${other.id}` },
        (payload) => setOtherAccount(payload.new as Account),
      )
      .subscribe();
    channelRef.current = channel;
    void supabase.rpc("mark_room_read", { p_room_id: room.id });
    return () => { void supabase.removeChannel(channel); };
  }, [other.id, room.id, viewerId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  function signalTyping(value: string) {
    setText(value);
    void channelRef.current?.httpSend("typing", { userId: viewerId, typing: Boolean(value) });
  }

  async function sendMessage(messageType: "text" | "emoji" | "image" | "video", content?: string, media?: ChatMediaUpload) {
    if (blocked) {
      setError("Blocked.");
      return;
    }
    setPending(true);
    setError(null);
    const { data, error: sendError } = await createClient().rpc("send_message", {
      p_room_id: room.id,
      p_message_type: messageType,
      p_content: content,
      p_cloudinary_url: media?.url,
      p_cloudinary_public_id: media?.publicId,
      p_cloudinary_resource_type: media?.resourceType,
    });
    setPending(false);
    if (sendError) {
      if (sendError.message.includes("USER_BLOCKED")) setBlockState((current) => ({ ...current, otherBlockedViewer: true }));
      setError(messageForError(sendError.message));
      return;
    }
    if (data && !messages.some((message) => message.id === data.id)) setMessages((current) => [...current, data]);
    const { data: latest } = await createClient()
      .from("messages")
      .select("*")
      .eq("room_id", room.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at")
      .limit(200);
    if (latest) setMessages(latest);
    if (data?.is_paid) setWallet((current) => Math.max(0, current - Number(data.coins_charged)));
    setText("");
    setShowEmoji(false);
    void channelRef.current?.httpSend("typing", { userId: viewerId, typing: false });
  }

  async function startCall(type: "audio" | "video") {
    if (blocked) {
      setError("Blocked.");
      return;
    }
    setError(null);
    const { data, error: callError } = await createClient().rpc("start_call", { p_room_id: room.id, p_call_type: type });
    if (callError) {
      if (callError.message.includes("USER_BLOCKED")) setBlockState((current) => ({ ...current, otherBlockedViewer: true }));
      return setError(messageForError(callError.message));
    }
    if (data) {
      const { data: call } = await createClient().from("calls").select("*").eq("id", data).single();
      if (call) setActiveCall(call);
    }
  }

  async function report() {
    const reason = window.prompt("What happened?");
    if (!reason) return;
    const { error: reportError } = await createClient().rpc("report_user", {
      p_reported_user: other.id,
      p_room_id: room.id,
      p_reason: reason,
    });
    setShowMenu(false);
    setError(reportError ? messageForError(reportError.message) : "Report submitted for review.");
  }

  async function block() {
    if (!window.confirm(`Block ${other.display_name}?`)) return;
    const { error: blockError } = await createClient().rpc("block_user", {
      p_blocked_user: other.id,
      p_device_id: getOrCreateDeviceId(),
    });
    setShowMenu(false);
    if (blockError) {
      setError(messageForError(blockError.message));
      return;
    }
    setBlockState((current) => ({ ...current, viewerBlockedOther: true }));
    setShowEmoji(false);
    setShowMedia(false);
    setError(`${other.display_name} has been blocked.`);
  }

  async function unblock() {
    const { error: unblockError } = await createClient().rpc("unblock_user", { p_blocked_user: other.id });
    setShowMenu(false);
    if (unblockError) {
      setError(messageForError(unblockError.message));
      return;
    }
    setBlockState((current) => ({ ...current, viewerBlockedOther: false }));
    setError(`${other.display_name} has been unblocked.`);
  }

  const grouped = useMemo(() => messages, [messages]);
  const otherBusy = otherAccount.status === "busy" || otherAccount.status === "in_call";
  const callDisabled = blocked || otherBusy;
  const otherPresence = otherBusy ? "busy" : otherAccount.status === "online" ? "online" : `seen ${formatRelativeTime(otherAccount.last_seen)}`;

  return (
    <div className="chat-screen">
      <header className="chat-header">
        <GlobalBackButton variant="inline" />
        <Avatar name={otherAccount.display_name} src={primaryImage} size={42} />
        <div className="chat-person">
          <strong>{otherAccount.display_name}</strong>
          <span>{typing ? "typing..." : otherPresence}</span>
        </div>
        <button className="icon-button" title={callDisabled ? "Unavailable" : "Audio call"} onClick={() => startCall("audio")} disabled={callDisabled}><Phone size={19} /></button>
        <button className="icon-button" title={callDisabled ? "Unavailable" : "Video call"} onClick={() => startCall("video")} disabled={callDisabled}><Video size={19} /></button>
        <div className="relative">
          <button className="icon-button" title="Conversation options" onClick={() => setShowMenu(!showMenu)}><MoreVertical size={19} /></button>
          {showMenu && (
            <div className="context-menu">
              <button type="button" onClick={report}><ShieldAlert size={16} /> Report</button>
              {blockState.viewerBlockedOther
                ? <button type="button" onClick={unblock}><CircleAlert size={16} /> Unblock</button>
                : <button type="button" onClick={block}><CircleAlert size={16} /> Block</button>}
            </div>
          )}
        </div>
      </header>

      <div className="message-list">
        <div className="conversation-intro">
          <Avatar name={otherAccount.display_name} src={primaryImage} size={72} />
          <strong>{otherAccount.display_name}</strong>
          <span>@{otherAccount.username}</span>
          <p>{profile.bio}</p>
        </div>
        {grouped.map((message) => (
          <div className={`message-row ${message.sender_id === viewerId ? "mine" : "theirs"}`} key={message.id}>
            <div className={`message-bubble ${message.message_type === "emoji" ? "emoji" : ""}`}>
              {message.message_type === "image" || message.message_type === "video" ? (
                <a href={message.cloudinary_url ?? "#"} target="_blank" rel="noreferrer" className="message-media">
                  {message.message_type === "image" ? (
                    <Image src={message.cloudinary_url!} alt="Shared image" width={320} height={320} />
                  ) : <span>Open shared video</span>}
                </a>
              ) : message.content}
              <span className="message-meta">
                {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {message.is_paid && <Coins size={11} />}
                {message.sender_id === viewerId && message.read_at && "Read"}
              </span>
            </div>
          </div>
        ))}
        {typing && <div className="typing-bubble"><span /><span /><span /></div>}
        <div ref={endRef} />
      </div>

      <div className="chat-compose-wrap">
        {paywalled && !blocked && (
          <div className="paywall-banner">
            <Coins size={19} />
            <span><strong>{Number(profile.chat_rate_coins)} coins</strong> per message</span>
            <span className="wallet-inline">{wallet} left</span>
            <button type="button" onClick={() => setTopupOpen(true)}>Buy coins</button>
          </div>
        )}
        {blocked && (
          <div className="chat-notice blocked-state" role="status">
            {blockState.viewerBlockedOther ? `You blocked ${other.display_name}.` : "Blocked."}
          </div>
        )}
        {error && <div className="chat-notice" role="status">{error}<button type="button" onClick={() => setError(null)} title="Dismiss"><X size={15} /></button></div>}
        {showEmoji && !blocked && (
          <div className="emoji-tray">
            {emoji.map((item) => <button key={item} type="button" onClick={() => sendMessage("emoji", item)}>{item}</button>)}
          </div>
        )}
        {showMedia && !blocked && <MediaComposer onClose={() => setShowMedia(false)} onSend={(upload) => { setShowMedia(false); void sendMessage(upload.type, undefined, upload); }} />}
        <form className="message-composer" onSubmit={(event) => { event.preventDefault(); if (text.trim()) void sendMessage("text", text); }}>
          <button type="button" className="icon-button" title={blocked ? "Blocked" : "Add media"} onClick={() => setShowMedia(!showMedia)} disabled={blocked}><ImagePlus size={20} /></button>
          <button type="button" className="icon-button" title={blocked ? "Blocked" : "Emoji"} onClick={() => setShowEmoji(!showEmoji)} disabled={blocked}><SmilePlus size={20} /></button>
          <TipButton
            roomId={room.id}
            recipientName={otherAccount.display_name}
            wallet={wallet}
            onWalletChange={setWallet}
            onMessage={setError}
            disabled={blocked}
            compact
          />
          <textarea value={text} onChange={(event) => signalTyping(event.target.value)} placeholder={blocked ? "Blocked" : "Write a message"} rows={1} maxLength={4000} disabled={blocked} />
          <button type="submit" className="send-button" title={blocked ? "Blocked" : "Send"} disabled={pending || blocked || !text.trim()}>
            {pending ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}
          </button>
        </form>
      </div>

      {activeCall && ["ringing", "ongoing"].includes(activeCall.status) && (
        <CallOverlay
          call={activeCall}
          room={room}
          viewerId={viewerId}
          other={otherAccount}
          image={primaryImage}
          wallet={wallet}
          onChange={setActiveCall}
          onClose={() => setActiveCall(null)}
          onWalletChange={setWallet}
          onMessage={setError}
        />
      )}
      <CoinTopupModal
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        onComplete={(balance, coins) => {
          setWallet(balance);
          setError(`${coins} coins added.`);
        }}
      />
    </div>
  );
}

function MediaComposer({ onClose, onSend }: { onClose: () => void; onSend: (upload: ChatMediaUpload) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const upload = await uploadChatMedia(file);
      onSend(upload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="media-composer" onSubmit={submit}>
      <input
        type="file"
        accept="image/*,video/*"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        required
      />
      {error && <span className="media-error">{error}</span>}
      <button className="button primary small" type="submit" disabled={uploading || !file}>
        {uploading ? "Uploading" : "Attach"}
      </button>
      <button className="icon-button" type="button" onClick={onClose} title="Close"><X size={18} /></button>
    </form>
  );
}

async function uploadChatMedia(file: File): Promise<ChatMediaUpload> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary uploads are not configured.");
  }

  const messageType = file.type.startsWith("video/") ? "video" : "image";
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json() as {
    secure_url?: string;
    public_id?: string;
    resource_type?: string;
    error?: { message?: string };
  };

  if (!response.ok || !payload.secure_url || !payload.public_id) {
    throw new Error(payload.error?.message ?? "Cloudinary upload failed.");
  }

  return {
    type: messageType,
    url: payload.secure_url,
    publicId: payload.public_id,
    resourceType: payload.resource_type ?? messageType,
  };
}

function CallOverlay({
  call,
  room,
  viewerId,
  other,
  image,
  wallet,
  onChange,
  onClose,
  onWalletChange,
  onMessage,
}: {
  call: Call;
  room: Room;
  viewerId: string;
  other: Account;
  image?: string;
  wallet: number;
  onChange: (call: Call) => void;
  onClose: () => void;
  onWalletChange: (balance: number) => void;
  onMessage: (message: string) => void;
}) {
  const [pendingAction, setPendingAction] = useState<"accept" | "reject" | "end" | null>(null);
  const isReceiver = call.receiver_id === viewerId;
  const isRinging = call.status === "ringing";
  const statusText = call.status === "ongoing"
    ? `${call.call_type} call`
    : isReceiver
      ? `Incoming ${call.call_type} call`
      : "Ringing...";

  async function respond(accept: boolean) {
    setPendingAction(accept ? "accept" : "reject");
    const supabase = createClient();
    const { error: responseError } = await supabase.rpc("respond_to_call", { p_call_id: call.id, p_accept: accept });
    if (responseError || !accept) {
      setPendingAction(null);
      onClose();
      return;
    }
    const { data: nextCall } = await supabase.from("calls").select("*").eq("id", call.id).single();
    if (nextCall) onChange(nextCall);
    setPendingAction(null);
  }

  async function endCall() {
    setPendingAction("end");
    await createClient().rpc("end_call", { p_call_id: call.id });
    onClose();
  }

  const endControl = (
    <button
      className="call-round-control end hangup"
      type="button"
      disabled={!!pendingAction}
      onClick={endCall}
      title="End call"
    >
      {pendingAction === "end" ? <LoaderCircle className="spin" size={23} /> : <Phone size={23} />}
    </button>
  );

  return (
    <div className={`call-overlay ${call.call_type}-call ${isRinging ? "ringing" : "ongoing"}`}>
      <div className="call-backdrop">{image && <Image src={image} alt="" fill sizes="100vw" />}</div>
      <div className="call-content">
        <div className="call-topbar">
          <Avatar name={other.display_name} src={image} size={52} />
          <div>
            <h2>{other.display_name}</h2>
            <p>{statusText}</p>
          </div>
        </div>

        {call.status === "ongoing" ? (
          <AgoraCallSession
            call={call}
            room={room}
            tipControl={(
              <TipButton
                roomId={room.id}
                callId={call.id}
                recipientName={other.display_name}
                wallet={wallet}
                onWalletChange={onWalletChange}
                onMessage={onMessage}
                compact
              />
            )}
            endControl={endControl}
          />
        ) : (
          <div className="ringing-stage">
            <div className="ringing-avatar-wrap">
              <span className="ringing-pulse" />
              <Avatar name={other.display_name} src={image} size={132} />
            </div>
            <h2>{other.display_name}</h2>
            <p>{statusText}</p>
          </div>
        )}

        {isRinging && isReceiver && (
          <div className="call-bottom-controls">
            <div className="call-control-stack">
              <button className="call-round-control reject" type="button" disabled={!!pendingAction} onClick={() => respond(false)}>
                {pendingAction === "reject" ? <LoaderCircle className="spin" size={22} /> : <X size={22} />}
              </button>
              <span>Reject</span>
            </div>
            <div className="call-control-stack">
              <button className="call-round-control accept" type="button" disabled={!!pendingAction} onClick={() => respond(true)}>
                {pendingAction === "accept" ? <LoaderCircle className="spin" size={22} /> : <Phone size={22} />}
              </button>
              <span>Accept</span>
            </div>
          </div>
        )}
        {isRinging && !isReceiver && (
          <div className="call-bottom-controls">
            <div className="call-control-stack">
              {endControl}
              <span>End</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
