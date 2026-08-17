export async function notifyIncomingCall(callId: string) {
  try {
    await fetch("/api/calls/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId }),
    });
  } catch (error) {
    console.warn("Call push notification failed", error);
  }
}
