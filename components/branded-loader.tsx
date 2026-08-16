import Image from "next/image";

export function BrandedLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="branded-loader" aria-live="polite" aria-busy="true">
      <span className="branded-loader-mark" aria-hidden="true">
        <Image src="/brand/wetdreams-dna-logo.png" alt="" fill sizes="74px" priority />
      </span>
      <span>{label}</span>
    </div>
  );
}
