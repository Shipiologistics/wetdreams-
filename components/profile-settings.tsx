"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Camera,
  Check,
  Copy,
  Crop,
  ImagePlus,
  IndianRupee,
  LoaderCircle,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
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
import { LocationSelects } from "@/components/location-selects";

type CropState = { zoom: number; x: number; y: number };
type SelectedMedia = { id: string; file: File; previewUrl: string; crop: CropState };

export function ProfileSettings({ account, profile, media }: { account: Account; profile: Profile; media: ProfileMedia[] }) {
  const router = useRouter();
  const isGuest = account.is_guest;
  const [pending, setPending] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia[]>([]);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const mediaPreviewUrlsRef = useRef<string[]>([]);
  const cropDragRef = useRef<{ pointerId: number; startX: number; startY: number; cropX: number; cropY: number; size: number } | null>(null);
  const initialLocation = parseLocation(profile.location);
  const [locationState, setLocationState] = useState(initialLocation.state);
  const [locationCity, setLocationCity] = useState(initialLocation.city);

  useEffect(() => {
    return () => {
      mediaPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const supabase = createClient();
    const [accountResult, profileResult] = await Promise.all([
      supabase.from("users").update({
        display_name: String(data.get("display_name") ?? "").trim(),
        gender: (String(data.get("gender") ?? "") || null) as "male" | "female" | "other" | null,
      }).eq("id", account.id),
      supabase.from("profiles").update({
        bio: String(data.get("bio") ?? "").trim(),
        age: data.get("age") ? Number(data.get("age")) : null,
        location: String(data.get("location") ?? "").trim() || null,
        languages: splitList(String(data.get("languages") ?? "")),
        tags: splitList(String(data.get("tags") ?? "")),
        real_meet_available: data.get("real_meet_available") === "on",
        free_chat_enabled: data.get("free_chat_enabled") === "on",
        chat_rate_coins: Number(data.get("chat_rate_coins")),
        audio_call_rate_coins: Number(data.get("audio_call_rate_coins")),
        video_call_rate_coins: Number(data.get("video_call_rate_coins")),
      }).eq("user_id", account.id),
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
  const earningMode = profile.free_chat_enabled ? "Free chat" : `${Number(profile.chat_rate_coins)} coins`;

  async function copyProfileLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${publicUrl}`);
    setMessage("Profile link copied.");
  }

  function chooseMedia(files: FileList | File[] | null) {
    addSelectedMedia(files, true);
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
        crop: { zoom: 1, x: 0, y: 0 },
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

  function startCropDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activeMedia?.file.type.startsWith("image/") || !cropMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    cropDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cropX: activeMedia.crop.x,
      cropY: activeMedia.crop.y,
      size: Math.max(1, rect.width),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveCropDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const sensitivity = 100 / drag.size;
    updateActiveCrop((current) => ({
      ...current,
      x: clamp(drag.cropX + (event.clientX - drag.startX) * sensitivity, -50, 50),
      y: clamp(drag.cropY + (event.clientY - drag.startY) * sensitivity, -50, 50),
    }));
  }

  function endCropDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (cropDragRef.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    cropDragRef.current = null;
  }

  return (
    <div className="page-shell profile-page">
      <header className="page-header app-page-header">
        <div>
          <span className="eyebrow">Your public card</span>
          <h1>Profile</h1>
        </div>
        {!isGuest && <Link className="button secondary" href="/settings"><Settings size={18} /> Settings</Link>}
      </header>

      <section className="profile-hero">
        <div className="profile-hero-media">
          {primary ? (
            primary.media_type === "image"
              ? <Image src={primary.cloudinary_url} alt="" fill priority sizes="(max-width: 800px) 100vw, 400px" />
              : <video src={primary.cloudinary_url} muted playsInline />
          ) : <span>{account.display_name.slice(0, 1)}</span>}
          <button className="button light" type="button" onClick={() => setMediaOpen(true)}><Camera size={18} /> Add media</button>
        </div>
        <div className="profile-identity">
          <span className="eyebrow">@{account.username}</span>
          <h1>{account.display_name}</h1>
          <div className="identity-badges">
            {account.is_verified && <span><BadgeCheck size={16} /> Verified</span>}
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
              {!item.is_primary && <button title="Make primary" type="button" onClick={() => makePrimary(item.id)}><Check size={15} /></button>}
              <button title="Remove" type="button" onClick={() => removeMedia(item.id)}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
        {media.length < 12 && <button className="add-media-tile" type="button" onClick={() => setMediaOpen(true)}><ImagePlus size={24} /><span>Add</span></button>}
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

        <section className="settings-section">
          <div className="section-heading"><div><span className="eyebrow">Money</span><h2>Rates</h2></div><IndianRupee size={22} /></div>
          <div className="rate-input-grid">
            <label className="field">Chat / message<input name="chat_rate_coins" type="number" min="0" max="10000" step="0.01" defaultValue={profile.chat_rate_coins} required /><span>coins</span></label>
            <label className="field">Audio / minute<input name="audio_call_rate_coins" type="number" min="0" max="100000" step="0.01" defaultValue={profile.audio_call_rate_coins} required /><span>coins</span></label>
            <label className="field">Video / minute<input name="video_call_rate_coins" type="number" min="0" max="100000" step="0.01" defaultValue={profile.video_call_rate_coins} required /><span>coins</span></label>
          </div>
          <div className="settings-toggles">
            <label className="toggle-row"><input name="free_chat_enabled" type="checkbox" defaultChecked={profile.free_chat_enabled} /><span className="toggle-control" /><span><strong>Allow free chat</strong><small>Messages stay free after the first ten.</small></span></label>
            <label className="toggle-row"><input name="real_meet_available" type="checkbox" defaultChecked={profile.real_meet_available} /><span className="toggle-control" /><span><strong>Available to meet</strong><small>Show this preference on your profile.</small></span></label>
          </div>
        </section>

        {message && <div className="page-notice" role="status">{message}<button type="button" onClick={() => setMessage(null)} title="Dismiss"><X size={15} /></button></div>}
        <div className="settings-actions">
          {!isGuest && <Link className="button secondary" href="/settings">Account settings</Link>}
          <button className="button primary" type="submit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} Save profile</button>
        </div>
      </form>

      {mediaOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeMediaModal}>
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="media-title" onSubmit={addMedia} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="eyebrow">Profile gallery</span><h2 id="media-title">Add media</h2></div><button className="icon-button" type="button" title="Close" onClick={closeMediaModal}><X size={20} /></button></div>
            {activeMedia ? (
              <div className="upload-preview-card">
                <div
                  className={`square-media-preview ${activeMedia.file.type.startsWith("image/") && cropMode ? "is-draggable is-adjusting" : ""}`}
                  style={{
                    "--crop-zoom": activeMedia.crop.zoom,
                    "--crop-x": activeMedia.crop.x,
                    "--crop-y": activeMedia.crop.y,
                    "--crop-object-x": `${50 - activeMedia.crop.x}%`,
                    "--crop-object-y": `${50 - activeMedia.crop.y}%`,
                  } as CSSProperties}
                  onPointerDown={startCropDrag}
                  onPointerMove={moveCropDrag}
                  onPointerUp={endCropDrag}
                  onPointerCancel={endCropDrag}
                >
                  {activeMedia.file.type.startsWith("image/")
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={activeMedia.previewUrl} alt="Selected media preview" draggable={false} />
                    : <video src={activeMedia.previewUrl} muted playsInline controls />}
                  {activeMedia.file.type.startsWith("image/") && cropMode && <span className="crop-frame" aria-hidden="true" />}
                </div>
                <div className="upload-preview-meta">
                  <strong>{activeMedia.file.name}</strong>
                  {selectedMedia.length > 1 && <span>{activeMediaIndex + 1}/{selectedMedia.length}</span>}
                </div>
                {selectedMedia.length > 1 && (
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
                    <button className="icon-button bordered" type="button" title="Reset" onClick={() => updateActiveCrop(() => ({ zoom: 1, x: 0, y: 0 }))}>
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
                    <label className="button secondary small file-change-button">
                      <ImagePlus size={16} /> Add more
                      <input type="file" accept="image/*,video/*" multiple onChange={(event) => addSelectedMedia(event.target.files, false)} />
                    </label>
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
            <button className="button primary wide" type="submit" disabled={pending || !selectedMedia.length}>{pending && <LoaderCircle className="spin" size={18} />} {selectedMedia.length > 1 ? `Add ${selectedMedia.length} to profile` : "Add to profile"}</button>
          </form>
        </div>
      )}
    </div>
  );
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function uploadProfileMedia(file: File) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary uploads are not configured.");
  }

  const type = file.type.startsWith("video/") ? "video" : "image";
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
    error?: { message?: string };
  };

  if (!response.ok || !payload.secure_url || !payload.public_id) {
    throw new Error(payload.error?.message ?? "Cloudinary upload failed.");
  }

  return {
    type,
    url: payload.secure_url,
    publicId: payload.public_id,
  };
}

async function cropSquareImage(file: File, crop: { zoom: number; x: number; y: number }) {
  const bitmap = await loadImageBitmap(file);
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image editor is not available.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);

  const baseScale = Math.max(size / bitmap.width, size / bitmap.height);
  const scale = baseScale * crop.zoom;
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  const maxOffsetX = Math.max(0, (drawWidth - size) / 2);
  const maxOffsetY = Math.max(0, (drawHeight - size) / 2);
  const dx = (size - drawWidth) / 2 + (crop.x / 50) * maxOffsetX;
  const dy = (size - drawHeight) / 2 + (crop.y / 50) * maxOffsetY;

  context.drawImage(bitmap, dx, dy, drawWidth, drawHeight);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Could not prepare image.");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "profile"}-square.jpg`, { type: "image/jpeg" });
}

function loadImageBitmap(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image."));
    };
    image.src = url;
  });
}
