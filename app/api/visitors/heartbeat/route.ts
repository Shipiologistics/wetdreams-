import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null) as {
    sessionId?: unknown;
    deviceId?: unknown;
    path?: unknown;
    presence?: unknown;
  } | null;
  const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";
  const deviceId = typeof payload?.deviceId === "string" ? payload.deviceId.trim() : "";
  const path = typeof payload?.path === "string" ? payload.path.trim() : "/";
  const presence = payload?.presence === "offline" ? "offline" : "online";

  if (sessionId.length < 16 || sessionId.length > 120) {
    return NextResponse.json({ error: "INVALID_VISITOR_SESSION" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("track_visitor_session", {
    p_session_id: sessionId,
    p_device_id: deviceId || null,
    p_path: path || "/",
    p_user_agent: request.headers.get("user-agent"),
    p_presence: presence,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
