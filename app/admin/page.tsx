import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin-dashboard";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const supabase = createServiceClient();
  const [
    { data: reports },
    { data: users },
    { data: withdrawals },
    { data: actions },
    { data: blocks },
    { data: blockEvents },
    { data: platformConfig },
    { data: visitors },
    { data: wallets },
    { data: profiles },
    { data: media },
    { data: authUsers },
  ] = await Promise.all([
    supabase.from("reports").select("*").order("created_at", { ascending: false }),
    supabase.from("users").select("*").order("created_at", { ascending: false }),
    supabase.from("withdrawal_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("admin_actions").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("blocks").select("*").order("created_at", { ascending: false }),
    supabase.from("block_events").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("platform_config").select("*").order("key", { ascending: true }),
    supabase.from("visitor_sessions").select("*").order("last_seen_at", { ascending: false }).limit(300),
    supabase.from("wallets").select("*"),
    supabase.from("profiles").select("*"),
    supabase.from("profile_media").select("*").order("position", { ascending: true }),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const contactNumbers = Object.fromEntries(
    (authUsers?.users ?? []).flatMap((user) => {
      const contactNumber = user.user_metadata?.contact_number;
      return typeof contactNumber === "string" && contactNumber ? [[user.id, contactNumber]] : [];
    }),
  );

  return (
    <AdminDashboard
      reports={reports ?? []}
      users={users ?? []}
      withdrawals={withdrawals ?? []}
      actions={actions ?? []}
      blocks={blocks ?? []}
      blockEvents={blockEvents ?? []}
      platformConfig={platformConfig ?? []}
      visitors={visitors ?? []}
      wallets={wallets ?? []}
      profiles={profiles ?? []}
      media={media ?? []}
      contactNumbers={contactNumbers}
    />
  );
}
