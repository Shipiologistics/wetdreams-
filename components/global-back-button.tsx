"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function GlobalBackButton({ variant = "fixed" }: { variant?: "fixed" | "inline" }) {
  const pathname = usePathname();
  const mainPages = new Set(["/", "/discover", "/chat", "/random", "/wallet", "/profile", "/admin"]);
  const isChatRoom = /^\/chat\/[^/]+/.test(pathname);
  const isAuthPage = pathname === "/login";

  if (variant === "fixed" && (mainPages.has(pathname) || isChatRoom)) return null;

  function goBack() {
    if (window.history.length > 1) window.history.back();
  }

  return (
    <button
      className={clsx(
        "icon-button global-back-button",
        variant === "fixed" ? "global-back-button-fixed" : "global-back-button-inline",
        variant === "fixed" && isAuthPage && "global-back-button-auth",
      )}
      type="button"
      onClick={goBack}
      title="Back"
      aria-label="Go back"
    >
      <ArrowLeft size={21} />
    </button>
  );
}
