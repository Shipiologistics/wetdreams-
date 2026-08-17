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
  const { data: media } = await supabase
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
      }}
    >
      {children}
    </AppShell>
  );
}
