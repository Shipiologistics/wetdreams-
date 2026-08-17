import { createSign } from "node:crypto";

type FirebaseCredentials = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

type FcmPayload = {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

export function firebaseConfigured() {
  return Boolean(readFirebaseCredentials());
}

export async function sendFcmMessage(payload: FcmPayload) {
  const credentials = readFirebaseCredentials();
  if (!credentials) throw new Error("FIREBASE_NOT_CONFIGURED");

  const accessToken = await getAccessToken(credentials);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${credentials.projectId}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: payload.token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
        android: {
          priority: "HIGH",
          notification: {
            channel_id: "incoming_calls",
            sound: "default",
            tag: payload.data.callId ? `call:${payload.data.callId}` : undefined,
            click_action: "OPEN_CALL",
          },
        },
      },
    }),
  });

  const result = await response.json().catch(() => ({})) as { error?: { status?: string; message?: string } };
  if (!response.ok) {
    const message = result.error?.status ?? result.error?.message ?? "FCM_SEND_FAILED";
    throw new Error(message);
  }
}

async function getAccessToken(credentials: FirebaseCredentials) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const assertion = signJwt({
    iss: credentials.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }, credentials.privateKey);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? "FIREBASE_AUTH_FAILED");
  }

  cachedToken = {
    value: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600),
  };
  return cachedToken.value;
}

function signJwt(claims: Record<string, string | number>, privateKey: string) {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify(claims));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  signer.end();
  return `${header}.${body}.${signer.sign(privateKey, "base64url")}`;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function readFirebaseCredentials(): FirebaseCredentials | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const parsed = JSON.parse(json) as { project_id?: string; client_email?: string; private_key?: string };
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      return {
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replaceAll("\\n", "\n"),
      };
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replaceAll("\\n", "\n"),
  };
}
