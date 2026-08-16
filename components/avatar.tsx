import Image from "next/image";
import { initials } from "@/lib/format";

export function Avatar({
  name,
  src,
  size = 44,
  priority = false,
}: {
  name: string;
  src?: string | null;
  size?: number;
  priority?: boolean;
}) {
  return (
    <span className="avatar" style={{ width: size, height: size }} aria-label={name}>
      {src ? (
        <Image src={src} alt="" fill sizes={`${size}px`} priority={priority} />
      ) : (
        <span>{initials(name)}</span>
      )}
    </span>
  );
}
