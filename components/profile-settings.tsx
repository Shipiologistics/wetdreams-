"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Camera,
  Check,
  Copy,
  Crop,
  Clock3,
  ImagePlus,
  IndianRupee,
  LoaderCircle,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Settings,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { Account, Profile, ProfileMedia } from "@/lib/view-models";
import { createClient } from "@/lib/supabase/client";
import { formatLocation, parseLocation } from "@/lib/location-options";
import { messageForError } from "@/lib/format";
import { cropSquareImage, uploadProfileMedia } from "@/lib/profile-media-upload";
import { LocationSelects } from "@/components/location-selects";
import { ImageCropPreview, type CropState } from "@/components/image-crop-preview";

type SelectedMedia = { id: string; file: File; previewUrl: string; crop: CropState };

export function ProfileSettings({
  account,
  profile,
  media,
}: {
  account: Account;
  profile: Profile;
  media: ProfileMedia[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia[]>([]);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const [editingMedia, setEditingMedia] = useState<ProfileMedia | null>(null);
  const [loadingEditor, setLoadingEditor] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const mediaPreviewUrlsRef = useRef<string[]>([]);
  const initialLocation = parseLocation(profile.location);
  const [locationState, setLocationState] = useState(initialLocation.state);
  const [locationCity, setLocationCity] = useState(initialLocation.city);
  const [rates, setRates] = useState({
    chat: Number(profile.chat_rate_coins),
    audio: Number(profile.audio_call_rate_coins),
    video: Number(profile.video_call_rate_coins),
  });
  const [payout, setPayout] = useState({ beanRatio: 0.8, beanInr: 0.8 });

  useEffect(() => {
    return () => {
      mediaPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPayoutConfig() {
      const { data } = await createClient()
        .from("platform_config")
        .select("key, value")
        .in("key", ["bean_payout_ratio", "bean_inr_value"]);
      if (cancelled || !data) return;
      const ratio = Number(data.find((row) => row.key === "bean_payout_ratio")?.value ?? 0.8);
      const inr = Number(data.find((row) => row.key === "bean_inr_value")?.value ?? 0.8);
      setPayout({
        beanRatio: Number.isFinite(ratio) && ratio > 0 ? ratio : 0.8,
        beanInr: Number.isFinite(inr) && inr > 0 ? inr : 0.8,
      });
    }
    void loadPayoutConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const supabase = createClient();
    const profileUpdates = {
      bio: String(data.get("bio") ?? "").trim(),
      age: data.get("age") ? Number(data.get("age")) : null,
      location: String(data.get("location") ?? "").trim() || null,
      languages: splitList(String(data.get("languages") ?? "")),
      tags: splitList(String(data.get("tags") ?? "")),
      ...(account.is_verified ? {
        real_meet_available: data.get("real_meet_available") === "on",
        free_chat_enabled: data.get("free_chat_enabled") === "on",
        chat_rate_coins: Number(data.get("chat_rate_coins")),
        audio_call_rate_coins: Number(data.get("audio_call_rate_coins")),
        video_call_rate_coins: Number(data.get("video_call_rate_coins")),
      } : {}),
    };
    const [accountResult, profileResult] = await Promise.all([
      supabase.from("users").update({
        display_name: String(data.get("display_name") ?? "").trim(),
        gender: (String(data.get("gender") ?? "") || null) as "male" | "female" | "other" | null,
      }).eq("id", account.id),
      supabase.from("profiles").update(profileUpdates).eq("user_id", account.id),
    ]);
    setPending(false);
    const error = accountResult.error ?? profileResult.error;
    if (error) return setMessage(messageForError(error.message));
    setMessage("Profile saved.");
    router.refresh();
  }

  async function addMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMedia.length) return setMessage("Choose photos or videos.");
    setPending(true);
    setMessage(null);

    const uploads: Array<{ type: string; url: string; publicId: string }> = [];
    try {
      for (const item of selectedMedia) {
        const fileToUpload = item.file.type.startsWith("image/")
          ? await cropSquareImage(item.file, item.crop)
          : item.file;
        uploads.push(await uploadProfileMedia(fileToUpload));
      }
    } catch (caught) {
      setPending(false);
      setMessage(caught instanceof Error ? caught.message : "Upload failed.");
      return;
    }

    const startPosition = media.length ? Math.max(...media.map((item) => item.position)) + 1 : 0;
    const { error } = await createClient().from("profile_media").insert(uploads.map((uploaded, index) => ({
      user_id: account.id,
      media_type: uploaded.type,
      cloudinary_url: uploaded.url,
      cloudinary_public_id: uploaded.publicId,
      position: startPosition + index,
      is_primary: media.length === 0 && index === 0,
    })));
    setPending(false);
    if (error) return setMessage(messageForError(error.message));
    setMediaOpen(false);
    clearSelectedMedia();
    setMessage(selectedMedia.length === 1 ? "Media added." : `${selectedMedia.length} media added.`);
    router.refresh();
  }

  async function updateMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMedia || !activeMedia?.file.type.startsWith("image/")) return setMessage("Choose an image to edit.");
    setPending(true);
    setMessage(null);

    try {
      const squareFile = await cropSquareImage(activeMedia.file, activeMedia.crop);
      const uploaded = await uploadProfileMedia(squareFile);
      const { error } = await createClient().from("profile_media").update({
        media_type: uploaded.type,
        cloudinary_url: uploaded.url,
        cloudinary_public_id: uploaded.publicId,
      }).eq("id", editingMedia.id);
      if (error) throw error;
    } catch (caught) {
      setPending(false);
      setMessage(caught instanceof Error ? messageForError(caught.message) : "Image update failed.");
      return;
    }

    setPending(false);
    closeMediaModal();
    setMessage("Image updated.");
    router.refresh();
  }

  async function removeMedia(id: string) {
    if (!window.confirm("Remove this media from your profile?")) return;
    const { error } = await createClient().from("profile_media").delete().eq("id", id);
    if (error) return setMessage(messageForError(error.message));
    router.refresh();
  }

  async function makePrimary(id: string) {
    const supabase = createClient();
    await supabase.from("profile_media").update({ is_primary: false }).eq("user_id", account.id).eq("is_primary", true);
    const { error } = await supabase.from("profile_media").update({ is_primary: true }).eq("id", id);
    if (error) return setMessage(messageForError(error.message));
    router.refresh();
  }

  const primary = media.find((item) => item.is_primary) ?? media[0];
  const publicUrl = `/u/${account.username}`;
  const imageCount = media.filter((item) => item.media_type === "image").length;
  const videoCount = media.filter((item) => item.media_type === "video").length;
  const activeMedia = selectedMedia.find((item) => item.id === activeMediaId) ?? selectedMedia[0] ?? null;
  const activeMediaIndex = activeMedia ? selectedMedia.findIndex((item) => item.id === activeMedia.id) : -1;
  const completeItems = [
    media.length > 0,
    Boolean(profile.bio.trim()),
    Boolean(profile.age),
    Boolean(profile.location),
    profile.tags.length > 0,
  ];
  const completion = Math.round((completeItems.filter(Boolean).length / completeItems.length) * 100);
  const earningMode = account.is_verified
    ? profile.free_chat_enabled ? "Free chat" : `${Number(profile.chat_rate_coins)} coins/min`
    : "Not hosting";

  async function copyProfileLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${publicUrl}`);
    setMessage("Profile link copied.");
  }

  function chooseMedia(files: FileList | File[] | null) {
    addSelectedMedia(files, true);
  }

  function openAddMediaModal() {
    setEditingMedia(null);
    clearSelectedMedia();
    setMediaOpen(true);
  }

  async function openMediaEditor(item: ProfileMedia) {
    if (item.media_type !== "image") return setMessage("Only photos can be cropped or rotated.");
    setLoadingEditor(item.id);
    setMessage(null);
    try {
      const file = await fileFromUrl(item.cloudinary_url, `${item.id}.jpg`);
      clearSelectedMedia();
      const previewUrl = URL.createObjectURL(file);
      mediaPreviewUrlsRef.current.push(previewUrl);
      const selected = {
        id: `edit-${item.id}`,
        file,
        previewUrl,
        crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
      };
      setEditingMedia(item);
      setSelectedMedia([selected]);
      setActiveMediaId(selected.id);
      setCropMode(true);
      setMediaOpen(true);
    } catch (caught) {
      setMessage(caught instanceof Error ? messageForError(caught.message) : "Could not open this image for editing.");
    } finally {
      setLoadingEditor(null);
    }
  }

  function addSelectedMedia(files: FileList | File[] | null, replace: boolean) {
    const incoming = Array.from(files ?? []).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (replace) revokeSelectedMedia(selectedMedia);
    const current = replace ? [] : selectedMedia;
    let imageSlots = 10 - imageCount - current.filter((item) => item.file.type.startsWith("image/")).length;
    let videoSlots = 2 - videoCount - current.filter((item) => item.file.type.startsWith("video/")).length;
    const accepted: SelectedMedia[] = [];

    incoming.forEach((file, index) => {
      const isVideo = file.type.startsWith("video/");
      if (isVideo ? videoSlots <= 0 : imageSlots <= 0) return;
      if (isVideo) videoSlots -= 1;
      else imageSlots -= 1;
      const previewUrl = URL.createObjectURL(file);
      mediaPreviewUrlsRef.current.push(previewUrl);
      accepted.push({
        id: `${file.name}-${file.lastModified}-${index}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl,
        crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
      });
    });

    const nextMedia = [...current, ...accepted];
    setSelectedMedia(nextMedia);
    setActiveMediaId(accepted[0]?.id ?? nextMedia[0]?.id ?? null);
    setCropMode(false);
    if (incoming.length > accepted.length) setMessage("Some files were skipped because the profile media limit was reached.");
  }

  function clearSelectedMedia() {
    revokeSelectedMedia(selectedMedia);
    setSelectedMedia([]);
    setActiveMediaId(null);
    setCropMode(false);
  }

  function removeSelectedMedia(id: string) {
    const removedIndex = selectedMedia.findIndex((item) => item.id === id);
    const removed = selectedMedia[removedIndex];
    if (!removed) return;
    URL.revokeObjectURL(removed.previewUrl);
    mediaPreviewUrlsRef.current = mediaPreviewUrlsRef.current.filter((url) => url !== removed.previewUrl);
    const nextMedia = selectedMedia.filter((item) => item.id !== id);
    setSelectedMedia(nextMedia);
    if (activeMediaId === id) setActiveMediaId(nextMedia[Math.max(0, removedIndex - 1)]?.id ?? nextMedia[0]?.id ?? null);
    if (!nextMedia.length) setCropMode(false);
  }

  function revokeSelectedMedia(items: SelectedMedia[]) {
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    const revoked = new Set(items.map((item) => item.previewUrl));
    mediaPreviewUrlsRef.current = mediaPreviewUrlsRef.current.filter((url) => !revoked.has(url));
  }

  function closeMediaModal() {
    setMediaOpen(false);
    setEditingMedia(null);
    clearSelectedMedia();
  }

  function updateActiveCrop(updater: (crop: CropState) => CropState) {
    if (!activeMedia) return;
    setSelectedMedia((current) => current.map((item) => (
      item.id === activeMedia.id ? { ...item, crop: updater(item.crop) } : item
    )));
  }

  function changeCropZoom(amount: number) {
    updateActiveCrop((current) => ({
      ...current,
      zoom: Math.min(2.6, Math.max(1, Number((current.zoom + amount).toFixed(2)))),
    }));
  }

  function rotateActiveCrop() {
    updateActiveCrop((current) => ({
      ...current,
      x: 0,
      y: 0,
      rotation: (current.rotation + 90) % 360,
    }));
  }

  return (
    <div className="page-shell profile-page">
      <header className="page-header app-page-header">
        <div>
          <span className="eyebrow">Your public card</span>
          <h1>Profile</h1>
        </div>
        <Link className="button secondary settings-header-button" href="/settings"><Settings size={18} /> Settings</Link>
      </header>

      <section className="profile-hero">
        <div className="profile-hero-media">
          {primary ? (
            primary.media_type === "image"
              ? <Image src={primary.cloudinary_url} alt="" fill priority sizes="(max-width: 800px) 100vw, 400px" />
              : <video src={primary.cloudinary_url} muted playsInline />
          ) : <span>{account.display_name.slice(0, 1)}</span>}
          <div className="profile-hero-media-actions">
            {primary?.media_type === "image" && (
              <button className="button light" type="button" onClick={() => openMediaEditor(primary)} disabled={loadingEditor === primary.id}>
                {loadingEditor === primary.id ? <LoaderCircle className="spin" size={18} /> : <Crop size={18} />}
                Edit image
              </button>
            )}
            <button className="button light" type="button" onClick={openAddMediaModal}><Camera size={18} /> Add media</button>
          </div>
        </div>
        <div className="profile-identity">
          <span className="eyebrow">@{account.username}</span>
          <h1>{account.display_name}</h1>
          <div className="identity-badges">
            {account.is_verified ? <span><BadgeCheck size={16} /> Verified</span> : !account.is_guest && <span className="pending-verification"><Clock3 size={16} /> Verification pending</span>}
            <span className={`presence-label ${account.status}`}>{account.status}</span>
            {profile.location && <span><MapPin size={15} /> {profile.location}</span>}
          </div>
          <p>{profile.bio || "Tell people what makes a conversation with you worth staying for."}</p>
          <div className="profile-hero-actions">
            <Link className="button secondary" href={publicUrl}>View public page</Link>
            <button className="icon-button bordered" type="button" title="Copy public link" onClick={copyProfileLink}><Copy size={18} /></button>
          </div>
        </div>
      </section>

      <section className="profile-dashboard" aria-label="Profile summary">
        <div>
          <span>Ready</span>
          <strong>{completion}%</strong>
          <div className="completion-meter"><span style={{ width: `${completion}%` }} /></div>
        </div>
        <div>
          <span>Photos</span>
          <strong>{imageCount}/10</strong>
        </div>
        <div>
          <span>Videos</span>
          <strong>{videoCount}/2</strong>
        </div>
        <div>
          <span>Chat</span>
          <strong>{earningMode}</strong>
        </div>
      </section>

      <section className="media-strip" aria-label="Profile media">
        {media.map((item) => (
          <div className="media-tile" key={item.id}>
            {item.media_type === "image" ? <Image src={item.cloudinary_url} alt="" fill sizes="140px" /> : <video src={item.cloudinary_url} muted />}
            {item.is_primary && <span className="primary-badge"><Star size={12} fill="currentColor" /> Primary</span>}
            <div className="media-actions">
              {item.media_type === "image" && (
                <button title="Edit crop or rotate" type="button" onClick={() => openMediaEditor(item)} disabled={loadingEditor === item.id}>
                  {loadingEditor === item.id ? <LoaderCircle className="spin" size={15} /> : <Crop size={15} />}
                </button>
              )}
              {!item.is_primary && <button title="Make primary" type="button" onClick={() => makePrimary(item.id)}><Check size={15} /></button>}
              <button title="Remove" type="button" onClick={() => removeMedia(item.id)}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
        {media.length < 12 && <button className="add-media-tile" type="button" onClick={openAddMediaModal}><ImagePlus size={24} /><span>Add</span></button>}
      </section>

      <form className="settings-form" onSubmit={save}>
        <section className="settings-section">
          <div className="section-heading"><div><span className="eyebrow">Profile</span><h2>About you</h2></div></div>
          <div className="form-grid">
            <label className="field">Display name<input name="display_name" defaultValue={account.display_name} minLength={1} maxLength={60} required /></label>
            <label className="field">I am<select name="gender" defaultValue={account.gender ?? "male"}><option value="male">Man</option><option value="female">Woman</option><option value="other">Other</option></select></label>
            <label className="field">Age<input name="age" type="number" min="18" max="120" defaultValue={profile.age ?? ""} /></label>
            <div className="location-profile-field">
              <input type="hidden" name="location" value={formatLocation(locationCity, locationState)} />
              <LocationSelects state={locationState} city={locationCity} onStateChange={setLocationState} onCityChange={setLocationCity} />
            </div>
            <label className="field full">Bio<textarea name="bio" defaultValue={profile.bio} maxLength={500} rows={4} /></label>
            <label className="field full">Languages<input name="languages" defaultValue={profile.languages.join(", ")} placeholder="English, Hindi" /></label>
            <label className="field full">Interests<input name="tags" defaultValue={profile.tags.join(", ")} placeholder="Music, travel, books" /></label>
          </div>
        </section>

        {account.is_verified && <section className="settings-section" id="rates">
          <div className="section-heading"><div><span className="eyebrow">Money</span><h2>Rates</h2></div><IndianRupee size={22} /></div>
          <div className="rate-input-grid">
            <label className="field">Chat / minute<input name="chat_rate_coins" type="number" min="0" max="10000" step="0.01" value={rates.chat} onChange={(event) => setRates((current) => ({ ...current, chat: Number(event.target.value) }))} required /><span>coins</span></label>
            <label className="field">Audio / minute<input name="audio_call_rate_coins" type="number" min="0" max="100000" step="0.01" value={rates.audio} onChange={(event) => setRates((current) => ({ ...current, audio: Number(event.target.value) }))} required /><span>coins</span></label>
            <label className="field">Video / minute<input name="video_call_rate_coins" type="number" min="0" max="100000" step="0.01" value={rates.video} onChange={(event) => setRates((current) => ({ ...current, video: Number(event.target.value) }))} required /><span>coins</span></label>
          </div>
          <div className="rate-receivables">
            <strong>You receive per paid minute</strong>
            <div className="rate-receivables-grid">
              <ReceivableRow label="Chat" coins={rates.chat} beanRatio={payout.beanRatio} beanInr={payout.beanInr} />
              <ReceivableRow label="Audio" coins={rates.audio} beanRatio={payout.beanRatio} beanInr={payout.beanInr} />
              <ReceivableRow label="Video" coins={rates.video} beanRatio={payout.beanRatio} beanInr={payout.beanInr} />
            </div>
            <small>Spenders pay in coins. You earn beans: 1 coin = {payout.beanRatio} beans, 1 bean = ₹{payout.beanInr} on withdrawal.</small>
          </div>
          <div className="settings-toggles">
            <label className="toggle-row"><input name="free_chat_enabled" type="checkbox" defaultChecked={profile.free_chat_enabled} /><span className="toggle-control" /><span><strong>Allow free chat</strong><small>Chat stays free after the first ten messages.</small></span></label>
            <label className="toggle-row"><input name="real_meet_available" type="checkbox" defaultChecked={profile.real_meet_available} /><span className="toggle-control" /><span><strong>Available to meet</strong><small>Show this preference on your profile.</small></span></label>
          </div>
        </section>}

        {message && <div className="page-notice" role="status">{message}<button type="button" onClick={() => setMessage(null)} title="Dismiss"><X size={15} /></button></div>}
        <div className="settings-actions">
          <Link className="button secondary" href="/settings">Account settings</Link>
          <button className="button primary" type="submit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} Save profile</button>
        </div>
      </form>

      {mediaOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeMediaModal}>
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="media-title" onSubmit={editingMedia ? updateMedia : addMedia} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="eyebrow">Profile gallery</span><h2 id="media-title">{editingMedia ? "Edit image" : "Add media"}</h2></div><button className="icon-button" type="button" title="Close" onClick={closeMediaModal}><X size={20} /></button></div>
            {activeMedia ? (
              <div className="upload-preview-card">
                {activeMedia.file.type.startsWith("image/") ? (
                  <ImageCropPreview
                    src={activeMedia.previewUrl}
                    alt="Selected media preview"
                    crop={activeMedia.crop}
                    adjusting={cropMode}
                    onChange={updateActiveCrop}
                  />
                ) : (
                  <div className="square-media-preview">
                    <video src={activeMedia.previewUrl} muted playsInline controls />
                  </div>
                )}
                <div className="upload-preview-meta">
                  <strong>{editingMedia ? "Adjust crop and rotation" : activeMedia.file.name}</strong>
                  {selectedMedia.length > 1 && <span>{activeMediaIndex + 1}/{selectedMedia.length}</span>}
                </div>
                {!editingMedia && selectedMedia.length > 1 && (
                  <div className="selected-media-strip" aria-label="Selected media">
                    {selectedMedia.map((item, index) => (
                      <div className="selected-media-thumb" key={item.id}>
                        <button className={item.id === activeMedia.id ? "active" : ""} type="button" title={`Edit media ${index + 1}`} onClick={() => { setActiveMediaId(item.id); setCropMode(false); }}>
                          {item.file.type.startsWith("image/")
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={item.previewUrl} alt="" />
                            : <video src={item.previewUrl} muted playsInline />}
                        </button>
                        <button className="selected-media-remove" type="button" title="Remove" onClick={() => removeSelectedMedia(item.id)}><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {activeMedia.file.type.startsWith("image/") && cropMode ? (
                  <div className="crop-inline-toolbar">
                    <button className="icon-button bordered" type="button" title="Zoom out" onClick={() => changeCropZoom(-0.1)} disabled={activeMedia.crop.zoom <= 1}>
                      <Minus size={17} />
                    </button>
                    <button className="icon-button bordered" type="button" title="Zoom in" onClick={() => changeCropZoom(0.1)} disabled={activeMedia.crop.zoom >= 2.6}>
                      <Plus size={17} />
                    </button>
                    <button className="icon-button bordered" type="button" title="Rotate image" onClick={rotateActiveCrop}>
                      <RotateCw size={17} />
                    </button>
                    <button className="icon-button bordered" type="button" title="Reset" onClick={() => updateActiveCrop(() => ({ zoom: 1, x: 0, y: 0, rotation: 0 }))}>
                      <RotateCcw size={17} />
                    </button>
                    <button className="button dark small" type="button" onClick={() => setCropMode(false)}>
                      <Check size={16} /> Done
                    </button>
                  </div>
                ) : (
                  <div className="upload-preview-actions">
                    {activeMedia.file.type.startsWith("image/") && (
                      <button className="button secondary small" type="button" onClick={() => setCropMode(true)}>
                        <Crop size={16} /> Adjust
                      </button>
                    )}
                    {!editingMedia && (
                      <label className="button secondary small file-change-button">
                        <ImagePlus size={16} /> Add more
                        <input type="file" accept="image/*,video/*" multiple onChange={(event) => addSelectedMedia(event.target.files, false)} />
                      </label>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <label className="upload-drop">
                <ImagePlus size={28} />
                <strong>Choose photos or videos</strong>
                <span>Select several photos and adjust each one</span>
                <input type="file" accept="image/*,video/*" multiple onChange={(event) => chooseMedia(event.target.files)} required />
              </label>
            )}
            <button className="button primary wide" type="submit" disabled={pending || !selectedMedia.length}>
              {pending && <LoaderCircle className="spin" size={18} />}
              {editingMedia ? "Save image" : selectedMedia.length > 1 ? `Add ${selectedMedia.length} to profile` : "Add to profile"}
            </button>
          </form>
        </div>
      )}

    </div>
  );
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12);
}

function ReceivableRow({ label, coins, beanRatio, beanInr }: { label: string; coins: number; beanRatio: number; beanInr: number }) {
  const safeCoins = Number.isFinite(coins) && coins > 0 ? coins : 0;
  const beans = Math.round(safeCoins * beanRatio * 100) / 100;
  const inr = Math.round(beans * beanInr * 100) / 100;
  return (
    <div className="rate-receivable-row">
      <span>{label}</span>
      <strong>{beans.toLocaleString("en-IN", { maximumFractionDigits: 2 })} beans</strong>
      <em>≈ ₹{inr.toLocaleString("en-IN", { maximumFractionDigits: 2 })}/min</em>
    </div>
  );
}

async function fileFromUrl(url: string, name: string) {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error("Could not load this image for editing.");
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}
