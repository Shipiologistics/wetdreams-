import Link from "next/link";

const links = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refunds" },
  { href: "/host-policy", label: "Host payouts" },
  { href: "/safety", label: "Safety" },
];

export function LegalLinks({ compact = false }: { compact?: boolean }) {
  return (
    <nav className={compact ? "legal-links compact" : "legal-links"} aria-label="Legal links">
      {links.map((link) => (
        <Link href={link.href} key={link.href}>{link.label}</Link>
      ))}
    </nav>
  );
}
