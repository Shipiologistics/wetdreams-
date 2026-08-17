import {config} from '../config';

type LocalMedia = {
  path: string;
  mime?: string | null;
  filename?: string | null;
};

type CloudinaryResponse = {
  secure_url?: string;
  public_id?: string;
  resource_type?: string;
  error?: {message?: string};
};

export async function uploadToCloudinary(media: LocalMedia) {
  const form = new FormData();
  form.append('upload_preset', config.cloudinaryUploadPreset);
  form.append('file', {
    uri: normalizeUri(media.path),
    type: media.mime || 'image/jpeg',
    name: media.filename || `wetdreams-${Date.now()}.jpg`,
  } as never);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudinaryCloudName}/auto/upload`,
    {method: 'POST', body: form},
  );
  const payload = (await response.json()) as CloudinaryResponse;
  if (!response.ok || !payload.secure_url || !payload.public_id) {
    throw new Error(payload.error?.message || 'Could not upload this file.');
  }

  return {
    url: payload.secure_url,
    publicId: payload.public_id,
    resourceType: payload.resource_type || 'image',
  };
}

function normalizeUri(path: string) {
  return path.startsWith('file://') || path.startsWith('content://')
    ? path
    : `file://${path}`;
}
