import { formatDistanceToNowStrict } from "date-fns";

export function formatMoney(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(number);
}

export function formatRelativeTime(value: string) {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function messageForError(message: string) {
  const known: Record<string, string> = {
    INSUFFICIENT_BALANCE: "You need more coins to continue this conversation.",
    INSUFFICIENT_BEANS: "Your bean balance is too low for that withdrawal.",
    USER_BLOCKED: "This conversation is no longer available.",
    ACCOUNT_BANNED: "This account has been suspended.",
    DEVICE_BANNED: "This device has been permanently blocked.",
    GUEST_AUTH_NOT_CONFIGURED: "Guest sign in is not configured yet.",
    LOCATION_REQUIRED: "Location is required.",
    USER_UNAVAILABLE: "This user is no longer available.",
    MATCH_RETRY: "The queue moved quickly. Trying again now.",
    MEDIA_LIMIT_REACHED: "You have reached the media limit for this profile.",
    MEDIA_UPLOAD_REQUIRED: "Upload the media before sending it.",
  };

  const key = Object.keys(known).find((candidate) => message.includes(candidate));
  return key ? known[key] : message;
}
