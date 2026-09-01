import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as { ratingId?: unknown; reason?: unknown } | null;
  const ratingId = typeof payload?.ratingId === "string" ? payload.ratingId : "";
  const reason = typeof payload?.reason === "string" ? payload.reason.replace(/\s+/g, " ").trim() : "";

  if (!ratingId || reason.length < 5) {
    return NextResponse.json({ error: "INVALID_REPORT" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: rating, error: ratingError } = await admin
    .from("ratings")
    .select("id, rater_id, rated_user_id, room_id")
    .eq("id", ratingId)
    .single();
  if (ratingError || !rating) {
    return NextResponse.json({ error: ratingError?.message ?? "REVIEW_NOT_FOUND" }, { status: 404 });
  }
  if (rating.rated_user_id !== auth.userId) {
    return NextResponse.json({ error: "REVIEW_REPORT_NOT_ALLOWED" }, { status: 403 });
  }

  const { data: report, error: reportError } = await admin
    .from("reports")
    .insert({
      reporter_id: auth.userId,
      reported_user_id: rating.rater_id,
      room_id: rating.room_id,
      reason: `Review report (${rating.id}): ${reason}`.slice(0, 1000),
    })
    .select("id")
    .single();
  if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 });

  return NextResponse.json({ reportId: report.id });
}
