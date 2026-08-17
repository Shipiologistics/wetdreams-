import type { Metadata } from "next";
import { ProfileSettings } from "@/components/profile-settings";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const [{ data: media }, { data: hostRequest }] = await Promise.all([
    supabase.from("profile_media").select("*").eq("user_id", viewer.id).order("position"),
    supabase.from("host_requests").select("*").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return <ProfileSettings account={viewer.account} profile={viewer.profile} media={media ?? []} hostRequest={hostRequest ?? null} />;
}
