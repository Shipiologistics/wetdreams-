"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe2, LoaderCircle, Mail, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateDeviceId, registerCurrentDevice } from "@/lib/device-id";
import { formatLocation } from "@/lib/location-options";
import { messageForError } from "@/lib/format";
import { LocationSelects } from "@/components/location-selects";

type AuthFormProps = {
  next?: string;
  onSuccess?: () => Promise<void> | void;
};

export function AuthForm({ next = "/discover", onSuccess }: AuthFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState("");
  const [city, setCity] = useState("");

  async function finish() {
    if (onSuccess) {
      await onSuccess();
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function continueAsGuest() {
    const cleanLocation = formatLocation(city, state);
    if (!cleanLocation) return setError("Location is required.");
    setPending("guest");
    setError(null);
    setNotice(null);
    const { error: guestError } = await createClient().auth.signInAnonymously({
      options: { data: { display_name: "Guest", gender: "male" } },
    });

    if (guestError) {
      setError(messageForError(guestError.message));
      setPending(null);
      return;
    }

    try {
      await registerCurrentDevice();
      await saveLocation(cleanLocation);
    } catch (caught) {
      await createClient().auth.signOut();
      setError(messageForError(caught instanceof Error ? caught.message : "DEVICE_BANNED"));
      setPending(null);
      return;
    }

    await finish();
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("email");
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const displayName = String(form.get("displayName") ?? "").trim();
    const cleanLocation = formatLocation(city, state);
    if (mode === "signup" && !cleanLocation) {
      setPending(null);
      return setError("Location is required.");
    }
    const supabase = createClient();

    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
            data: { display_name: displayName, gender: "male" },
          },
        });

    if (result.error) {
      setError(messageForError(result.error.message));
      setPending(null);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      window.localStorage.setItem("p2c_pending_location", cleanLocation);
      setNotice("Check email.");
      setPending(null);
      return;
    }

    try {
      await registerCurrentDevice();
      if (mode === "signup" && cleanLocation) await saveLocation(cleanLocation);
    } catch (caught) {
      await supabase.auth.signOut();
      setError(messageForError(caught instanceof Error ? caught.message : "DEVICE_BANNED"));
      setPending(null);
      return;
    }

    await finish();
  }

  async function continueWithGoogle() {
    const cleanLocation = formatLocation(city, state);
    setPending("google");
    setError(null);
    getOrCreateDeviceId();
    if (cleanLocation) {
      window.localStorage.setItem("p2c_pending_location", cleanLocation);
    } else {
      window.localStorage.removeItem("p2c_pending_location");
    }
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (oauthError) {
      setError(messageForError(oauthError.message));
      setPending(null);
    }
  }

  async function saveLocation(value: string) {
    window.localStorage.removeItem("p2c_pending_location");
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("AUTH_REQUIRED");
    const { error: locationError } = await supabase
      .from("profiles")
      .update({ location: value })
      .eq("user_id", data.user.id);
    if (locationError) throw locationError;
  }

  return (
    <div className="auth-panel">
      <div className="auth-panel-heading compact">
        <h2>Start chat</h2>
        <p>Choose one.</p>
      </div>

      <div className="quick-auth-actions">
        <LocationSelects state={state} city={city} onStateChange={setState} onCityChange={setCity} />
        <button className="button primary wide" type="button" onClick={continueAsGuest} disabled={!!pending}>
          {pending === "guest" ? <LoaderCircle className="spin" size={19} /> : <UserRound size={19} />}
          Guest
        </button>
        <button className="button secondary wide" type="button" onClick={continueWithGoogle} disabled={!!pending}>
          {pending === "google" ? <LoaderCircle className="spin" size={18} /> : <Globe2 size={18} />}
          Google
        </button>
      </div>

      <div className="auth-divider"><span>Email</span></div>

      <form onSubmit={submitEmail} className="form-stack">
        {mode === "signup" && (
          <>
            <LocationSelects state={state} city={city} onStateChange={setState} onCityChange={setCity} />
            <label>
              Name
              <input name="displayName" autoComplete="name" minLength={2} maxLength={60} required />
            </label>
          </>
        )}
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
        </label>
        <button className="button primary wide" disabled={!!pending} type="submit">
          {pending === "email" ? <LoaderCircle className="spin" size={19} /> : <Mail size={19} />}
          {mode === "login" ? "Sign in" : "Join"}
        </button>
      </form>

      {error && <p className="form-message error" role="alert">{error}</p>}
      {notice && <p className="form-message success" role="status">{notice}</p>}

      <button className="auth-switch" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setNotice(null); }}>
        {mode === "login" ? "New? Join" : "Have account? Sign in"} <ArrowRight size={14} />
      </button>
    </div>
  );
}
