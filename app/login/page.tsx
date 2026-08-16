import type { Metadata } from "next";
import Image from "next/image";
import { AuthForm } from "@/components/auth-form";
import { GlobalBackButton } from "@/components/global-back-button";
import { LegalLinks } from "@/components/legal-links";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Welcome" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next ?? "/discover";

  return (
    <main className="auth-page">
      <Image
        src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=2000&q=88"
        alt="Friends sharing a relaxed conversation"
        fill
        priority
        sizes="100vw"
        className="auth-background"
      />
      <div className="auth-scrim" />
      <header className="auth-header auth-header-with-back">
        <GlobalBackButton variant="inline" />
        <Logo />
      </header>
      <section className="auth-content">
        <div className="auth-message">
          <span className="eyebrow">Good conversations are worth something</span>
          <h1>Meet people who are here to talk.</h1>
          <p>Ten messages are always on us. Stay when the conversation feels right.</p>
        </div>
        <div className="auth-panel-stack">
          <AuthForm next={next} />
          <LegalLinks compact />
        </div>
      </section>
    </main>
  );
}
