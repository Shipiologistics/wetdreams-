"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartHandshake, LoaderCircle, ShieldCheck, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { messageForError } from "@/lib/format";

export function RandomMatch({ userId }: { userId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "waiting" | "matched">("idle");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const openingRoom = useRef<string | null>(null);

  const openRoom = useCallback((roomId: string) => {
    if (openingRoom.current === roomId) return;
    openingRoom.current = roomId;
    setState("matched");
    router.replace(`/chat/${roomId}`);
  }, [router]);

  const match = useCallback(async () => {
    const { data, error: matchError } = await createClient().rpc("match_random_chat");
    if (!mounted.current) return;
    if (matchError) {
      if (matchError.message.includes("MATCH_RETRY")) return;
      setError(messageForError(matchError.message));
      setState("idle");
      return;
    }
    if (data) {
      openRoom(data);
    }
  }, [openRoom]);

  useEffect(() => {
    mounted.current = true;
    if (state !== "waiting") return;
    const supabase = createClient();
    const channel = supabase
      .channel(`random:${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "random_chat_queue", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { status: string; matched_room_id: string | null };
          if (row.status === "matched" && row.matched_room_id) {
            openRoom(row.matched_room_id);
          }
        },
      )
      .subscribe();
    const initialMatch = window.setTimeout(() => void match(), 0);
    const retry = window.setInterval(() => void match(), 1600);

    return () => {
      mounted.current = false;
      window.clearTimeout(initialMatch);
      window.clearInterval(retry);
      void supabase.removeChannel(channel);
    };
  }, [match, openRoom, state, userId]);

  async function cancel() {
    mounted.current = false;
    await createClient().rpc("cancel_random_chat");
    setState("idle");
  }

  return (
    <div className="random-page">
      <header className="page-header app-page-header random-header">
        <div>
          <span className="eyebrow">A little serendipity</span>
          <h1>Random chat</h1>
        </div>
      </header>

      <section className="match-stage">
        <div className={`match-visual ${state === "waiting" ? "searching" : ""}`}>
          <span className="match-ring ring-one" />
          <span className="match-ring ring-two" />
          <span className="match-core"><HeartHandshake size={42} strokeWidth={1.5} /></span>
        </div>

        {state === "idle" ? (
          <div className="match-copy">
            <Sparkles size={20} />
            <h2>Meet someone new</h2>
            <p>We will pair you with the next available person.</p>
            <label className="consent-row">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>I am 18+ and agree to the community rules.</span>
            </label>
            <button className="button primary large" type="button" disabled={!consent} onClick={() => { setError(null); setState("waiting"); }}>
              <HeartHandshake size={20} /> Find a chat
            </button>
          </div>
        ) : (
          <div className="match-copy" aria-live="polite">
            <LoaderCircle className="spin" size={20} />
            <h2>{state === "matched" ? "Found someone" : "Looking nearby"}</h2>
            <p>{state === "matched" ? "Opening your conversation..." : "Hold on, this usually takes a moment."}</p>
            {state === "waiting" && (
              <button className="button secondary" type="button" onClick={cancel}><X size={18} /> Cancel</button>
            )}
          </div>
        )}
        {error && <p className="form-message error">{error}</p>}
      </section>

      <footer className="safety-strip">
        <ShieldCheck size={19} />
        <span>Private by default. Block and report controls are always available.</span>
      </footer>
    </div>
  );
}
