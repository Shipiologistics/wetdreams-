"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeIndianRupee,
  Compass,
  HeartHandshake,
  MessagesSquare,
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
  const navItems = viewer.role === "admin"
    ? [...items, { href: "/admin", label: "Admin", icon: ShieldCheck }]
    : items;

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
              className={clsx("nav-link", pathname.startsWith(href) && "active")}
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

      <main className="app-main">{children}</main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {navItems.slice(0, 5).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx("bottom-nav-link", pathname.startsWith(href) && "active")}
          >
            <Icon size={21} strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
