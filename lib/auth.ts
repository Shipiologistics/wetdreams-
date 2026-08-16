import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) return null;

  const userId = data.claims.sub;
  const [{ data: account }, { data: profile }, { data: wallet }] = await Promise.all([
    supabase.from("users").select("*").eq("id", userId).single(),
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    supabase.from("wallets").select("*").eq("user_id", userId).single(),
  ]);

  if (!account || !profile || !wallet) return null;

  return { id: userId, claims: data.claims, account, profile, wallet };
});

export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function requireAdmin() {
  const viewer = await requireViewer();
  if (viewer.account.role !== "admin") redirect("/discover");
  return viewer;
}
