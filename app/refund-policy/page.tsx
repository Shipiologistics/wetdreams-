import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { refundSections } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Kizo refund, wallet, chargeback, and digital beans policy.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      eyebrow="Payments"
      title="Refund Policy"
      intro="This policy explains when refunds may be reviewed for digital beans, credits, calls, messages, and related app features."
      sections={refundSections}
    />
  );
}
