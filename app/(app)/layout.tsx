import { AppShell } from "@/components/app-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();

  if (viewer.account.is_banned) {
    return (
      <main className="center-page">
        <h1>Account suspended</h1>
        <p>Your account is currently unavailable. Contact support if you think this is a mistake.</p>
        <SignOutButton />
      </main>
    );
  }

  const supabase = await createClient();
  const [{ data: media }, { data: rooms }, { data: notifications }] = await Promise.all([
    supabase
      .from("profile_media")
      .select("cloudinary_url")
      .eq("user_id", viewer.id)
      .eq("is_primary", true)
      .maybeSingle(),
    supabase
      .from("chat_rooms")
      .select("id")
      .or(`user_a.eq.${viewer.id},user_b.eq.${viewer.id}`)
      .eq("status", "active")
      .neq("room_type", "random"),
    supabase
      .from("app_notifications")
      .select("*")
      .eq("user_id", viewer.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const roomIds = (rooms ?? []).map((room) => room.id);
  const { count: unreadChatCount } = roomIds.length
    ? await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("room_id", roomIds)
        .neq("sender_id", viewer.id)
        .is("read_at", null)
        .gt("expires_at", new Date().toISOString())
    : { count: 0 };

  return (
    <AppShell
      viewer={{
        id: viewer.id,
        name: viewer.account.display_name,
        username: viewer.account.username,
        avatar: media?.cloudinary_url ?? null,
        role: viewer.account.role,
        coins: Number(viewer.wallet.coins_balance),
        location: viewer.profile.location,
        isGuest: viewer.account.is_guest,
        requiresLocation: !viewer.account.is_guest && !viewer.profile.location?.trim(),
        requiresProfileImage: viewer.account.role === "user"
          && !viewer.account.is_guest
          && viewer.account.gender === "female"
          && !media?.cloudinary_url
          && Boolean(viewer.profile.location?.trim()),
        unreadChatCount: unreadChatCount ?? 0,
        chatRoomIds: roomIds,
        notifications: notifications ?? [],
      }}
    >
      {children}
    </AppShell>
  );
}
