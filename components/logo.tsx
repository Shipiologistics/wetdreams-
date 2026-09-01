import Image from "next/image";
import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/discover" className="logo" aria-label="Kizo home">
      <span className="logo-mark" aria-hidden="true">
        <Image src="/brand/kizo-ribbon-logo.png" alt="" fill sizes="34px" priority />
      </span>
      {!compact && <span>Kizo</span>}
    </Link>
  );
}
