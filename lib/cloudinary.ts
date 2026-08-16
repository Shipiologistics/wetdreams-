import crypto from "node:crypto";

type DestroyResult = {
  result?: string;
  error?: { message?: string };
};

export type ExpiredCloudinaryAsset = {
  publicId: string;
  resourceType: string;
};

export function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME
      && process.env.CLOUDINARY_API_KEY
      && process.env.CLOUDINARY_API_SECRET,
  );
}

export async function destroyCloudinaryAsset({ publicId, resourceType }: ExpiredCloudinaryAsset) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary cleanup credentials are not configured.");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp,
    api_key: apiKey,
    signature,
  });

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
    method: "POST",
    body,
  });
  const json = (await response.json()) as DestroyResult;

  if (!response.ok || (json.result && !["ok", "not found"].includes(json.result))) {
    throw new Error(json.error?.message ?? `Cloudinary returned ${json.result ?? response.status}`);
  }

  return json.result ?? "ok";
}
