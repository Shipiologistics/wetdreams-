# Pay2Chat Platform — Full Technical Specification

**Author role:** Senior Engineer Draft
**Stack:** Supabase (Postgres + Realtime + Auth + Storage for metadata), Cloudinary (media), Agora (audio/video, added later), Next.js/React (mobile-first web app), dummy payment gateway (Stripe/Razorpay stubbed for now)

---

## 1. Executive Summary

A platform where any user can pay to chat with any other user (or a bot). Chat is free for the first 10 message exchanges, after which a paywall appears unless the *receiver* has enabled free chat. Calls (audio/video) are always paywalled. Every user has a wallet with two currencies — **Coins** (what you spend, 1 coin = ₹1) and **Beans** (what creators earn, 1 bean = ₹0.80). A random-chat feature pairs any two waiting users instantly and safely, even under simultaneous click race conditions. An admin role moderates chats and disputes.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (React), mobile-first responsive UI |
| Realtime chat | Supabase Realtime (Postgres logical replication + channels) |
| Database | Supabase Postgres |
| Auth | Supabase Auth (email/phone/OAuth) |
| Media storage | Cloudinary (images/videos), Cloudinary URLs stored in Postgres |
| Audio/video calls | Agora RTC/RTM (added later, tokens generated server-side) |
| Payments | Dummy gateway now → Razorpay/Stripe later |
| Hosting | Vercel (frontend) + Supabase (backend) |
| Background jobs | Supabase Edge Functions / cron (e.g., stale "online" cleanup, payout batching) |

---

## 3. High-Level Architecture

```
[Client - Mobile Web]
     │
     ├── Supabase Auth (JWT)
     ├── Supabase Realtime (chat, presence, matchmaking)
     ├── Supabase Postgres (via PostgREST / RPC functions)
     ├── Cloudinary (direct signed upload from client)
     └── Agora SDK (token fetched from Edge Function)

[Supabase Edge Functions]
     ├── generate_agora_token()
     ├── process_wallet_transaction()
     ├── match_random_chat()  (uses row-locking, see §7)
     ├── payout_processor() (stub)
     └── cloudinary_signature()  (signs client uploads server-side)
```

---

## 4. Database Schema (Supabase / Postgres)

All tables use `uuid` primary keys (`gen_random_uuid()`), `created_at`/`updated_at` timestamps, and Row Level Security (RLS) enabled. Below is the core schema.

### 4.1 `users` (extends Supabase `auth.users`)
```sql
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  gender text check (gender in ('male','female','other')),
  role text not null default 'user' check (role in ('user','bot','admin')),
  is_verified boolean default false,
  is_banned boolean default false,
  status text not null default 'offline' check (status in ('online','offline','busy','in_call')),
  last_seen timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 4.2 `profiles`
```sql
create table public.profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  bio text,
  age int,
  location text,
  languages text[],
  real_meet_available boolean default false,
  free_chat_enabled boolean default false,   -- receiver toggles free chat
  chat_rate_coins numeric default 5,          -- per message or per minute (define unit)
  audio_call_rate_coins numeric default 20,   -- per minute
  video_call_rate_coins numeric default 40,   -- per minute
  min_topup_required boolean default false,
  tags text[],
  updated_at timestamptz default now()
);
```

### 4.3 `profile_media` (10 photo / limited video cap enforced here)
```sql
create table public.profile_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  media_type text not null check (media_type in ('image','video')),
  cloudinary_public_id text not null,
  cloudinary_url text not null,
  position int not null,        -- ordering for gallery/slider
  is_primary boolean default false,
  created_at timestamptz default now()
);

-- Enforce max 10 photos + N videos via trigger (not just app-side check)
create or replace function enforce_media_limits() returns trigger as $$
declare
  photo_count int;
  video_count int;
begin
  select count(*) into photo_count from profile_media
    where user_id = new.user_id and media_type = 'image';
  select count(*) into video_count from profile_media
    where user_id = new.user_id and media_type = 'video';

  if new.media_type = 'image' and photo_count >= 10 then
    raise exception 'Photo limit of 10 reached';
  end if;
  if new.media_type = 'video' and video_count >= 2 then
    raise exception 'Video limit of 2 reached';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_media_limit
before insert on profile_media
for each row execute function enforce_media_limits();
```

### 4.4 `wallets`
```sql
create table public.wallets (
  user_id uuid primary key references public.users(id) on delete cascade,
  coins_balance numeric not null default 0,   -- what user spends (1 coin = ₹1)
  beans_balance numeric not null default 0,   -- what user earns (1 bean = ₹0.80)
  lifetime_coins_purchased numeric default 0,
  lifetime_beans_earned numeric default 0,
  lifetime_beans_withdrawn numeric default 0,
  updated_at timestamptz default now()
);
```

### 4.5 `wallet_transactions` (immutable ledger — never update balances directly without a row here)
```sql
create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  type text not null check (type in (
      'topup','chat_spend','call_spend','bean_credit',
      'bean_withdrawal','refund','admin_adjustment')),
  currency text not null check (currency in ('coin','bean')),
  amount numeric not null,             -- positive or negative
  balance_after numeric not null,
  related_chat_id uuid,
  related_call_id uuid,
  payment_gateway_ref text,            -- dummy for now
  status text default 'completed' check (status in ('pending','completed','failed','reversed')),
  created_at timestamptz default now()
);
```

### 4.6 `chat_rooms`
```sql
create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references public.users(id),
  user_b uuid references public.users(id),
  room_type text not null default 'direct' check (room_type in ('direct','random','bot')),
  message_count int not null default 0,
  is_paywalled boolean not null default false,   -- flips true after 10 exchanges unless free_chat
  free_chat_override boolean default false,      -- snapshot of receiver's setting at room creation
  status text default 'active' check (status in ('active','closed','reported')),
  created_at timestamptz default now(),
  last_message_at timestamptz default now(),
  unique (user_a, user_b, room_type)
);
```

### 4.7 `messages`
```sql
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.chat_rooms(id) on delete cascade,
  sender_id uuid references public.users(id),
  message_type text not null default 'text' check (message_type in ('text','image','video','emoji','system')),
  content text,                        -- text or emoji
  cloudinary_url text,                 -- for image/video messages
  is_paid boolean default false,       -- whether this message required a coin deduction
  coins_charged numeric default 0,
  read_at timestamptz,
  created_at timestamptz default now()
);
```

### 4.8 `calls`
```sql
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.chat_rooms(id),
  caller_id uuid references public.users(id),
  receiver_id uuid references public.users(id),
  call_type text not null check (call_type in ('audio','video')),
  agora_channel_name text,
  status text default 'ringing' check (status in ('ringing','ongoing','ended','missed','rejected')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int default 0,
  coins_charged numeric default 0,
  created_at timestamptz default now()
);
```

### 4.9 `random_chat_queue` (matchmaking — see §7 for concurrency-safe logic)
```sql
create table public.random_chat_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','matched','cancelled')),
  matched_room_id uuid references public.chat_rooms(id),
  joined_at timestamptz default now()
);
```

### 4.10 `reports` (moderation)
```sql
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.users(id),
  reported_user_id uuid references public.users(id),
  room_id uuid references public.chat_rooms(id),
  reason text,
  status text default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  admin_id uuid references public.users(id),
  admin_notes text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);
```

### 4.11 `admin_actions` (audit log)
```sql
create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.users(id),
  action_type text check (action_type in ('ban','unban','wallet_adjust','delete_message','close_room','warn')),
  target_user_id uuid,
  target_room_id uuid,
  notes text,
  created_at timestamptz default now()
);
```

### 4.12 `blocks` and `favorites` (quality-of-life)
```sql
create table public.blocks (
  blocker_id uuid references public.users(id),
  blocked_id uuid references public.users(id),
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id)
);

create table public.favorites (
  user_id uuid references public.users(id),
  favorite_user_id uuid references public.users(id),
  created_at timestamptz default now(),
  primary key (user_id, favorite_user_id)
);
```

### 4.13 `ratings`
```sql
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  rater_id uuid references public.users(id),
  rated_user_id uuid references public.users(id),
  room_id uuid references public.chat_rooms(id),
  score int check (score between 1 and 5),
  comment text,
  created_at timestamptz default now()
);
```

---

## 5. Core Feature Logic

### 5.1 The 10-message paywall
- Track `message_count` on `chat_rooms`, incremented on every insert via trigger.
- When `message_count = 10` (or the 11th message is attempted), check `profiles.free_chat_enabled` for the **receiver**.
  - If `free_chat_enabled = true` → `is_paywalled` stays false, chat continues free forever in that room.
  - If false → `is_paywalled = true`. Sender must have sufficient coin balance for the receiver's `chat_rate_coins` per message (or per minute, your choice — recommend **per message** for chat, **per minute** for calls, billed in real time via Edge Function ticking).
- Enforce server-side (Postgres trigger + RLS + Edge Function check), never trust the client for coin deduction.

```sql
create or replace function check_paywall() returns trigger as $$
declare
  receiver uuid;
  free_enabled boolean;
  rate numeric;
  balance numeric;
begin
  update chat_rooms set message_count = message_count + 1,
    last_message_at = now()
    where id = new.room_id
    returning message_count into strict new.room_id; -- illustrative; real code separates read/write

  -- fetch receiver = the user in room who isn't sender
  select case when user_a = new.sender_id then user_b else user_a end
    into receiver from chat_rooms where id = new.room_id;

  select free_chat_enabled, chat_rate_coins into free_enabled, rate
    from profiles where user_id = receiver;

  if (select message_count from chat_rooms where id = new.room_id) > 10
     and not free_enabled then
    select coins_balance into balance from wallets where user_id = new.sender_id;
    if balance < rate then
      raise exception 'INSUFFICIENT_BALANCE';
    end if;
    -- deduct coins, credit beans to receiver (0.80 conversion handled in app logic),
    -- insert wallet_transactions rows for both sides
    new.is_paid := true;
    new.coins_charged := rate;
  end if;
  return new;
end;
$$ language plpgsql;
```
*(In production, do the coin deduction inside an Edge Function/RPC called before the message insert succeeds, so it's atomic and can reject the message client-side with a clear "top up" prompt — a trigger raising an exception mid-insert works too but gives a worse UX than a pre-check RPC.)*

### 5.2 Free chat toggle
- Simple boolean on `profiles.free_chat_enabled`, toggled from the profile settings page.
- UI: a switch labeled "Allow free chat with everyone."

### 5.3 Online/offline presence
- Use **Supabase Realtime Presence** (not polling). Each client, on connect, joins a `presence:online-users` channel and pushes its `user_id`. Presence state syncs across all clients instantly.
- `users.status` and `last_seen` updated via presence `on leave` / heartbeat, with a scheduled Edge Function (cron every 60s) to flip stale rows (`last_seen < now() - interval '2 minutes'`) to `offline` as a fallback if a client disconnects ungracefully.
- Chat cards subscribe to presence and show a green/gray dot live.

### 5.4 Calls (audio/video) — always paywalled
- Call initiation → Edge Function checks caller's coin balance ≥ receiver's per-minute rate for at least 1 minute.
- On `ongoing`, Edge Function runs a per-minute billing tick (cron or Agora's channel webhook) that deducts coins and credits beans; if balance hits 0, force-end call and notify both parties.
- Agora token generated server-side per call (`agora_channel_name` = `calls.id`), never expose Agora app certificate to client.

### 5.5 Media (Cloudinary)
- Client requests a signed upload signature from an Edge Function (`cloudinary_signature()`), then uploads directly to Cloudinary (keeps your server load light).
- On success, client sends `{public_id, url}` back to your API, which inserts into `profile_media` or as a `messages` row with `message_type='image'/'video'`.
- 10-photo/video cap enforced server-side via the trigger in §4.3, not just UI-side.

### 5.6 Mobile-first chat window & swipeable profile cards
- Chat cards in a list are **swipeable/slidable galleries** (like a mini Tinder card) showing up to 10 photos + rate info + online dot + "message" and "call" CTAs, before the user commits to opening the full chat.
- Chat window itself: sticky header (avatar, name, online status, call icons), scrollable message list (virtualized for performance), bottom input bar with emoji picker, image-attach button (→ Cloudinary), and a paywall banner that slides up once the 10-message threshold is hit ("This chat now costs X coins/message — Top Up" with a big CTA).
- Use CSS `scroll-snap` or a lightweight carousel lib for the swipeable gallery; keep bundle size mobile-friendly.

---

## 6. Random Chat — Concurrency-Safe Matchmaking

**Problem:** Two users click "Random Chat" at the same instant; you must never double-match a user or create orphaned queue rows, and it must scale to many simultaneous clicks.

**Solution: atomic SQL function with row locking (`SELECT ... FOR UPDATE SKIP LOCKED`)**, called via an Edge Function/RPC — never do matching logic in the client.

```sql
create or replace function match_random_chat(requesting_user uuid)
returns uuid as $$
declare
  partner_id uuid;
  new_room_id uuid;
begin
  -- Insert self into queue if not already present
  insert into random_chat_queue (user_id, status)
  values (requesting_user, 'waiting')
  on conflict (user_id) do update set status = 'waiting', joined_at = now();

  -- Atomically grab the oldest OTHER waiting user, locking the row
  -- so a concurrent call can't grab the same partner (SKIP LOCKED
  -- makes concurrent callers skip rows already locked instead of blocking/erroring).
  select user_id into partner_id
  from random_chat_queue
  where status = 'waiting'
    and user_id <> requesting_user
  order by joined_at asc
  for update skip locked
  limit 1;

  if partner_id is null then
    -- no partner yet, stay in queue; client will subscribe to realtime
    -- updates on random_chat_queue for its own row and get notified when matched
    return null;
  end if;

  -- Create the room
  insert into chat_rooms (user_a, user_b, room_type)
  values (requesting_user, partner_id, 'random')
  returning id into new_room_id;

  -- Mark both as matched atomically
  update random_chat_queue
    set status = 'matched', matched_room_id = new_room_id
    where user_id in (requesting_user, partner_id);

  return new_room_id;
end;
$$ language plpgsql security definer;
```

**Why this is safe under simultaneous clicks:**
- `FOR UPDATE SKIP LOCKED` means if User A's transaction has already locked a candidate row, User B's concurrent call simply skips it and looks for the next waiting user — no deadlock, no double-matching, no error thrown.
- The whole match (partner selection + room creation + status update) happens inside **one Postgres function call**, so it's transactionally atomic — either the whole match happens or none of it does.
- If two users call `match_random_chat` at literally the same time and each is the other's only candidate, one transaction will win the lock first and complete the match; the second sees `status='matched'` already changed (or a `unique` conflict) and simply re-reads its own queue row instead of retrying the match — the client polls/subscribes to its `random_chat_queue` row via Realtime and redirects to `matched_room_id` once set.
- The client-side flow: call `match_random_chat` → if it returns a room id, redirect immediately → if it returns `null`, subscribe to Realtime changes on your own `random_chat_queue` row and wait for `matched_room_id` to be set by someone else's call.
- Add a `cancel_random_chat(user_id)` RPC to remove a user from queue if they leave the waiting screen.
- Add a stale-queue cleanup cron (remove `waiting` rows older than e.g. 5 minutes, or auto-match with a bot as fallback — see §9).

---

## 7. Wallet & Monetization Model

- **Coins** = what a user buys and spends. `1 coin = ₹1`.
- **Beans** = what a user (creator/receiver) earns from being paid. `1 bean = ₹0.80`.
- Conversion on a paid interaction: sender's coins are deducted 1:1 with the rate; receiver is credited in beans at a defined payout ratio (commonly platform takes a cut — e.g., receiver gets beans equal to 80% of the coin value: `coins_charged * 0.8` beans, meaning the platform retains a 20% margin — this ratio is a business decision, keep it configurable in a `platform_config` table rather than hardcoded).
- All balance changes go through `wallet_transactions` — `wallets.coins_balance`/`beans_balance` are **derived/cached** columns updated only via the transaction-insert RPC, never directly.
- **Dummy payment gateway**: a `payment_intents` table + a fake "success" webhook endpoint that just credits coins — swap for real Razorpay/Stripe later without touching wallet logic.

```sql
create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  coins_requested numeric not null,
  amount_inr numeric not null,   -- coins_requested * 1
  gateway text default 'dummy',
  status text default 'pending' check (status in ('pending','success','failed')),
  created_at timestamptz default now()
);

create table public.platform_config (
  key text primary key,
  value jsonb not null
);
-- e.g. {"key":"bean_payout_ratio","value":"0.8"}
```

- **Withdrawals**: a `withdrawal_requests` table where users cash out beans → admin approves → beans converted to ₹ at 0.80/bean and marked paid (manual/dummy for now, real payout API later).

```sql
create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  beans_requested numeric not null,
  inr_amount numeric not null,  -- beans_requested * 0.80
  status text default 'pending' check (status in ('pending','approved','rejected','paid')),
  admin_id uuid,
  created_at timestamptz default now(),
  processed_at timestamptz
);
```

---

## 8. Admin & Moderation

- Single `role='admin'` on `users` (can extend to `super_admin`, `moderator` later via a `roles` table if needed).
- Admin dashboard capabilities:
  - View/resolve `reports`
  - Ban/unban users (`users.is_banned`)
  - View any `chat_rooms`/`messages` for moderation (RLS bypass via `security definer` functions restricted to admin role)
  - Manually adjust wallets (`admin_adjustment` transaction type) with mandatory notes
  - Approve/reject `withdrawal_requests`
  - All actions logged to `admin_actions`

---

## 9. Bots

- `users.role = 'bot'` — bots are just users with `role='bot'` and a linked AI-response service (webhook/Edge Function that listens for `messages` inserts in bot rooms and auto-replies).
- Bots can have their own `chat_rate_coins` too (monetized AI companions), or be free — your call.
- Useful fallback: if random chat queue has no human match after N seconds, optionally offer "chat with an AI companion instead" rather than leaving the user waiting.

---

## 10. Row Level Security (RLS) — key policies (illustrative)

```sql
alter table messages enable row level security;

create policy "users read own room messages"
on messages for select
using (
  exists (
    select 1 from chat_rooms r
    where r.id = messages.room_id
      and auth.uid() in (r.user_a, r.user_b)
  )
);

create policy "users insert own messages"
on messages for insert
with check (sender_id = auth.uid());

alter table wallets enable row level security;
create policy "users read own wallet"
on wallets for select using (user_id = auth.uid());
-- No update policy for regular users — all writes go through security-definer RPCs only.
```
Apply the same pattern (read own + admin-bypass via `security definer` functions) across `profiles`, `wallet_transactions`, `calls`, `random_chat_queue`.

---

## 11. Additional Features Worth Adding

1. **Typing indicators & read receipts** — trivial with Supabase Presence/Realtime broadcast, big UX win.
2. **Push notifications** (new message / incoming call) — Web Push or FCM.
3. **Gift/tip system** — separate from chat rate, one-tap "send a gift" that debits coins → credits beans, logged like any transaction. Very common revenue driver on these platforms.
4. **First-message free preview / "ice breaker" prompts** to increase conversion into paid chat.
5. **Daily login bonus coins / referral bonus coins** for growth.
6. **Search & filters** (gender, online-only, rate range, tags, real-meet-available) on the discovery feed.
7. **Age verification / ID verification badge** — important for trust and for a paid adult-adjacent platform; strongly recommend KYC before allowing withdrawals.
8. **Content moderation on images** — Cloudinary has built-in AI moderation add-ons (or a manual admin queue) — essential given user-uploaded photos.
9. **Rate limiting on random chat clicks** to prevent spam/farming.
10. **Session/idle timeout** — auto-set to offline after inactivity, and auto-end stale "ringing" calls.
11. **Dispute/refund flow** tied to `reports` (e.g., "call dropped, refund my coins").
12. **Analytics dashboard for creators** — earnings over time, chat volume, ratings.
13. **Terms/consent screen** before random chat (safety and legal — this pairs strangers, treat it like a dating-adjacent platform legally).

---

## 12. Build Plan — Phased, Senior-Engineer Approach

**Phase 0 — Foundations (Week 1)**
- Set up Supabase project, Next.js app, Cloudinary account (sandbox), environment configs.
- Implement Auth (signup/login), `users` + `profiles` tables + RLS.
- CI/CD skeleton (Vercel preview deploys), linting, error tracking (Sentry).

**Phase 1 — Profiles & Media (Week 1–2)**
- Profile creation/edit UI, rate-setting UI, availability toggle, real-meet toggle.
- Cloudinary signed-upload flow + `profile_media` table + 10-photo/video cap enforcement (trigger + UI).
- Discovery feed with swipeable gallery cards, filters, online/offline dot via Presence.

**Phase 2 — Wallet System (Week 2)**
- `wallets`, `wallet_transactions`, dummy `payment_intents` top-up flow.
- Wallet UI (balance, buy coins, transaction history).
- `withdrawal_requests` flow (basic, admin-approved).

**Phase 3 — Direct Chat (Week 2–3)**
- `chat_rooms`, `messages`, Supabase Realtime subscriptions.
- 10-message counter + paywall logic (server-side RPC, not client trust).
- Free-chat toggle wiring, emoji picker, image-in-chat via Cloudinary, typing indicators.

**Phase 4 — Random Chat (Week 3)**
- `random_chat_queue`, `match_random_chat` RPC with `SKIP LOCKED`.
- Client waiting-room UI + Realtime subscription for match notification.
- Cancel-queue flow, stale-queue cleanup cron.

**Phase 5 — Calls (Week 3–4)**
- Integrate Agora (token Edge Function), `calls` table, per-minute billing tick.
- Call UI (ringing, accept/reject, in-call controls), forced end-on-zero-balance.

**Phase 6 — Admin & Moderation (Week 4)**
- Admin dashboard: reports, bans, wallet adjustments, withdrawal approvals, `admin_actions` audit log.

**Phase 7 — Polish & Extras (Week 4–5)**
- Gifts/tips, referral bonuses, push notifications, image moderation, rate limiting, analytics.

**Phase 8 — Payment Gateway Swap (later, as you noted)**
- Replace dummy `payment_intents` success stub with real Razorpay/Stripe webhook — because the wallet ledger design is gateway-agnostic, this is a drop-in change with no schema migration needed.

---

## 13. End-to-End Testing Plan

**Unit tests**
- Wallet RPCs: deduction math, insufficient-balance rejection, bean conversion ratio, ledger consistency (balance always equals sum of transactions).
- Paywall trigger: exactly at message #10 → #11 boundary, with and without `free_chat_enabled`.
- Media limit trigger: 11th photo upload rejected, 3rd video rejected.

**Concurrency tests (critical)**
- Simulate 50 concurrent `match_random_chat` calls with a mocked queue of 25 waiting users → assert exactly 12–13 rooms created, zero duplicate matches, zero orphaned "matched" rows without a room.
- Simulate two users clicking random chat at the *exact* same millisecond (parallel Postgres sessions in a test harness) → assert no deadlock, no double-charge, no duplicate room.
- Load-test the per-minute call billing tick under many simultaneous ongoing calls.

**Integration tests**
- Full chat flow: signup → discover → message 1–10 free → message 11 blocked without balance → top-up (dummy) → message 11 succeeds → receiver's bean balance increases correctly.
- Call flow: insufficient balance blocks call start; balance depletion mid-call force-ends it and both parties are notified.
- Free-chat-enabled receiver: confirm paywall never triggers even past message 10.

**RLS/security tests**
- Attempt to read another user's `messages`/`wallet_transactions` directly via the client → must be denied.
- Attempt to call wallet-mutating RPCs with a forged `user_id` different from `auth.uid()` → must be denied.
- Confirm only `role='admin'` can call moderation RPCs.

**Realtime tests**
- Presence: open two clients, confirm online dot flips within ~1–2s of connect/disconnect, and confirm stale-cleanup cron flips ghost sessions offline within its interval.
- Message delivery latency under simulated network jitter; confirm no duplicate/missing messages on reconnect (use Supabase Realtime's resume/backfill).

**Mobile UI/UX tests**
- Swipeable gallery on real devices (iOS Safari, Android Chrome) — no scroll-jank, correct snap behavior.
- Chat window keyboard-avoidance (input bar doesn't get covered by mobile keyboard).
- Test on slow 3G network throttling for image upload UX (progress indicator, retry on failure).

**Manual QA / UAT checklist**
- Full signup → profile setup → media upload → discovery → chat → paywall → topup → call → wallet history → withdrawal request → admin approval, walked end-to-end by a human tester before launch.
- Abuse-path testing: report a user, admin resolves, banned user cannot log back in.

**Pre-launch**
- Run `pgTAP` or similar for the SQL functions specifically (match_random_chat, paywall RPC, wallet RPCs) since these are your highest-risk atomic-correctness code.
- Load test random-chat matching and call billing with a tool like k6 before opening to real users.

---

## 14. Summary of What's Deferred (as you specified)

- Real Agora integration (structure/tables ready, token function stubbed).
- Real Cloudinary account wiring (signature function stubbed, schema ready).
- Real payment gateway (dummy `payment_intents` stub in place, ledger design is gateway-agnostic so swap is low-risk).

Everything else above — schema, RLS, matchmaking concurrency handling, paywall logic, wallet ledger, admin tooling, and the full test plan — is meant to be buildable end-to-end today on Supabase alone.
