"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Coins, MessageCircle, Phone, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/format";
import type { AppNotification } from "@/lib/view-models";

type NotificationsBellProps = {
  viewerId: string;
  initialNotifications: AppNotification[];
};

export function NotificationsBell({ viewerId, initialNotifications }: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read_at).length, [notifications]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`app-notifications:${viewerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "app_notifications", filter: `user_id=eq.${viewerId}` },
        (payload) => {
          const notification = payload.new as AppNotification;
          setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 20));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_notifications", filter: `user_id=eq.${viewerId}` },
        (payload) => {
          const notification = payload.new as AppNotification;
          setNotifications((current) => current.map((item) => item.id === notification.id ? notification : item));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [viewerId]);

  async function markRead(ids?: string[]) {
    const unreadIds = ids ?? notifications.filter((notification) => !notification.read_at).map((notification) => notification.id);
    if (!unreadIds.length) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((notification) => (
      unreadIds.includes(notification.id) ? { ...notification, read_at: notification.read_at ?? readAt } : notification
    )));
    await createClient().rpc("mark_notifications_read", { p_notification_ids: unreadIds });
  }

  function toggleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) void markRead();
  }

  return (
    <div className="notifications-widget">
      <button className="notification-button" type="button" onClick={toggleOpen} aria-label="Notifications">
        <Bell size={20} />
        {unreadCount > 0 && <span className="notification-dot" aria-label={`${unreadCount} unread notifications`}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <div className="notifications-panel" role="dialog" aria-label="Notifications">
          <div className="notifications-panel-head">
            <div>
              <span className="eyebrow">Updates</span>
              <strong>Notifications</strong>
            </div>
            <button className="icon-button small" type="button" onClick={() => setOpen(false)} aria-label="Close notifications">
              <X size={17} />
            </button>
          </div>
          {notifications.length ? (
            <div className="notifications-list">
              {notifications.map((notification) => (
                <Link
                  key={notification.id}
                  className={clsx("notification-item", !notification.read_at && "unread")}
                  href={notification.href}
                  onClick={() => {
                    setOpen(false);
                    if (!notification.read_at) void markRead([notification.id]);
                  }}
                >
                  <span className={clsx("notification-icon", notification.type)}>
                    <NotificationIcon type={notification.type} />
                  </span>
                  <span className="notification-copy">
                    <strong>{notification.title}</strong>
                    <span>{notification.body}</span>
                    <time>{formatRelativeTime(notification.created_at)}</time>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="notifications-empty">
              <CheckCheck size={22} />
              <span>No notifications yet.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationIcon({ type }: { type: string }) {
  if (type === "message") return <MessageCircle size={16} />;
  if (type === "call") return <Phone size={16} />;
  if (type === "tip" || type === "wallet") return <Coins size={16} />;
  return <Sparkles size={16} />;
}
