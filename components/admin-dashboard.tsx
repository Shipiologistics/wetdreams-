"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  BadgeIndianRupee,
  Ban,
  Check,
  ClipboardList,
  Eye,
  LoaderCircle,
  LogOut,
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
type HostRequest = Database["public"]["Tables"]["host_requests"]["Row"];
type Action = Database["public"]["Tables"]["admin_actions"]["Row"];
type Block = Database["public"]["Tables"]["blocks"]["Row"];
type BlockEvent = Database["public"]["Tables"]["block_events"]["Row"];
type PlatformConfig = Database["public"]["Tables"]["platform_config"]["Row"];
type VisitorSession = Database["public"]["Tables"]["visitor_sessions"]["Row"];
type Wallet = Database["public"]["Tables"]["wallets"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type ProfileMedia = Database["public"]["Tables"]["profile_media"]["Row"];
type Section = "overview" | "visitors" | "reports" | "hosts" | "users" | "blocks" | "withdrawals" | "settings" | "audit";
type GenderFilter = "all" | "male" | "female";

function withdrawalStatusLabel(status: string) {
  if (status === "paid" || status === "approved") return "complete";
  return status;
}

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
    helper: "Starter messages allowed before per-minute paid chat applies.",
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
  hostRequests,
  profiles,
  media,
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
  hostRequests: HostRequest[];
  profiles: Profile[];
  media: ProfileMedia[];
}) {
  const router = useRouter();
  const [section, setSection] = useState<Section>("overview");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [profileViewer, setProfileViewer] = useState<User | null>(null);
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
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.user_id, profile])), [profiles]);
  const mediaMap = useMemo(() => {
    const map = new Map<string, ProfileMedia[]>();
    for (const item of media) {
      const current = map.get(item.user_id) ?? [];
      current.push(item);
      map.set(item.user_id, current);
    }
    for (const items of map.values()) {
      items.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position);
    }
    return map;
  }, [media]);
  const liveCutoff = now - 5 * 60 * 1000;
  const liveVisitors = visitors.filter((visitor) => visitor.presence === "online" && new Date(visitor.last_seen_at).getTime() >= liveCutoff);
  const openReports = reports.filter((report) => ["open", "reviewing"].includes(report.status)).length;
  const pendingWithdrawals = withdrawals.filter((withdrawal) => withdrawal.status === "pending").length;
  const pendingHostRequests = hostRequests.filter((request) => request.status === "pending").length;
  const pendingApprovals = users.filter((user) => user.role === "user" && !user.is_guest && !user.is_verified && !user.is_banned).length;
  const bannedUsers = users.filter((user) => user.is_banned).length;
  const filteredUsers = users.filter((user) => {
    const matchesSearch = `${user.display_name} ${user.username} ${user.role} ${user.gender ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesGender = genderFilter === "all" || user.gender === genderFilter;
    return matchesSearch && matchesGender;
  });

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

  async function toggleVerification(user: User) {
    const approve = !user.is_verified;
    const notes = window.prompt(approve ? "Approval note" : "Reason for hiding from Discover") ?? "";
    await run(`verify-${user.id}`, async () => createClient().rpc("admin_set_user_verification", {
      p_target_user: user.id,
      p_verified: approve,
      p_notes: notes,
    }));
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

  async function reviewHostRequest(request: HostRequest, approve: boolean) {
    const notes = window.prompt(approve ? "Approval note" : "Reason for rejection") ?? "";
    await run(`host-${request.id}`, async () => createClient().rpc("admin_review_host_request", {
      p_request_id: request.id,
      p_approve: approve,
      p_notes: notes,
    }));
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

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const navItems: Array<{ key: Section; label: string; icon: typeof ShieldAlert; count?: number }> = [
    { key: "overview", label: "Overview", icon: Radio },
    { key: "visitors", label: "Visitors", icon: Eye, count: liveVisitors.length },
    { key: "reports", label: "Reports", icon: ShieldAlert, count: openReports },
    { key: "hosts", label: "Host requests", icon: UserRoundCog, count: pendingHostRequests },
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
          <div className="admin-topbar-actions">
            <button className="button secondary small" type="button" onClick={() => router.refresh()}>
              <RefreshCcw size={16} /> Refresh
            </button>
            <button className="button secondary small" type="button" onClick={signOut}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </header>

        {message && <div className="page-notice" role="status">{message}<button title="Dismiss" onClick={() => setMessage(null)}><X size={15} /></button></div>}

        {section === "overview" && (
          <>
            <section className="admin-metrics expanded">
              <Metric icon={Eye} label="Live visitors" value={liveVisitors.length} />
              <Metric icon={UsersRound} label="Total visitors" value={visitors.length} />
              <Metric icon={ShieldAlert} label="Open reports" value={openReports} />
              <Metric icon={UserRoundCog} label="Host requests" value={pendingHostRequests} />
              <Metric icon={Check} label="Pending approvals" value={pendingApprovals} />
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
              <Panel title="Recent host requests">
                {hostRequests.slice(0, 5).map((request) => <HostRequestLine key={request.id} request={request} userMap={userMap} />)}
                {!hostRequests.length && <div className="inline-empty">No host requests yet.</div>}
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

        {section === "hosts" && (
          <div className="admin-list">
            {hostRequests.map((request) => {
              const user = userMap.get(request.user_id);
              return (
                <article className="admin-row compact-row" key={request.id}>
                  <div className="admin-row-main">
                    <span className={`status-label ${request.status}`}>{request.status}</span>
                    <h3>{user?.display_name ?? "User"}</h3>
                    <p>@{user?.username ?? "unknown"} · {user?.gender ?? "unknown"} · {user?.status ?? "offline"}</p>
                    <dl className="admin-facts">
                      <div><dt>Phone</dt><dd>{request.phone}</dd></div>
                      <div><dt>Applied</dt><dd>{formatRelativeTime(request.created_at)}</dd></div>
                      <div><dt>Reviewed</dt><dd>{request.reviewed_at ? formatRelativeTime(request.reviewed_at) : "not yet"}</dd></div>
                    </dl>
                    {request.note && <p className="admin-note">Note: {request.note}</p>}
                    {request.admin_notes && <p className="admin-note">Admin: {request.admin_notes}</p>}
                  </div>
                  <div className="admin-row-actions">
                    {user && (
                      <button className="button secondary small" type="button" onClick={() => setProfileViewer(user)}>
                        <Eye size={16} /> View profile
                      </button>
                    )}
                    {request.status === "pending" && (
                      <>
                      <button className="button secondary small" disabled={pending === `host-${request.id}`} onClick={() => reviewHostRequest(request, false)}><X size={16} /> Reject</button>
                      <button className="button primary small" disabled={pending === `host-${request.id}`} onClick={() => reviewHostRequest(request, true)}>
                        {pending === `host-${request.id}` ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Approve
                      </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
            {!hostRequests.length && <div className="inline-empty">No host requests yet.</div>}
          </div>
        )}

        {section === "users" && (
          <>
            <div className="admin-filter-row">
              <label className="search-field admin-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search accounts" /></label>
              <div className="admin-segmented" aria-label="Filter users by gender">
                {(["all", "male", "female"] as const).map((value) => (
                  <button
                    className={clsx(genderFilter === value && "active")}
                    key={value}
                    type="button"
                    onClick={() => setGenderFilter(value)}
                  >
                    {value === "all" ? "All" : value}
                  </button>
                ))}
              </div>
            </div>
            <div className="admin-list">
              {filteredUsers.map((user) => {
                const wallet = walletMap.get(user.id);
                return (
                  <article className="admin-row compact-row" key={user.id}>
                    <div className="admin-row-main">
                      <span className={`status-label ${user.is_banned ? "rejected" : "resolved"}`}>{user.is_banned ? "suspended" : "active"}</span>
                      {user.role === "user" && !user.is_guest && (
                        <span className={`status-label ${user.is_verified ? "approved" : "pending"}`}>
                          {user.is_verified ? "discover approved" : "verification pending"}
                        </span>
                      )}
                      <h3>{user.display_name}</h3>
                      <p>@{user.username} · {user.role} · {user.gender ?? "unknown"} · {user.status}</p>
                      <dl className="admin-facts">
                        <div><dt>Coins</dt><dd>{formatMoney(wallet?.coins_balance ?? 0)}</dd></div>
                        <div><dt>Beans</dt><dd>{formatMoney(wallet?.beans_balance ?? 0)}</dd></div>
                        <div><dt>Joined</dt><dd>{formatRelativeTime(user.created_at)}</dd></div>
                      </dl>
                    </div>
                    <div className="admin-row-actions">
                      <button className="button secondary small" type="button" onClick={() => setProfileViewer(user)}><Eye size={16} /> View profile</button>
                      <button className="button secondary small" onClick={() => adjustWallet(user)}><BadgeIndianRupee size={16} /> Wallet</button>
                      {user.role === "user" && !user.is_guest && (
                        <button className="button secondary small" disabled={pending === `verify-${user.id}`} onClick={() => toggleVerification(user)}>
                          {pending === `verify-${user.id}` ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                          {user.is_verified ? "Hide" : "Approve"}
                        </button>
                      )}
                      {user.role !== "admin" && <button className="button danger small" onClick={() => toggleBan(user)}><Ban size={16} /> {user.is_banned ? "Restore" : "Suspend"}</button>}
                    </div>
                  </article>
                );
              })}
              {!filteredUsers.length && <div className="inline-empty">No users match this filter.</div>}
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
          <>
            <div className="admin-service-note">
              Payout requests should be processed within 24 hours. Do not process payouts on Sundays or government holidays.
            </div>
            <div className="admin-list">
              {withdrawals.map((withdrawal) => (
                <article className="admin-row compact-row" key={withdrawal.id}>
                  <div className="admin-row-main">
                    <span className={`status-label ${withdrawalStatusLabel(withdrawal.status)}`}>
                      {withdrawalStatusLabel(withdrawal.status)}
                    </span>
                    <h3>{userMap.get(withdrawal.user_id)?.display_name ?? "User"}</h3>
                    <p>{formatMoney(withdrawal.beans_requested)} beans · ₹{formatMoney(withdrawal.inr_amount)}</p>
                    <dl className="admin-facts">
                      <div><dt>Method</dt><dd>{withdrawal.payout_method === "bank" ? "Bank" : "UPI"}</dd></div>
                      {withdrawal.payout_method === "bank" ? (
                        <>
                          <div><dt>Holder</dt><dd>{withdrawal.payout_account_holder ?? "missing"}</dd></div>
                          <div><dt>Account</dt><dd>{withdrawal.payout_bank_account ?? "missing"}</dd></div>
                          <div><dt>IFSC</dt><dd>{withdrawal.payout_ifsc ?? "missing"}</dd></div>
                        </>
                      ) : (
                        <div><dt>UPI ID</dt><dd>{withdrawal.payout_upi_id ?? "missing"}</dd></div>
                      )}
                    </dl>
                    <time>{formatRelativeTime(withdrawal.created_at)}</time>
                  </div>
                  {withdrawal.status === "pending" && (
                    <div className="admin-row-actions">
                      <button className="button secondary small" onClick={() => reviewWithdrawal(withdrawal, false)}>Reject</button>
                      <button className="button primary small" onClick={() => reviewWithdrawal(withdrawal, true)}>Mark complete</button>
                    </div>
                  )}
                </article>
              ))}
              {!withdrawals.length && <div className="inline-empty">No withdrawal requests.</div>}
            </div>
          </>
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

        {profileViewer && (
          <AdminProfileModal
            user={profileViewer}
            profile={profileMap.get(profileViewer.id) ?? null}
            media={mediaMap.get(profileViewer.id) ?? []}
            wallet={walletMap.get(profileViewer.id) ?? null}
            pending={pending}
            onClose={() => setProfileViewer(null)}
            onAdjustWallet={adjustWallet}
            onToggleBan={toggleBan}
            onToggleVerification={toggleVerification}
          />
        )}
      </main>
    </div>
  );
}

function AdminProfileModal({
  user,
  profile,
  media,
  wallet,
  pending,
  onClose,
  onAdjustWallet,
  onToggleBan,
  onToggleVerification,
}: {
  user: User;
  profile: Profile | null;
  media: ProfileMedia[];
  wallet: Wallet | null;
  pending: string | null;
  onClose: () => void;
  onAdjustWallet: (user: User) => void;
  onToggleBan: (user: User) => void;
  onToggleVerification: (user: User) => void;
}) {
  const primaryMedia = media[0];

  return (
    <div className="modal-backdrop admin-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal admin-profile-modal" role="dialog" aria-modal="true" aria-label={`${user.display_name} profile`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">Profile review</span>
            <h2>{user.display_name}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close profile review">
            <X size={22} />
          </button>
        </div>

        <div className="admin-profile-review-grid">
          <div className="admin-profile-media-preview">
            {primaryMedia ? (
              primaryMedia.media_type === "video" ? (
                <video src={primaryMedia.cloudinary_url} controls playsInline />
              ) : (
                <Image src={primaryMedia.cloudinary_url} alt={`${user.display_name} profile image`} fill sizes="(max-width: 760px) 92vw, 360px" />
              )
            ) : (
              <div className="admin-profile-empty-media">No profile image</div>
            )}
          </div>

          <div className="admin-profile-review-main">
            <div className="admin-profile-status-row">
              <span className={`status-label ${user.is_banned ? "rejected" : "resolved"}`}>{user.is_banned ? "suspended" : "active"}</span>
              {user.role === "user" && !user.is_guest && (
                <span className={`status-label ${user.is_verified ? "approved" : "pending"}`}>
                  {user.is_verified ? "discover approved" : "verification pending"}
                </span>
              )}
            </div>
            <h3>@{user.username}</h3>
            <p>{profile?.bio || "No bio added yet."}</p>

            <dl className="admin-profile-facts">
              <div><dt>Gender</dt><dd>{user.gender ?? "unknown"}</dd></div>
              <div><dt>Age</dt><dd>{profile?.age ?? "not added"}</dd></div>
              <div><dt>Location</dt><dd>{profile?.location ?? "not added"}</dd></div>
              <div><dt>Status</dt><dd>{user.status}</dd></div>
              <div><dt>Chat rate</dt><dd>{profile ? `${formatMoney(profile.chat_rate_coins)} coins/min` : "not set"}</dd></div>
              <div><dt>Voice rate</dt><dd>{profile ? `${formatMoney(profile.audio_call_rate_coins)} coins/min` : "not set"}</dd></div>
              <div><dt>Video rate</dt><dd>{profile ? `${formatMoney(profile.video_call_rate_coins)} coins/min` : "not set"}</dd></div>
              <div><dt>Media</dt><dd>{media.length}/10</dd></div>
              <div><dt>Coins</dt><dd>{formatMoney(wallet?.coins_balance ?? 0)}</dd></div>
              <div><dt>Beans</dt><dd>{formatMoney(wallet?.beans_balance ?? 0)}</dd></div>
              <div><dt>Joined</dt><dd>{formatRelativeTime(user.created_at)}</dd></div>
              <div><dt>Last seen</dt><dd>{user.last_seen ? formatRelativeTime(user.last_seen) : "never"}</dd></div>
            </dl>

            <div className="admin-profile-chip-list">
              {(profile?.languages ?? []).map((language) => <span key={`language-${language}`}>{language}</span>)}
              {(profile?.tags ?? []).map((tag) => <span key={`tag-${tag}`}>{tag}</span>)}
              {!(profile?.languages?.length || profile?.tags?.length) && <span>No tags or languages</span>}
            </div>
          </div>
        </div>

        {media.length > 1 && (
          <div className="admin-profile-gallery" aria-label="Profile gallery">
            {media.map((item) => (
              <div className="admin-profile-thumb" key={item.id}>
                {item.media_type === "video" ? (
                  <video src={item.cloudinary_url} muted playsInline />
                ) : (
                  <Image src={item.cloudinary_url} alt={`${user.display_name} gallery media`} fill sizes="96px" />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="admin-profile-actions">
          <button className="button secondary" type="button" onClick={() => onAdjustWallet(user)}><BadgeIndianRupee size={17} /> Wallet</button>
          {user.role === "user" && !user.is_guest && (
            <button className="button primary" disabled={pending === `verify-${user.id}`} type="button" onClick={() => onToggleVerification(user)}>
              {pending === `verify-${user.id}` ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
              {user.is_verified ? "Hide from Discover" : "Approve for Discover"}
            </button>
          )}
          {user.role !== "admin" && (
            <button className="button danger" type="button" onClick={() => onToggleBan(user)}>
              <Ban size={17} /> {user.is_banned ? "Restore account" : "Suspend account"}
            </button>
          )}
        </div>
      </section>
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

function HostRequestLine({ request, userMap }: { request: HostRequest; userMap: Map<string, User> }) {
  const user = userMap.get(request.user_id);
  return (
    <div className="admin-mini-row">
      <span className={`status-dot ${request.status}`} />
      <div><strong>{user?.display_name ?? "User"}</strong><span>{request.phone}</span></div>
      <time>{formatRelativeTime(request.created_at)}</time>
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
    hosts: "Host requests",
    users: "Account management",
    blocks: "Blocks and device risk",
    withdrawals: "Bean payouts",
    settings: "Platform settings",
    audit: "Admin audit log",
  };
  return titles[section];
}
