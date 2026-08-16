"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeIndianRupee,
  Ban,
  Check,
  ClipboardList,
  LoaderCircle,
  Search,
  ShieldAlert,
  UserRoundCog,
  X,
} from "lucide-react";
import clsx from "clsx";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, formatRelativeTime, messageForError } from "@/lib/format";

type Report = Database["public"]["Tables"]["reports"]["Row"];
type User = Database["public"]["Tables"]["users"]["Row"];
type Withdrawal = Database["public"]["Tables"]["withdrawal_requests"]["Row"];
type Action = Database["public"]["Tables"]["admin_actions"]["Row"];
type Tab = "reports" | "users" | "withdrawals" | "audit";

export function AdminDashboard({ reports, users, withdrawals, actions }: { reports: Report[]; users: User[]; withdrawals: Withdrawal[]; actions: Action[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("reports");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  async function run(id: string, operation: () => Promise<{ error: { message: string } | null }>) {
    setPending(id);
    setMessage(null);
    const result = await operation();
    setPending(null);
    if (result.error) return setMessage(messageForError(result.error.message));
    router.refresh();
  }

  async function reviewReport(report: Report, status: "reviewing" | "resolved" | "dismissed") {
    const notes = window.prompt("Admin notes", report.admin_notes ?? "") ?? "";
    await run(report.id, async () => createClient().rpc("admin_review_report", { p_report_id: report.id, p_status: status, p_notes: notes }));
  }

  async function toggleBan(user: User) {
    const notes = window.prompt(user.is_banned ? "Reason for restoring access" : "Reason for suspension");
    if (!notes) return;
    await run(user.id, async () => createClient().rpc("admin_set_user_ban", { p_target_user: user.id, p_banned: !user.is_banned, p_notes: notes }));
  }

  async function adjustWallet(user: User) {
    const currency = window.prompt("Currency: coin or bean", "coin");
    if (currency !== "coin" && currency !== "bean") return;
    const amount = Number(window.prompt("Amount: use a negative number to deduct", "100"));
    if (!amount) return;
    const notes = window.prompt("Reason for adjustment");
    if (!notes) return;
    await run(user.id, async () => createClient().rpc("admin_adjust_wallet", { p_target_user: user.id, p_currency: currency, p_amount: amount, p_notes: notes }));
  }

  async function reviewWithdrawal(withdrawal: Withdrawal, approve: boolean) {
    const notes = window.prompt(approve ? "Payout reference or note" : "Reason for rejection") ?? "Reviewed by admin";
    await run(withdrawal.id, async () => createClient().rpc("admin_review_withdrawal", { p_request_id: withdrawal.id, p_approve: approve, p_notes: notes }));
  }

  const filteredUsers = users.filter((user) => `${user.display_name} ${user.username}`.toLowerCase().includes(search.toLowerCase()));
  const openReports = reports.filter((report) => ["open", "reviewing"].includes(report.status)).length;
  const pendingWithdrawals = withdrawals.filter((withdrawal) => withdrawal.status === "pending").length;

  return (
    <div className="page-shell admin-page">
      <header className="page-header">
        <div><span className="eyebrow">Operations</span><h1>Admin</h1></div>
      </header>

      <section className="admin-metrics">
        <div><ShieldAlert size={19} /><span>Open reports</span><strong>{openReports}</strong></div>
        <div><UserRoundCog size={19} /><span>Accounts</span><strong>{users.length}</strong></div>
        <div><BadgeIndianRupee size={19} /><span>Pending payouts</span><strong>{pendingWithdrawals}</strong></div>
      </section>

      <div className="admin-tabs" role="tablist">
        {(["reports", "users", "withdrawals", "audit"] as Tab[]).map((item) => (
          <button key={item} className={clsx(tab === item && "active")} type="button" onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>

      {message && <div className="page-notice" role="status">{message}<button title="Dismiss" onClick={() => setMessage(null)}><X size={15} /></button></div>}

      {tab === "reports" && (
        <div className="admin-list">
          {reports.map((report) => {
            const reporter = userMap.get(report.reporter_id);
            const reported = userMap.get(report.reported_user_id);
            return (
              <article className="admin-row" key={report.id}>
                <div className="admin-row-main">
                  <span className={`status-label ${report.status}`}>{report.status}</span>
                  <h2>{reporter?.display_name ?? "User"} reported {reported?.display_name ?? "User"}</h2>
                  <p>{report.reason}</p>
                  <time>{formatRelativeTime(report.created_at)}</time>
                </div>
                <div className="admin-row-actions">
                  <button className="button secondary small" disabled={pending === report.id} onClick={() => reviewReport(report, "dismissed")}><X size={16} /> Dismiss</button>
                  <button className="button primary small" disabled={pending === report.id} onClick={() => reviewReport(report, "resolved")}>
                    {pending === report.id ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Resolve
                  </button>
                </div>
              </article>
            );
          })}
          {!reports.length && <div className="inline-empty">No reports.</div>}
        </div>
      )}

      {tab === "users" && (
        <>
          <label className="search-field admin-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search accounts" /></label>
          <div className="admin-list">
            {filteredUsers.map((user) => (
              <article className="admin-row compact-row" key={user.id}>
                <div className="admin-row-main"><h2>{user.display_name}</h2><p>@{user.username} · {user.role}</p><span className={`status-label ${user.is_banned ? "rejected" : "resolved"}`}>{user.is_banned ? "suspended" : "active"}</span></div>
                <div className="admin-row-actions">
                  <button className="button secondary small" onClick={() => adjustWallet(user)}><BadgeIndianRupee size={16} /> Wallet</button>
                  {user.role !== "admin" && <button className="button danger small" onClick={() => toggleBan(user)}><Ban size={16} /> {user.is_banned ? "Restore" : "Suspend"}</button>}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {tab === "withdrawals" && (
        <div className="admin-list">
          {withdrawals.map((withdrawal) => (
            <article className="admin-row compact-row" key={withdrawal.id}>
              <div className="admin-row-main"><span className={`status-label ${withdrawal.status}`}>{withdrawal.status}</span><h2>{userMap.get(withdrawal.user_id)?.display_name ?? "User"}</h2><p>{formatMoney(withdrawal.beans_requested)} beans · ₹{formatMoney(withdrawal.inr_amount)}</p><time>{formatRelativeTime(withdrawal.created_at)}</time></div>
              {withdrawal.status === "pending" && <div className="admin-row-actions"><button className="button secondary small" onClick={() => reviewWithdrawal(withdrawal, false)}>Reject</button><button className="button primary small" onClick={() => reviewWithdrawal(withdrawal, true)}>Mark paid</button></div>}
            </article>
          ))}
          {!withdrawals.length && <div className="inline-empty">No withdrawal requests.</div>}
        </div>
      )}

      {tab === "audit" && (
        <div className="audit-list">
          {actions.map((action) => (
            <div key={action.id}><ClipboardList size={17} /><div><strong>{action.action_type.replaceAll("_", " ")}</strong><span>{action.notes}</span></div><time>{formatRelativeTime(action.created_at)}</time></div>
          ))}
          {!actions.length && <div className="inline-empty">No admin actions yet.</div>}
        </div>
      )}
    </div>
  );
}
