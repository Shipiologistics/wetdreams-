import type { Metadata } from "next";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata: Metadata = { title: "Device blocked" };

export default function DeviceBannedPage() {
  return (
    <main className="center-page">
      <h1>Device blocked</h1>
      <p>This device is no longer allowed to use the app because it was blocked too many times.</p>
      <SignOutButton />
    </main>
  );
}
