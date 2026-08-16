import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { hostSections } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Host Payout Policy",
  description: "WetDreams host rewards, withdrawal, payout, tax, and review policy.",
};

export default function HostPolicyPage() {
  return (
    <LegalPage
      eyebrow="Hosts"
      title="Host Payout Policy"
      intro="This policy explains how host rewards and withdrawal reviews work. It is written clearly so hosts know what can delay or block a payout."
      sections={hostSections}
    />
  );
}
