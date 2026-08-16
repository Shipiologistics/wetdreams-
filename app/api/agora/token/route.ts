import { RtcRole, RtcTokenBuilder } from "agora-token";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const tokenTtlSeconds = 60 * 60;

export async function POST(request: Request) {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return Response.json({ error: "AGORA_NOT_CONFIGURED" }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as { callId?: string } | null;
  if (!body?.callId) return Response.json({ error: "CALL_REQUIRED" }, { status: 400 });

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const { data: call, error: callError } = await supabase
    .from("calls")
    .select("id, agora_channel_name, caller_id, receiver_id, status")
    .eq("id", body.callId)
    .single();

  if (callError || !call) return Response.json({ error: "CALL_NOT_FOUND" }, { status: 404 });
  if (![call.caller_id, call.receiver_id].includes(userId)) {
    return Response.json({ error: "CALL_FORBIDDEN" }, { status: 403 });
  }
  if (call.status !== "ongoing") {
    return Response.json({ error: "CALL_NOT_ACTIVE" }, { status: 409 });
  }

  const channel = call.agora_channel_name ?? `call_${call.id.replaceAll("-", "")}`;
  const token = RtcTokenBuilder.buildTokenWithUserAccount(
    appId,
    appCertificate,
    channel,
    userId,
    RtcRole.PUBLISHER,
    tokenTtlSeconds,
    tokenTtlSeconds,
  );

  return Response.json(
    {
      appId,
      channel,
      token,
      uid: userId,
      expiresAt: Math.floor(Date.now() / 1000) + tokenTtlSeconds,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
