export async function notifyChatMessage(messageId: string) {
  try {
    await fetch("/api/messages/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
  } catch (error) {
    console.warn("Message push notification failed", error);
  }
}
