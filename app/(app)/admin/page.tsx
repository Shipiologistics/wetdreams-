import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin-dashboard";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: reports }, { data: users }, { data: withdrawals }, { data: actions }] = await Promise.all([
    supabase.from("reports").select("*").order("created_at", { ascending: false }),
    supabase.from("users").select("*").order("created_at", { ascending: false }),
    supabase.from("withdrawal_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("admin_actions").select("*").order("created_at", { ascending: false }).limit(100),
  ]);

  return <AdminDashboard reports={reports ?? []} users={users ?? []} withdrawals={withdrawals ?? []} actions={actions ?? []} />;
}
