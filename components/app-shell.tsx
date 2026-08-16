"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgeIndianRupee,
  Compass,
  HeartHandshake,
  MessagesSquare,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import clsx from "clsx";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/avatar";
import { DeviceRegistrar } from "@/components/device-registrar";
import { LocationGate } from "@/components/location-gate";
import { formatMoney } from "@/lib/format";

const items = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/chat", label: "Chats", icon: MessagesSquare },
  { href: "/random", label: "Random", icon: HeartHandshake },
  { href: "/wallet", label: "Wallet", icon: BadgeIndianRupee },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  children,
  viewer,
}: {
  children: React.ReactNode;
  viewer: {
    name: string;
    username: string;
    avatar: string | null;
    role: string;
    coins: number;
    location: string | null;
  };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const navItems = useMemo(
    () => viewer.role === "admin" ? [...items, { href: "/admin", label: "Admin", icon: ShieldCheck }] : items,
    [viewer.role],
  );
  const visiblePendingHref = pendingHref && pendingHref !== pathname ? pendingHref : null;
  const activePath = visiblePendingHref ?? pathname;
  const routeLabel = useMemo(
    () => navItems.find((item) => activePath.startsWith(item.href))?.label ?? "Loading",
    [activePath, navItems],
  );

  useEffect(() => {
    navItems.forEach((item) => router.prefetch(item.href));
  }, [navItems, router]);

  function startNavigation(href: string) {
    if (href !== pathname) setPendingHref(href);
    router.prefetch(href);
  }

  return (
    <div className="app-frame">
      <DeviceRegistrar />
      <LocationGate required={!viewer.location?.trim()} />
      <aside className="side-nav">
        <Logo />
        <nav aria-label="Primary navigation">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              prefetch
              onClick={() => startNavigation(href)}
              onPointerEnter={() => router.prefetch(href)}
              className={clsx("nav-link", activePath.startsWith(href) && "active")}
            >
              <Icon size={20} strokeWidth={1.8} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="side-account">
          <Avatar name={viewer.name} src={viewer.avatar} size={40} />
          <div>
            <strong>{viewer.name}</strong>
            <span>@{viewer.username}</span>
          </div>
          <span className="coin-pill">{formatMoney(viewer.coins)}</span>
        </div>
      </aside>

      <main className="app-main">
        {visiblePendingHref ? <AppRouteLoading label={routeLabel} /> : children}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {navItems.filter((item) => item.href !== "/settings").slice(0, 5).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            prefetch
            onClick={() => startNavigation(href)}
            onPointerEnter={() => router.prefetch(href)}
            className={clsx("bottom-nav-link", activePath.startsWith(href) && "active")}
          >
            <Icon size={21} strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function AppRouteLoading({ label }: { label: string }) {
  return (
    <div className="page-shell route-loading-shell" aria-live="polite" aria-busy="true">
      <header className="page-header">
        <div>
          <span className="eyebrow">Opening</span>
          <h1>{label}</h1>
        </div>
      </header>
      <div className="route-loading-grid">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
