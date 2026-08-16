import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DiscoverGrid } from "@/components/discover-grid";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DiscoveryProfile } from "@/lib/view-models";

export const metadata: Metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const viewer = await getViewer();
  const supabase = await createClient();

  let query = supabase
    .from("users")
    .select("*")
    .eq("is_banned", false)
    .eq("is_guest", false)
    .eq("role", "user")
    .eq("gender", "female")
    .order("status", { ascending: false })
    .order("created_at", { ascending: false });

  if (viewer) query = query.neq("id", viewer.id);

  const { data: accounts } = await query;
  const uniqueAccounts = Array.from(new Map((accounts ?? []).map((account) => [account.id, account])).values());
  const ids = uniqueAccounts.map((account) => account.id);
  const [{ data: profiles }, { data: media }, { data: ratings }, favoritesResult] = ids.length
    ? await Promise.all([
        supabase.from("profiles").select("*").in("user_id", ids),
        supabase.from("profile_media").select("*").in("user_id", ids).order("position"),
        supabase.from("ratings").select("rated_user_id, score").in("rated_user_id", ids),
        viewer
          ? supabase.from("favorites").select("favorite_user_id").eq("user_id", viewer.id)
          : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const favoriteIds = new Set((favoritesResult.data ?? []).map((favorite) => favorite.favorite_user_id));
  const models: DiscoveryProfile[] = uniqueAccounts.flatMap((account) => {
    const profile = profileMap.get(account.id);
    if (!profile) return [];
    const scores = (ratings ?? []).filter((rating) => rating.rated_user_id === account.id).map((rating) => rating.score);
    return [{
      account,
      profile,
      media: (media ?? []).filter((item) => item.user_id === account.id),
      rating: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      favorite: favoriteIds.has(account.id),
    }];
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
    </div>
  );

  if (!viewer) return content;

  const { data: avatar } = await supabase
    .from("profile_media")
    .select("cloudinary_url")
    .eq("user_id", viewer.id)
    .eq("is_primary", true)
    .maybeSingle();

  return (
    <AppShell
      viewer={{
        name: viewer.account.display_name,
        username: viewer.account.username,
        avatar: avatar?.cloudinary_url ?? null,
        role: viewer.account.role,
        coins: Number(viewer.wallet.coins_balance),
        location: viewer.profile.location,
      }}
    >
      {content}
    </AppShell>
  );
}
