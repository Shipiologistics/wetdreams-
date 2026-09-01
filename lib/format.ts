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
    USER_BUSY: "This user is busy on another call.",
    USER_UNAVAILABLE: "This user is no longer available.",
    CERTIFIED_CALL_REQUIRED: "Only callers with a completed call can review this profile.",
    INVALID_RATING: "Choose a rating from 1 to 5 stars.",
    INVALID_TIP_AMOUNT: "Choose a tip amount of at least 1 coin.",
    INVALID_PAYOUT_METHOD: "Choose UPI or bank transfer.",
    UPI_ID_REQUIRED: "Enter a valid UPI ID.",
    ACCOUNT_HOLDER_REQUIRED: "Enter the bank account holder name.",
    BANK_ACCOUNT_REQUIRED: "Enter the bank account number.",
    IFSC_REQUIRED: "Enter the IFSC code.",
    TIP_NOT_ALLOWED: "Gifts can only be sent to hosts.",
    INVALID_PRESENCE: "Presence update failed. Please refresh.",
    MATCH_RETRY: "The queue moved quickly. Trying again now.",
    MEDIA_LIMIT_REACHED: "You have reached the media limit for this profile.",
    MEDIA_UPLOAD_REQUIRED: "Upload the media before sending it.",
    INVALID_WALLET_ADJUSTMENT: "Enter a valid non-zero wallet amount and a reason.",
    ADJUSTMENT_OVERDRAFT: "This deduction would make the wallet balance negative.",
    NOTES_REQUIRED: "Enter a reason of at least 3 characters.",
    WALLET_NOT_FOUND: "This account does not have a wallet yet.",
    WALLET_ADJUSTMENT_NOT_VERIFIED: "The wallet update could not be verified. No success was reported.",
    WALLET_LEDGER_NOT_VERIFIED: "The balance changed but its ledger entry could not be verified. Check the audit log.",
    ADMIN_REQUIRED: "Administrator access is required for this action.",
  };

  const key = Object.keys(known).find((candidate) => message.includes(candidate));
  return key ? known[key] : message;
}
