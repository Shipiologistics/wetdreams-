export async function uploadProfileMedia(file: File) {
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

export async function cropSquareImage(file: File, crop: { zoom: number; x: number; y: number }) {
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
