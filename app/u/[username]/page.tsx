import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Coins, MapPin, MessageCircle, Phone, Star, Video } from "lucide-react";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("users")
    .select("display_name, username")
    .eq("username", username)
    .eq("is_banned", false)
    .eq("is_guest", false)
    .eq("role", "user")
    .maybeSingle();
  if (!account) return { title: "Profile not found" };
  return {
    title: `${account.display_name} (@${account.username})`,
    description: `Chat with ${account.display_name} on WetDreams. The first ten messages are free.`,
    alternates: { canonical: `/u/${account.username}` },
  };
}

export default async function PublicProfilePage({ params }: Params) {
  const { username } = await params;
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .eq("is_banned", false)
    .eq("is_guest", false)
    .eq("role", "user")
    .maybeSingle();
  if (!account) notFound();
  const [{ data: profile }, { data: media }, { data: ratings }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", account.id).single(),
    supabase.from("profile_media").select("*").eq("user_id", account.id).order("position"),
    supabase.from("ratings").select("score").eq("rated_user_id", account.id),
  ]);
  if (!profile) notFound();
  const primary = media?.find((item) => item.is_primary) ?? media?.[0];
  const rating = ratings?.length ? ratings.reduce((sum, item) => sum + item.score, 0) / ratings.length : null;

  return (
    <main className="public-profile">
      <section className="public-profile-hero">
        {primary && <Image src={primary.cloudinary_url} alt={`${account.display_name} profile`} fill priority sizes="100vw" />}
        <div className="public-profile-scrim" />
        <div className="public-brand"><Logo /></div>
        <div className="public-profile-copy">
          <div className="public-status"><span className={account.status === "online" ? "online" : ""} /> {account.status === "online" ? "Online now" : "Away"}</div>
          <h1>{account.display_name}{profile.age ? `, ${profile.age}` : ""}</h1>
          <div className="public-profile-meta">
            {account.is_verified && <span><BadgeCheck size={17} /> Verified</span>}
            {profile.location && <span><MapPin size={17} /> {profile.location}</span>}
            {rating && <span><Star size={16} fill="currentColor" /> {rating.toFixed(1)}</span>}
          </div>
          <p>{profile.bio}</p>
          <div className="tag-row dark-tags">{profile.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <Link href={`/login?next=/u/${username}`} className="button primary large"><MessageCircle size={20} /> Start chatting</Link>
        </div>
      </section>
      <section className="public-rates">
        <div><MessageCircle size={20} /><span>Chat</span><strong>{profile.free_chat_enabled ? "Free" : `${Number(profile.chat_rate_coins)} coins`}</strong><small>per message after 10</small></div>
        <div><Phone size={20} /><span>Audio</span><strong>{Number(profile.audio_call_rate_coins)} coins</strong><small>per minute</small></div>
        <div><Video size={20} /><span>Video</span><strong>{Number(profile.video_call_rate_coins)} coins</strong><small>per minute</small></div>
        <div><Coins size={20} /><span>First messages</span><strong>10 free</strong><small>in every new chat</small></div>
      </section>
      {(media ?? []).length > 1 && (
        <section className="public-gallery">
          {(media ?? []).slice(1).map((item) => item.media_type === "image" && (
            <div key={item.id}><Image src={item.cloudinary_url} alt="" fill loading="eager" sizes="(max-width: 700px) 100vw, 50vw" /></div>
          ))}
        </section>
      )}
    </main>
  );
}
