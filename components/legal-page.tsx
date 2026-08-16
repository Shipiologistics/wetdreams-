import Link from "next/link";
import { Logo } from "@/components/logo";
import { LegalLinks } from "@/components/legal-links";

export type LegalSection = {
  title: string;
  body: string[];
};

export function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <main className="legal-page">
      <header className="legal-topbar">
        <Logo />
        <Link className="button secondary" href="/discover">Back to app</Link>
      </header>
      <article className="legal-document">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: August 16, 2026</p>
        <p className="legal-intro">{intro}</p>
        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
      </article>
      <LegalLinks />
    </main>
  );
}
