import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { termsSections } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "WetDreams account, wallet, content, chat, call, and platform rules.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of Service"
      intro="These terms describe the basic rules for using WetDreams. If you do not agree with them, do not use the service."
      sections={termsSections}
    />
  );
}
