"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  SlidersHorizontal,
  Star,
  Video,
  X,
} from "lucide-react";
import clsx from "clsx";
import Image from "next/image";
import { AuthForm } from "@/components/auth-form";
import type { DiscoveryProfile } from "@/lib/view-models";
import { createClient } from "@/lib/supabase/client";
import { messageForError } from "@/lib/format";
import { getCitiesForState, indianLocations, parseLocation } from "@/lib/location-options";

export function DiscoverGrid({ profiles, viewerId }: { profiles: DiscoveryProfile[]; viewerId: string | null }) {
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [maxRate, setMaxRate] = useState(100000);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const maxAvailableRate = useMemo(() => Math.max(1, ...profiles.map(({ profile }) => Number(profile.chat_rate_coins))), [profiles]);
  const activeMaxRate = Math.min(maxRate, maxAvailableRate);
  const cityOptions = useMemo(() => {
    if (stateFilter === "all") return [];
    const catalogCities = getCitiesForState(stateFilter);
    const profileCities = profiles
      .map(({ profile }) => parseLocation(profile.location))
      .filter((location) => location.state === stateFilter && location.city)
      .map((location) => location.city);
    return Array.from(new Set([...catalogCities, ...profileCities]))
      .sort((first, second) => first.localeCompare(second));
  }, [profiles, stateFilter]);

  const filtered = useMemo(() => profiles.filter(({ account, profile }) => {
    const normalizedSearch = search.trim().toLowerCase();
    const { city, state } = parseLocation(profile.location);
    const normalizedLocation = profile.location?.trim().toLowerCase() ?? "";
    const haystack = `${account.display_name} ${normalizedLocation} ${city} ${state} ${profile.tags.join(" ")}`.toLowerCase();
    return (!normalizedSearch || haystack.includes(normalizedSearch))
      && (gender === "all" || account.gender === gender)
      && (stateFilter === "all" || state === stateFilter)
      && (cityFilter === "all" || city === cityFilter)
      && (!onlineOnly || account.status !== "offline")
      && Number(profile.chat_rate_coins) <= activeMaxRate;
  }), [profiles, search, gender, stateFilter, cityFilter, onlineOnly, activeMaxRate]);

  function resetFilters() {
    setSearch("");
    setGender("all");
    setStateFilter("all");
    setCityFilter("all");
    setOnlineOnly(false);
    setMaxRate(maxAvailableRate);
  }

  return (
    <>
      <div className="discover-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people, cities, interests" />
        </label>
        <button className={clsx("icon-button", filtersOpen && "active")} type="button" onClick={() => setFiltersOpen(!filtersOpen)} title="Filters">
          <SlidersHorizontal size={19} />
        </button>
      </div>

      {filtersOpen && (
        <div className="filter-bar">
          <label>
            Show me
            <select value={gender} onChange={(event) => setGender(event.target.value)}>
              <option value="female">Women</option>
              <option value="male">Men</option>
              <option value="all">Everyone</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            State
            <select
              value={stateFilter}
              onChange={(event) => {
                setStateFilter(event.target.value);
                setCityFilter("all");
              }}
            >
              <option value="all">All states</option>
              {indianLocations.map((item) => <option value={item.state} key={item.state}>{item.state}</option>)}
            </select>
          </label>
          <label>
            City
            <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} disabled={stateFilter === "all"}>
              <option value="all">All cities</option>
              {cityOptions.map((city) => <option value={city} key={city}>{city}</option>)}
            </select>
          </label>
          <label className="rate-filter">
            Up to <strong>{activeMaxRate} coins</strong>
            <input type="range" min="0" max={maxAvailableRate} value={activeMaxRate} onChange={(event) => setMaxRate(Number(event.target.value))} />
          </label>
          <label className="toggle-row compact">
            <input type="checkbox" checked={onlineOnly} onChange={(event) => setOnlineOnly(event.target.checked)} />
            <span className="toggle-control" />
            Online now
          </label>
          <button className="button secondary small" type="button" onClick={resetFilters}>Reset</button>
        </div>
      )}

      <p className="result-count">{filtered.length} {filtered.length === 1 ? "person" : "people"}</p>
      <div className="profile-grid">
        {filtered.map((profile, index) => <ProfileCard key={profile.account.id} profile={profile} viewerId={viewerId} eagerImage={index === 0} />)}
      </div>
      {!filtered.length && <div className="inline-empty">No profiles match these filters.</div>}
    </>
  );
}

function ProfileCard({ profile, viewerId, eagerImage }: { profile: DiscoveryProfile; viewerId: string | null; eagerImage: boolean }) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(profile.favorite);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const { account, media } = profile;
  const busy = account.status === "busy" || account.status === "in_call";

  async function getRoom() {
    const { data, error: roomError } = await createClient().rpc("create_or_get_direct_room", {
      p_target_user: account.id,
    });
    if (roomError) throw roomError;
    return data;
  }

  async function openChatRoom() {
    const room = await getRoom();
    router.push(`/chat/${room}`);
  }

  async function startChat() {
    if (!viewerId) {
      setAuthOpen(true);
      return;
    }
    setPending("chat");
    setError(null);
    try {
      await openChatRoom();
    } catch (caught) {
      setError(messageForError(caught instanceof Error ? caught.message : "Could not open chat."));
      setPending(null);
    }
  }

  async function startCall(type: "audio" | "video") {
    if (!viewerId) {
      setAuthOpen(true);
      return;
    }
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

  async function toggleFavorite() {
    if (!viewerId) {
      setAuthOpen(true);
      return;
    }
    const next = !favorite;
    setFavorite(next);
    const supabase = createClient();
    const result = next
      ? await supabase.from("favorites").insert({ user_id: viewerId, favorite_user_id: account.id })
      : await supabase.from("favorites").delete().eq("favorite_user_id", account.id);
    if (result.error) {
      setFavorite(!next);
      setError(messageForError(result.error.message));
    }
  }

  return (
    <article className="profile-card">
      <div className="profile-gallery">
        {(media.length ? media : [null]).map((item, index) => (
          <div className="profile-slide" key={item?.id ?? "empty"}>
            {item ? (
              <Image
                src={item.cloudinary_url}
                alt={`${account.display_name} profile ${index + 1}`}
                fill
                sizes="(max-width: 700px) 92vw, 360px"
                loading={eagerImage && index === 0 ? "eager" : "lazy"}
              />
            ) : (
              <div className="profile-image-fallback">{account.display_name.slice(0, 1)}</div>
            )}
          </div>
        ))}
        <div className="profile-card-topline">
          <span className={clsx("presence-badge", account.status === "online" && "online", busy && "busy")}>
            <span /> {busy ? "Busy" : account.status === "online" ? "Online" : "Away"}
          </span>
          <button className={clsx("floating-icon", favorite && "selected")} type="button" onClick={toggleFavorite} title={favorite ? "Remove favorite" : "Add favorite"}>
            <Heart size={19} fill={favorite ? "currentColor" : "none"} />
          </button>
        </div>
        {profile.profile.location && <div className="location-badge"><MapPin size={13} /> {profile.profile.location}</div>}
        {media.length > 1 && <div className="gallery-count">1 / {media.length}</div>}
      </div>

      <div className="profile-card-body">
        <div className="profile-title-row">
          <div>
            <h2>{account.display_name}{profile.profile.age ? `, ${profile.profile.age}` : ""}</h2>
            {account.is_verified && <BadgeCheck size={18} className="verified" aria-label="Verified" />}
          </div>
          {profile.rating && <span className="rating"><Star size={14} fill="currentColor" /> {profile.rating.toFixed(1)}</span>}
        </div>
        {profile.profile.location && <p className="location"><MapPin size={15} /> {profile.profile.location}</p>}
        <p className="profile-bio">{profile.profile.bio || "Ready for a good conversation."}</p>
        <div className="tag-row">
          {profile.profile.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <div className="rate-row">
          <span><strong>{Number(profile.profile.chat_rate_coins)}</strong> coins / message</span>
          {profile.profile.free_chat_enabled && <span className="free-label">Free chat</span>}
        </div>
        {error && <p className="card-error" role="alert">{error}</p>}
        <div className="profile-actions">
          <button className="button primary" type="button" onClick={startChat} disabled={!!pending}>
            {pending === "chat" ? <LoaderCircle className="spin" size={18} /> : <MessageCircle size={18} />}
            Message
          </button>
          <button className="icon-button bordered" type="button" title={busy ? "Busy" : "Audio call"} onClick={() => startCall("audio")} disabled={!!pending || busy}>
            {pending === "audio" ? <LoaderCircle className="spin" size={18} /> : <Phone size={18} />}
          </button>
          <button className="icon-button bordered" type="button" title={busy ? "Busy" : "Video call"} onClick={() => startCall("video")} disabled={!!pending || busy}>
            {pending === "video" ? <LoaderCircle className="spin" size={18} /> : <Video size={18} />}
          </button>
        </div>
      </div>
      {authOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAuthOpen(false)}>
          <div className="modal auth-choice-modal" role="dialog" aria-modal="true" aria-labelledby={`auth-${account.id}`} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">Message {account.display_name}</span>
                <h2 id={`auth-${account.id}`}>Sign in</h2>
              </div>
              <button className="icon-button" type="button" title="Close" onClick={() => setAuthOpen(false)}><X size={20} /></button>
            </div>
            <AuthForm onSuccess={async () => {
              setAuthOpen(false);
              setPending("chat");
              try {
                await openChatRoom();
              } catch (caught) {
                setError(messageForError(caught instanceof Error ? caught.message : "Could not open chat."));
                setPending(null);
              }
            }} />
          </div>
        </div>
      )}
    </article>
  );
}
