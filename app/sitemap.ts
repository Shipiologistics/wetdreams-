import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const legalRoutes = ["/privacy", "/terms", "/refund-policy", "/host-policy", "/safety"];
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("users")
    .select("username, updated_at")
    .eq("is_banned", false)
    .eq("is_guest", false)
    .eq("role", "user");
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    ...legalRoutes.map((route) => ({
      url: `${base}${route}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...(users ?? []).map((user) => ({
      url: `${base}/u/${user.username}`,
      lastModified: user.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
