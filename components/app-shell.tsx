"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { BrandedLoader } from "@/components/branded-loader";
import { NotificationsBell } from "@/components/notifications-bell";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/avatar";
import { DeviceRegistrar } from "@/components/device-registrar";
import { LocationGate } from "@/components/location-gate";
import { ProfileImageGate } from "@/components/profile-image-gate";
import { justAuthenticatedKey, recoveryKey } from "@/components/discover-session-recovery";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification, ChatRoom, Message } from "@/lib/view-models";

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
    id: string;
    name: string;
    username: string;
    avatar: string | null;
    role: string;
    coins: number;
    location: string | null;
    isGuest: boolean;
    requiresLocation: boolean;
    requiresProfileImage: boolean;
    unreadChatCount: number;
    chatRoomIds: string[];
    notifications: AppNotification[];
  };
}) {
  const shellChannelSuffix = useId();
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState(viewer.unreadChatCount);
  const [chatRoomIds, setChatRoomIds] = useState(() => new Set(viewer.chatRoomIds));
  const chatRoomIdsRef = useRef(chatRoomIds);
  const navItems = useMemo(
    () => {
      const allowedItems = viewer.isGuest ? items.filter((item) => item.href !== "/settings") : items;
      return viewer.role === "admin" ? [...allowedItems, { href: "/admin", label: "Admin", icon: ShieldCheck }] : allowedItems;
    },
    [viewer.isGuest, viewer.role],
  );
  const visiblePendingHref = pendingHref && pendingHref !== pathname ? pendingHref : null;
  const activePath = visiblePendingHref ?? pathname;
  const routeLabel = useMemo(
    () => navItems.find((item) => activePath.startsWith(item.href))?.label ?? "Loading",
    [activePath, navItems],
  );

  useEffect(() => {
    window.sessionStorage.removeItem(recoveryKey);
    window.sessionStorage.removeItem(justAuthenticatedKey);
    document.documentElement.classList.remove("wetdreams-auth-recovering");
  }, []);

  useEffect(() => {
    navItems.forEach((item) => router.prefetch(item.href));
  }, [navItems, router]);

  useEffect(() => {
    chatRoomIdsRef.current = chatRoomIds;
  }, [chatRoomIds]);

  const refreshUnreadChatCount = useCallback(async () => {
    const roomIds = Array.from(chatRoomIdsRef.current);
    if (!roomIds.length) {
      setUnreadChatCount(0);
      return;
    }

    const { count } = await createClient()
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("room_id", roomIds)
      .neq("sender_id", viewer.id)
      .is("read_at", null)
      .gt("expires_at", new Date().toISOString());

    setUnreadChatCount(count ?? 0);
  }, [viewer.id]);

  useEffect(() => {
    window.addEventListener("wetdreams:refresh-unread-chats", refreshUnreadChatCount);
    return () => window.removeEventListener("wetdreams:refresh-unread-chats", refreshUnreadChatCount);
  }, [refreshUnreadChatCount]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`app-shell:${viewer.id}:${shellChannelSuffix}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_rooms" },
        (payload) => {
          const room = payload.new as ChatRoom;
          if (room.room_type !== "random" && room.status === "active") {
            setChatRoomIds((current) => new Set(current).add(room.id));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_rooms" },
        (payload) => {
          const room = payload.new as ChatRoom;
          setChatRoomIds((current) => {
            const next = new Set(current);
            if (room.room_type !== "random" && room.status === "active") next.add(room.id);
            else next.delete(room.id);
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const message = payload.new as Message;
          if (message.sender_id !== viewer.id && !message.read_at && chatRoomIdsRef.current.has(message.room_id)) {
            setUnreadChatCount((current) => current + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const previous = payload.old as Message;
          const next = payload.new as Message;
          if (next.sender_id === viewer.id || !chatRoomIdsRef.current.has(next.room_id)) return;
          const wasUnread = !previous.read_at;
          const isUnread = !next.read_at;
          if (wasUnread && !isUnread) setUnreadChatCount((current) => Math.max(0, current - 1));
          if (!wasUnread && isUnread) setUnreadChatCount((current) => current + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          const message = payload.old as Message;
          if (message.sender_id !== viewer.id && !message.read_at && chatRoomIdsRef.current.has(message.room_id)) {
            setUnreadChatCount((current) => Math.max(0, current - 1));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [shellChannelSuffix, viewer.id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPendingHref(null);
      if (!document.querySelector(".call-overlay")) {
        document.documentElement.classList.remove("call-overlay-open");
      }
      const appMain = document.querySelector<HTMLElement>(".app-main");
      if (appMain) {
        appMain.scrollTop = 0;
        appMain.scrollLeft = 0;
      }
      window.scrollTo(0, 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const readAt = new Date().toISOString();

    async function markCurrentPageNotificationsRead() {
      const { data } = await createClient()
        .from("app_notifications")
        .update({ read_at: readAt })
        .eq("user_id", viewer.id)
        .eq("href", pathname)
        .is("read_at", null)
        .select("id");

      if (!cancelled && data?.length) {
        window.dispatchEvent(new CustomEvent("wetdreams:notifications-read", {
          detail: { ids: data.map((notification) => notification.id), readAt },
        }));
      }
    }

    void markCurrentPageNotificationsRead();
    return () => {
      cancelled = true;
    };
  }, [pathname, viewer.id]);

  function startNavigation(href: string) {
    if (href !== pathname) setPendingHref(href);
    router.prefetch(href);
  }

  return (
    <div className="app-frame">
      <DeviceRegistrar />
      <LocationGate required={viewer.requiresLocation} />
      <ProfileImageGate required={viewer.requiresProfileImage} />
      <aside className="side-nav">
        <div className="side-nav-head">
          <Logo />
          <NotificationsBell viewerId={viewer.id} initialNotifications={viewer.notifications} />
        </div>
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
              {href === "/chat" && unreadChatCount > 0 && <span className="nav-count">{unreadChatCount > 99 ? "99+" : unreadChatCount}</span>}
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
        <MobileHeaderNotifications
          key={`${pathname}:${visiblePendingHref ?? "ready"}`}
          viewerId={viewer.id}
          notifications={viewer.notifications}
          pathname={pathname}
          pendingHref={visiblePendingHref}
        />
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
            {href === "/chat" && unreadChatCount > 0 && <span className="nav-count bottom-count">{unreadChatCount > 99 ? "99+" : unreadChatCount}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function MobileHeaderNotifications({
  viewerId,
  notifications,
  pathname,
  pendingHref,
}: {
  viewerId: string;
  notifications: AppNotification[];
  pathname: string;
  pendingHref: string | null;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTarget(document.querySelector<HTMLElement>(".app-main .page-header"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, pendingHref]);

  if (!target) return null;

  return createPortal(
    <div className="mobile-header-notifications">
      <NotificationsBell viewerId={viewerId} initialNotifications={notifications} />
    </div>,
    target,
  );
}

function AppRouteLoading({ label }: { label: string }) {
  return <BrandedLoader label={`Opening ${label}`} />;
}
