import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { safetySections } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Safety Rules",
  description: "Kizo community, blocking, reporting, and safety rules.",
};

export default function SafetyPage() {
  return (
    <LegalPage
      eyebrow="Safety"
      title="Safety Rules"
      intro="Kizo is for adult, consensual, respectful conversations. These rules help protect users, hosts, and the platform."
      sections={safetySections}
    />
  );
}
