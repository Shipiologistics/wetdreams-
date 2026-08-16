"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, Phone, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { createClient } from "@/lib/supabase/client";
import type { Account } from "@/lib/view-models";
import type { Database } from "@/lib/database.types";

type Call = Database["public"]["Tables"]["calls"]["Row"];

type IncomingCall = {
  call: Call;
  caller: Account;
  image: string | null;
};

export function IncomingCallListener() {
  const pathname = usePathname();
  const router = useRouter();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [pending, setPending] = useState<"accept" | "reject" | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let viewerId: string | null = null;
    let mounted = true;

    async function showIncoming(call: Call) {
      if (pathname === `/chat/${call.room_id}`) return;
      const [{ data: caller }, { data: media }] = await Promise.all([
        supabase.from("users").select("*").eq("id", call.caller_id).single(),
        supabase
          .from("profile_media")
          .select("cloudinary_url")
          .eq("user_id", call.caller_id)
          .eq("is_primary", true)
          .maybeSingle(),
      ]);
      if (!mounted || !caller) return;
      setIncoming({ call, caller, image: media?.cloudinary_url ?? null });
      if (document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
        const notification = new Notification(`Incoming ${call.call_type} call`, {
          body: caller.display_name,
          tag: `call:${call.id}`,
          data: { roomId: call.room_id },
        });
        notification.onclick = () => {
          window.focus();
          router.push(`/chat/${call.room_id}`);
          notification.close();
        };
      }
      if ("vibrate" in navigator) navigator.vibrate?.([260, 110, 260]);
    }

    async function subscribe() {
      const { data } = await supabase.auth.getUser();
      viewerId = data.user?.id ?? null;
      if (!viewerId) return;

      const { data: activeCalls } = await supabase
        .from("calls")
        .select("*")
        .eq("receiver_id", viewerId)
        .eq("status", "ringing")
        .order("created_at", { ascending: false })
        .limit(1);
      if (activeCalls?.[0]) await showIncoming(activeCalls[0]);

      const channel = supabase
        .channel(`incoming-calls:${viewerId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "calls", filter: `receiver_id=eq.${viewerId}` },
          (payload) => {
            const call = payload.new as Call;
            if (call.status === "ringing") void showIncoming(call);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "calls", filter: `receiver_id=eq.${viewerId}` },
          (payload) => {
            const call = payload.new as Call;
            setIncoming((current) => {
              if (!current || current.call.id !== call.id) return current;
              return call.status === "ringing" ? { ...current, call } : null;
            });
          },
        )
        .subscribe();

      return () => { void supabase.removeChannel(channel); };
    }

    let cleanup: (() => void) | undefined;
    void subscribe().then((value) => { cleanup = value; });

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [pathname, router]);

  async function respond(accept: boolean) {
    if (!incoming) return;
    setPending(accept ? "accept" : "reject");
    const { error } = await createClient().rpc("respond_to_call", {
      p_call_id: incoming.call.id,
      p_accept: accept,
    });
    setPending(null);
    if (error) {
      setIncoming(null);
      return;
    }
    const roomId = incoming.call.room_id;
    setIncoming(null);
    if (accept) router.push(`/chat/${roomId}`);
  }

  if (!incoming) return null;

  return (
    <div className="call-overlay incoming-call-overlay" role="dialog" aria-modal="true" aria-label="Incoming call">
      <div className="call-backdrop">{incoming.image && <Image src={incoming.image} alt="" fill sizes="100vw" />}</div>
      <div className="call-content">
        <div className="call-topbar">
          <Avatar name={incoming.caller.display_name} src={incoming.image} size={52} />
          <div>
            <h2>{incoming.caller.display_name}</h2>
            <p>Incoming {incoming.call.call_type} call</p>
          </div>
        </div>
        <div className="ringing-stage">
          <div className="ringing-avatar-wrap">
            <span className="ringing-pulse" />
            <Avatar name={incoming.caller.display_name} src={incoming.image} size={132} />
          </div>
          <h2>{incoming.caller.display_name}</h2>
          <p>WetDreams {incoming.call.call_type} call</p>
        </div>
        <div className="call-bottom-controls incoming-call-actions">
          <div className="call-control-stack">
            <button className="call-round-control reject" type="button" disabled={!!pending} onClick={() => respond(false)} title="Reject">
              {pending === "reject" ? <LoaderCircle className="spin" size={22} /> : <X size={22} />}
            </button>
            <span>Reject</span>
          </div>
          <div className="call-control-stack">
            <button className="call-round-control accept" type="button" disabled={!!pending} onClick={() => respond(true)} title="Accept">
              {pending === "accept" ? <LoaderCircle className="spin" size={22} /> : <Phone size={22} />}
            </button>
            <span>Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
