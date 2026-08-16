import Image from "next/image";
import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/discover" className="logo" aria-label="WetDreams home">
      <span className="logo-mark" aria-hidden="true">
        <Image src="/brand/wetdreams-dna-logo.png" alt="" fill sizes="34px" priority />
      </span>
      {!compact && <span>WetDreams</span>}
    </Link>
  );
}
