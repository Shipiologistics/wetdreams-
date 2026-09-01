import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { privacySections } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Kizo collects, uses, protects, and retains user, host, payout, and safety data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      intro="This policy explains what information Kizo collects, why we collect it, how we use it, and what choices users and hosts have."
      sections={privacySections}
    />
  );
}
