"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeIndianRupee,
  Ban,
  Check,
  ClipboardList,
  Eye,
  LoaderCircle,
  Radio,
  RefreshCcw,
  Search,
  Settings,
  ShieldAlert,
  ShieldBan,
  UserRoundCog,
  UsersRound,
  X,
} from "lucide-react";
import clsx from "clsx";
import type { Database, Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, formatRelativeTime, messageForError } from "@/lib/format";

type Report = Database["public"]["Tables"]["reports"]["Row"];
type User = Database["public"]["Tables"]["users"]["Row"];
type Withdrawal = Database["public"]["Tables"]["withdrawal_requests"]["Row"];
type Action = Database["public"]["Tables"]["admin_actions"]["Row"];
type Block = Database["public"]["Tables"]["blocks"]["Row"];
type BlockEvent = Database["public"]["Tables"]["block_events"]["Row"];
type PlatformConfig = Database["public"]["Tables"]["platform_config"]["Row"];
type VisitorSession = Database["public"]["Tables"]["visitor_sessions"]["Row"];
type Wallet = Database["public"]["Tables"]["wallets"]["Row"];
type Section = "overview" | "visitors" | "reports" | "users" | "blocks" | "withdrawals" | "settings" | "audit";

const settingLabels: Record<string, { label: string; helper: string; step: string; min: string; max: string }> = {
  bean_inr_value: {
    label: "Bean to rupee",
    helper: "Creator payout value. Example: 1 bean = ₹0.60.",
    step: "0.01",
    min: "0.01",
    max: "100",
  },
  bean_payout_ratio: {
    label: "Bean earning ratio",
    helper: "How many beans creators earn from paid chat/call spend. 0.8 means 80%.",
    step: "0.01",
    min: "0",
    max: "1",
  },
  free_message_limit: {
    label: "Free messages",
    helper: "Messages allowed before paid chat rules apply.",
    step: "1",
    min: "0",
    max: "10000",
  },
};

export function AdminDashboard({
  reports,
  users,
  withdrawals,
  actions,
  blocks,
  blockEvents,
  platformConfig,
  visitors,
  wallets,
}: {
  reports: Report[];
  users: User[];
  withdrawals: Withdrawal[];
  actions: Action[];
  blocks: Block[];
  blockEvents: BlockEvent[];
  platformConfig: PlatformConfig[];
  visitors: VisitorSession[];
  wallets: Wallet[];
}) {
  const router = useRouter();
  const [section, setSection] = useState<Section>("overview");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [settingsDraft, setSettingsDraft] = useState(() => ({
    bean_inr_value: String(configNumber(platformConfig, "bean_inr_value", 0.8)),
    bean_payout_ratio: String(configNumber(platformConfig, "bean_payout_ratio", 0.8)),
    free_message_limit: String(configNumber(platformConfig, "free_message_limit", 10)),
  }));

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, 30000);
    return () => window.clearInterval(id);
  }, [router]);

  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const walletMap = useMemo(() => new Map(wallets.map((wallet) => [wallet.user_id, wallet])), [wallets]);
  const liveCutoff = now - 5 * 60 * 1000;
  const liveVisitors = visitors.filter((visitor) => new Date(visitor.last_seen_at).getTime() >= liveCutoff);
  const openReports = reports.filter((report) => ["open", "reviewing"].includes(report.status)).length;
  const pendingWithdrawals = withdrawals.filter((withdrawal) => withdrawal.status === "pending").length;
  const bannedUsers = users.filter((user) => user.is_banned).length;
  const filteredUsers = users.filter((user) =>
    `${user.display_name} ${user.username} ${user.role}`.toLowerCase().includes(search.toLowerCase()),
  );

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

  async function saveSetting(key: keyof typeof settingsDraft) {
    const value = Number(settingsDraft[key]);
    if (!Number.isFinite(value)) return setMessage("Enter a valid number.");
    const label = settingLabels[key].label;
    await run(`setting-${key}`, async () => createClient().rpc("admin_update_platform_config", {
      p_key: key,
      p_value: value,
      p_notes: `${label} changed to ${value}`,
    }));
  }

  const navItems: Array<{ key: Section; label: string; icon: typeof ShieldAlert; count?: number }> = [
    { key: "overview", label: "Overview", icon: Radio },
    { key: "visitors", label: "Visitors", icon: Eye, count: liveVisitors.length },
    { key: "reports", label: "Reports", icon: ShieldAlert, count: openReports },
    { key: "users", label: "Users", icon: UsersRound, count: users.length },
    { key: "blocks", label: "Blocks", icon: ShieldBan, count: blocks.length },
    { key: "withdrawals", label: "Payouts", icon: BadgeIndianRupee, count: pendingWithdrawals },
    { key: "settings", label: "Settings", icon: Settings },
    { key: "audit", label: "Audit", icon: ClipboardList },
  ];

  return (
    <div className="admin-console">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-title">
          <span className="eyebrow">Operations</span>
          <h1>Admin</h1>
        </div>
        <nav aria-label="Admin sections">
          {navItems.map(({ key, label, icon: Icon, count }) => (
            <button key={key} className={clsx(section === key && "active")} type="button" onClick={() => setSection(key)}>
              <Icon size={18} />
              <span>{label}</span>
              {typeof count === "number" && <strong>{count}</strong>}
            </button>
          ))}
        </nav>
      </aside>

      <main className="admin-workspace">
        <header className="admin-topbar">
          <div>
            <span className="eyebrow">{section}</span>
            <h2>{titleForSection(section)}</h2>
          </div>
          <button className="button secondary small" type="button" onClick={() => router.refresh()}>
            <RefreshCcw size={16} /> Refresh
          </button>
        </header>

        {message && <div className="page-notice" role="status">{message}<button title="Dismiss" onClick={() => setMessage(null)}><X size={15} /></button></div>}

        {section === "overview" && (
          <>
            <section className="admin-metrics expanded">
              <Metric icon={Eye} label="Live visitors" value={liveVisitors.length} />
              <Metric icon={UsersRound} label="Total visitors" value={visitors.length} />
              <Metric icon={ShieldAlert} label="Open reports" value={openReports} />
              <Metric icon={UserRoundCog} label="Accounts" value={users.length} />
              <Metric icon={Ban} label="Suspended" value={bannedUsers} />
              <Metric icon={BadgeIndianRupee} label="Pending payouts" value={pendingWithdrawals} />
            </section>
            <section className="admin-grid-two">
              <Panel title="Recent reports">
                {reports.slice(0, 5).map((report) => <ReportLine key={report.id} report={report} userMap={userMap} />)}
                {!reports.length && <div className="inline-empty">No reports.</div>}
              </Panel>
              <Panel title="Recent visitors">
                {visitors.slice(0, 6).map((visitor) => <VisitorLine key={visitor.session_id} visitor={visitor} userMap={userMap} />)}
                {!visitors.length && <div className="inline-empty">No visitors yet.</div>}
              </Panel>
            </section>
          </>
        )}

        {section === "visitors" && (
          <div className="admin-list">
            {visitors.map((visitor) => <VisitorRow key={visitor.session_id} visitor={visitor} userMap={userMap} live={liveVisitors.some((item) => item.session_id === visitor.session_id)} />)}
            {!visitors.length && <div className="inline-empty">No visitor sessions yet.</div>}
          </div>
        )}

        {section === "reports" && (
          <div className="admin-list">
            {reports.map((report) => {
              const reporter = userMap.get(report.reporter_id);
              const reported = userMap.get(report.reported_user_id);
              return (
                <article className="admin-row" key={report.id}>
                  <div className="admin-row-main">
                    <span className={`status-label ${report.status}`}>{report.status}</span>
                    <h3>{reporter?.display_name ?? "User"} reported {reported?.display_name ?? "User"}</h3>
                    <p>{report.reason}</p>
                    <dl className="admin-facts">
                      <div><dt>Reporter</dt><dd>@{reporter?.username ?? "unknown"}</dd></div>
                      <div><dt>Reported</dt><dd>@{reported?.username ?? "unknown"}</dd></div>
                      <div><dt>Room</dt><dd>{shortId(report.room_id)}</dd></div>
                    </dl>
                    {report.admin_notes && <p className="admin-note">Note: {report.admin_notes}</p>}
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

        {section === "users" && (
          <>
            <label className="search-field admin-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search accounts" /></label>
            <div className="admin-list">
              {filteredUsers.map((user) => {
                const wallet = walletMap.get(user.id);
                return (
                  <article className="admin-row compact-row" key={user.id}>
                    <div className="admin-row-main">
                      <span className={`status-label ${user.is_banned ? "rejected" : "resolved"}`}>{user.is_banned ? "suspended" : "active"}</span>
                      <h3>{user.display_name}</h3>
                      <p>@{user.username} · {user.role} · {user.gender ?? "unknown"} · {user.status}</p>
                      <dl className="admin-facts">
                        <div><dt>Coins</dt><dd>{formatMoney(wallet?.coins_balance ?? 0)}</dd></div>
                        <div><dt>Beans</dt><dd>{formatMoney(wallet?.beans_balance ?? 0)}</dd></div>
                        <div><dt>Joined</dt><dd>{formatRelativeTime(user.created_at)}</dd></div>
                      </dl>
                    </div>
                    <div className="admin-row-actions">
                      <button className="button secondary small" onClick={() => adjustWallet(user)}><BadgeIndianRupee size={16} /> Wallet</button>
                      {user.role !== "admin" && <button className="button danger small" onClick={() => toggleBan(user)}><Ban size={16} /> {user.is_banned ? "Restore" : "Suspend"}</button>}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {section === "blocks" && (
          <div className="admin-grid-two">
            <Panel title="Current blocks">
              {blocks.map((block) => <BlockLine key={`${block.blocker_id}-${block.blocked_id}`} block={block} userMap={userMap} />)}
              {!blocks.length && <div className="inline-empty">No active blocks.</div>}
            </Panel>
            <Panel title="Block events">
              {blockEvents.map((event) => <BlockEventLine key={event.id} event={event} userMap={userMap} />)}
              {!blockEvents.length && <div className="inline-empty">No block events.</div>}
            </Panel>
          </div>
        )}

        {section === "withdrawals" && (
          <div className="admin-list">
            {withdrawals.map((withdrawal) => (
              <article className="admin-row compact-row" key={withdrawal.id}>
                <div className="admin-row-main">
                  <span className={`status-label ${withdrawal.status}`}>{withdrawal.status}</span>
                  <h3>{userMap.get(withdrawal.user_id)?.display_name ?? "User"}</h3>
                  <p>{formatMoney(withdrawal.beans_requested)} beans · ₹{formatMoney(withdrawal.inr_amount)}</p>
                  <time>{formatRelativeTime(withdrawal.created_at)}</time>
                </div>
                {withdrawal.status === "pending" && (
                  <div className="admin-row-actions">
                    <button className="button secondary small" onClick={() => reviewWithdrawal(withdrawal, false)}>Reject</button>
                    <button className="button primary small" onClick={() => reviewWithdrawal(withdrawal, true)}>Mark paid</button>
                  </div>
                )}
              </article>
            ))}
            {!withdrawals.length && <div className="inline-empty">No withdrawal requests.</div>}
          </div>
        )}

        {section === "settings" && (
          <div className="settings-list">
            {(Object.keys(settingLabels) as Array<keyof typeof settingsDraft>).map((key) => {
              const meta = settingLabels[key];
              return (
                <form className="setting-row" key={key} onSubmit={(event) => { event.preventDefault(); void saveSetting(key); }}>
                  <div>
                    <h3>{meta.label}</h3>
                    <p>{meta.helper}</p>
                  </div>
                  <label>
                    Value
                    <input
                      value={settingsDraft[key]}
                      onChange={(event) => setSettingsDraft((current) => ({ ...current, [key]: event.target.value }))}
                      type="number"
                      step={meta.step}
                      min={meta.min}
                      max={meta.max}
                    />
                  </label>
                  <button className="button primary small" disabled={pending === `setting-${key}`} type="submit">
                    {pending === `setting-${key}` ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Save
                  </button>
                </form>
              );
            })}
          </div>
        )}

        {section === "audit" && (
          <div className="audit-list">
            {actions.map((action) => (
              <div key={action.id}>
                <ClipboardList size={17} />
                <div><strong>{action.action_type.replaceAll("_", " ")}</strong><span>{action.notes}</span></div>
                <time>{formatRelativeTime(action.created_at)}</time>
              </div>
            ))}
            {!actions.length && <div className="inline-empty">No admin actions yet.</div>}
          </div>
        )}
      </main>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: number | string }) {
  return <div><Icon size={19} /><span>{label}</span><strong>{value}</strong></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="admin-panel"><h3>{title}</h3>{children}</section>;
}

function ReportLine({ report, userMap }: { report: Report; userMap: Map<string, User> }) {
  return (
    <div className="admin-mini-row">
      <span className={`status-dot ${report.status}`} />
      <div><strong>{userMap.get(report.reported_user_id)?.display_name ?? "User"}</strong><span>{report.reason}</span></div>
      <time>{formatRelativeTime(report.created_at)}</time>
    </div>
  );
}

function VisitorLine({ visitor, userMap }: { visitor: VisitorSession; userMap: Map<string, User> }) {
  return (
    <div className="admin-mini-row">
      <span className="status-dot live" />
      <div><strong>{visitor.user_id ? userMap.get(visitor.user_id)?.display_name ?? "User" : "Guest visitor"}</strong><span>{visitor.path}</span></div>
      <time>{formatRelativeTime(visitor.last_seen_at)}</time>
    </div>
  );
}

function VisitorRow({ visitor, userMap, live }: { visitor: VisitorSession; userMap: Map<string, User>; live: boolean }) {
  const user = visitor.user_id ? userMap.get(visitor.user_id) : null;
  return (
    <article className="admin-row compact-row">
      <div className="admin-row-main">
        <span className={`status-label ${live ? "resolved" : "pending"}`}>{live ? "live" : "seen"}</span>
        <h3>{user?.display_name ?? "Guest visitor"}</h3>
        <p>{user ? `@${user.username}` : shortId(visitor.session_id)} · {visitor.path}</p>
        <dl className="admin-facts">
          <div><dt>First seen</dt><dd>{formatRelativeTime(visitor.first_seen_at)}</dd></div>
          <div><dt>Last seen</dt><dd>{formatRelativeTime(visitor.last_seen_at)}</dd></div>
          <div><dt>Device</dt><dd>{shortId(visitor.device_hash)}</dd></div>
        </dl>
      </div>
    </article>
  );
}

function BlockLine({ block, userMap }: { block: Block; userMap: Map<string, User> }) {
  const blocker = userMap.get(block.blocker_id);
  const blocked = userMap.get(block.blocked_id);
  return (
    <div className="admin-mini-row block-row">
      <ShieldBan size={16} />
      <div><strong>{blocker?.display_name ?? "User"} blocked {blocked?.display_name ?? "User"}</strong><span>@{blocker?.username ?? "unknown"} to @{blocked?.username ?? "unknown"}</span></div>
      <time>{formatRelativeTime(block.created_at)}</time>
    </div>
  );
}

function BlockEventLine({ event, userMap }: { event: BlockEvent; userMap: Map<string, User> }) {
  return (
    <div className="admin-mini-row block-row">
      <Ban size={16} />
      <div><strong>{userMap.get(event.blocker_id)?.display_name ?? "User"} blocked {userMap.get(event.blocked_id)?.display_name ?? "User"}</strong><span>Device {shortId(event.blocked_device_hash)}</span></div>
      <time>{formatRelativeTime(event.created_at)}</time>
    </div>
  );
}

function configNumber(config: PlatformConfig[], key: string, fallback: number) {
  const value = config.find((item) => item.key === key)?.value;
  const parsed = jsonToNumber(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function jsonToNumber(value: Json | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return NaN;
}

function shortId(value: string | null) {
  if (!value) return "none";
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function titleForSection(section: Section) {
  const titles: Record<Section, string> = {
    overview: "Control center",
    visitors: "Visitor sessions",
    reports: "Reports queue",
    users: "Account management",
    blocks: "Blocks and device risk",
    withdrawals: "Bean payouts",
    settings: "Platform settings",
    audit: "Admin audit log",
  };
  return titles[section];
}
