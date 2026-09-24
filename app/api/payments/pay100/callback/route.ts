import { syncPay100Payment } from "@/lib/payments/pay100";
import { extractCallbackOrderId, isPay100OrderId } from "@/lib/payments/pay100-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let payload: unknown = null;
  if (contentType.includes("application/json")) {
    payload = await request.json().catch(() => null);
  } else {
    const form = await request.formData().catch(() => null);
    payload = form ? Object.fromEntries(form.entries()) : null;
  }

  const queryOrderId = new URL(request.url).searchParams.get("order_id") ?? "";
  const orderId = extractCallbackOrderId(payload) ?? (isPay100OrderId(queryOrderId) ? queryOrderId : null);
  if (!orderId) return new Response("INVALID_ORDER", { status: 400 });

  try {
    await syncPay100Payment(orderId);
    return new Response("OK", { status: 200 });
  } catch (error) {
    const missing = error instanceof Error && error.message.includes("PAYMENT_NOT_FOUND");
    return new Response(missing ? "NOT_FOUND" : "RETRY", { status: missing ? 404 : 503 });
  }
}
