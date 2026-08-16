import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  const { data: users } = await supabase.from("users").select("username, updated_at").eq("is_banned", false);
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    ...(users ?? []).map((user) => ({
      url: `${base}/u/${user.username}`,
      lastModified: user.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
