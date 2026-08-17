"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { ImagePlus, LoaderCircle, RotateCw, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { messageForError } from "@/lib/format";
import { cropSquareImage, uploadProfileMedia } from "@/lib/profile-media-upload";

export function ProfileImageGate({ required }: { required: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function chooseFile(nextFile: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    setFile(nextFile);
    setError(null);
    if (!nextFile) {
      previewRef.current = null;
      setPreviewUrl(null);
      setRotation(0);
      return;
    }
    const nextPreview = URL.createObjectURL(nextFile);
    previewRef.current = nextPreview;
    setPreviewUrl(nextPreview);
    setRotation(0);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setError("Profile image is required.");
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) {
      setPending(false);
      return setError(messageForError(userError?.message ?? "AUTH_REQUIRED"));
    }

    try {
      const [{ data: existingMedia }, squareFile] = await Promise.all([
        supabase.from("profile_media").select("position").eq("user_id", data.user.id),
        cropSquareImage(file, { zoom: 1, x: 0, y: 0, rotation }),
      ]);
      const positions = (existingMedia ?? []).map((item) => item.position);
      if (positions.length >= 12) throw new Error("Profile media limit reached. Remove one image from Profile first.");
      const nextPosition = firstOpenPosition(positions);
      const uploaded = await uploadProfileMedia(squareFile);

      await supabase.from("profile_media").update({ is_primary: false }).eq("user_id", data.user.id).eq("is_primary", true);
      const { error: insertError } = await supabase.from("profile_media").insert({
        user_id: data.user.id,
        media_type: uploaded.type,
        cloudinary_url: uploaded.url,
        cloudinary_public_id: uploaded.publicId,
        position: nextPosition,
        is_primary: true,
      });

      if (insertError) throw insertError;
      router.refresh();
    } catch (caught) {
      setError(messageForError(caught instanceof Error ? caught.message : "Upload failed."));
    } finally {
      setPending(false);
    }
  }

  if (!required) return null;

  return (
    <div className="modal-backdrop profile-image-gate-backdrop" role="presentation">
      <form className="modal profile-image-gate" role="dialog" aria-modal="true" aria-labelledby="profile-image-title" onSubmit={submit}>
        <div className="location-gate-icon"><ImagePlus size={24} /></div>
        <span className="eyebrow">Required</span>
        <h2 id="profile-image-title">Add profile image</h2>
        <p>Female accounts need a real profile image before using the app.</p>
        <div className="profile-image-warning">
          <ShieldAlert size={18} />
          <span>Please don&apos;t use fake images or your account will be banned.</span>
        </div>
        <label className="profile-image-picker">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Selected profile preview" style={{ "--profile-image-rotation": `${rotation}deg` } as CSSProperties} />
          ) : (
            <span><ImagePlus size={28} /> Choose image</span>
          )}
          <input type="file" accept="image/*" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} required />
        </label>
        {previewUrl && (
          <button className="button secondary wide" type="button" onClick={() => setRotation((current) => (current + 90) % 360)}>
            <RotateCw size={18} />
            Rotate image
          </button>
        )}
        {error && <p className="form-message error" role="alert">{error}</p>}
        <button className="button primary wide" type="submit" disabled={pending || !file}>
          {pending ? <LoaderCircle className="spin" size={18} /> : <ImagePlus size={18} />}
          Upload and continue
        </button>
      </form>
    </div>
  );
}

function firstOpenPosition(positions: number[]) {
  const used = new Set(positions);
  for (let position = 0; position <= 11; position += 1) {
    if (!used.has(position)) return position;
  }
  return 11;
}
