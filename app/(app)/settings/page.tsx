import type { Metadata } from "next";
import { AccountSettings } from "@/components/account-settings";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const email = typeof viewer.claims.email === "string" ? viewer.claims.email : null;

  return <AccountSettings account={viewer.account} profile={viewer.profile} email={email} />;
}
