import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DiscoverGrid } from "@/components/discover-grid";
import { LegalLinks } from "@/components/legal-links";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DiscoveryProfile } from "@/lib/view-models";

export const metadata: Metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const viewer = await getViewer();
  const supabase = await createClient();
  const requestHeaders = await headers();
  const discoverySeed = viewer?.id
    ?? [
      requestHeaders.get("x-forwarded-for"),
      requestHeaders.get("user-agent"),
      requestHeaders.get("accept-language"),
    ].join("|");

  await supabase.rpc("refresh_stale_presence");

  const activeStatuses = ["ringing", "ongoing"];
  let query = supabase
    .from("users")
    .select("*")
    .eq("is_banned", false)
    .eq("is_guest", false)
    .eq("is_verified", true)
    .eq("role", "user")
    .eq("gender", "female")
    .order("created_at", { ascending: false });

  if (viewer) query = query.neq("id", viewer.id);

  const { data: accounts } = await query;
  const uniqueAccounts = Array.from(new Map((accounts ?? []).map((account) => [account.id, account])).values());
  const ids = uniqueAccounts.map((account) => account.id);
  const [{ data: profiles }, { data: media }, { data: ratings }, { data: activeCalls }, favoritesResult] = ids.length
    ? await Promise.all([
        supabase.from("profiles").select("*").in("user_id", ids),
        supabase.from("profile_media").select("*").in("user_id", ids).order("position"),
        supabase.from("ratings").select("rated_user_id, score").in("rated_user_id", ids),
        supabase.from("calls").select("caller_id, receiver_id, status").in("status", activeStatuses).or(`caller_id.in.(${ids.join(",")}),receiver_id.in.(${ids.join(",")})`),
        viewer
          ? supabase.from("favorites").select("favorite_user_id").eq("user_id", viewer.id)
          : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const favoriteIds = new Set((favoritesResult.data ?? []).map((favorite) => favorite.favorite_user_id));
  const busyIds = new Set((activeCalls ?? []).flatMap((call) => [call.caller_id, call.receiver_id]).filter((id): id is string => ids.includes(id ?? "")));
  const randomRank = new Map(ids.map((id) => [id, seededRank(`${discoverySeed}:${id}`)]));
  const models: DiscoveryProfile[] = uniqueAccounts.flatMap((account) => {
    const profile = profileMap.get(account.id);
    if (!profile) return [];
    const scores = (ratings ?? []).filter((rating) => rating.rated_user_id === account.id).map((rating) => rating.score);
    return [{
      account: busyIds.has(account.id) ? { ...account, status: "busy" } : account,
      profile,
      media: (media ?? []).filter((item) => item.user_id === account.id),
      rating: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      favorite: favoriteIds.has(account.id),
    }];
  }).sort((first, second) => {
    const statusRank = { online: 0, busy: 1, in_call: 1, offline: 2 } as Record<string, number>;
    return (statusRank[first.account.status] ?? 2) - (statusRank[second.account.status] ?? 2)
      || (randomRank.get(first.account.id) ?? 0) - (randomRank.get(second.account.id) ?? 0);
  });

  const content = (
    <div className="page-shell discover-page public-discover">
      <header className="page-header">
        <div>
          <span className="eyebrow">People worth meeting</span>
          <h1>Discover</h1>
        </div>
        {viewer ? (
          <div className="header-balance">
            <span>Coins</span>
            <strong>{Number(viewer.wallet.coins_balance).toLocaleString("en-IN")}</strong>
          </div>
        ) : (
          <Link className="button secondary" href="/login">Sign in</Link>
        )}
      </header>
      <DiscoverGrid profiles={models} viewerId={viewer?.id ?? null} />
      {!viewer && <LegalLinks compact />}
    </div>
  );

  if (!viewer) return content;

  const [{ data: avatar }, { data: rooms }, { data: notifications }] = await Promise.all([
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
        avatar: avatar?.cloudinary_url ?? null,
        role: viewer.account.role,
        coins: Number(viewer.wallet.coins_balance),
        location: viewer.profile.location,
        isGuest: viewer.account.is_guest,
        requiresLocation: !viewer.account.is_guest && !viewer.profile.location?.trim(),
        requiresProfileImage: viewer.account.role === "user"
          && !viewer.account.is_guest
          && viewer.account.gender === "female"
          && !avatar?.cloudinary_url
          && Boolean(viewer.profile.location?.trim()),
        unreadChatCount: unreadChatCount ?? 0,
        chatRoomIds: roomIds,
        notifications: notifications ?? [],
      }}
    >
      {content}
    </AppShell>
  );
}

function seededRank(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}
