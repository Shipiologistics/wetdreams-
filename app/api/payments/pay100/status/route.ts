import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { syncPay100Payment } from "@/lib/payments/pay100";
import { isPay100OrderId } from "@/lib/payments/pay100-core";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const orderId = new URL(request.url).searchParams.get("orderId") ?? "";
  if (!isPay100OrderId(orderId)) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });

  const admin = createServiceClient();
  const { data: owned } = await admin.from("payment_intents").select("id").eq("gateway", "pay100")
    .eq("gateway_order_id", orderId).eq("user_id", auth.userId).maybeSingle();
  if (!owned) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  try {
    const result = await syncPay100Payment(orderId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not check payment.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
