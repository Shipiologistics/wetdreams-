"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatLocation, parseLocation } from "@/lib/location-options";
import { messageForError } from "@/lib/format";
import { LocationSelects } from "@/components/location-selects";

export function LocationGate({ required }: { required: boolean }) {
  const router = useRouter();
  const initial = parseLocation(typeof window === "undefined" ? "" : window.localStorage.getItem("p2c_pending_location") ?? "");
  const [state, setState] = useState(initial.state);
  const [city, setCity] = useState(initial.city);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = required;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanLocation = formatLocation(city, state);
    if (!cleanLocation) return setError("Location is required.");
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) {
      setPending(false);
      return setError(messageForError(userError?.message ?? "AUTH_REQUIRED"));
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ location: cleanLocation })
      .eq("user_id", data.user.id);
    setPending(false);
    if (updateError) return setError(messageForError(updateError.message));
    window.localStorage.removeItem("p2c_pending_location");
    router.refresh();
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop location-gate-backdrop" role="presentation">
      <form className="modal location-gate" role="dialog" aria-modal="true" aria-labelledby="location-title" onSubmit={save}>
        <div className="location-gate-icon"><MapPin size={24} /></div>
        <span className="eyebrow">Required</span>
        <h2 id="location-title">Add location</h2>
        <p>Select your state and city to continue.</p>
        <LocationSelects state={state} city={city} onStateChange={setState} onCityChange={setCity} />
        {error && <p className="form-message error" role="alert">{error}</p>}
        <button className="button primary wide" type="submit" disabled={pending}>
          {pending && <LoaderCircle className="spin" size={18} />}
          Continue
        </button>
      </form>
    </div>
  );
}
