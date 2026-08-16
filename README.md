# WetDreams

WetDreams is a mobile-first paid social chat platform built with Next.js 16 and Supabase. The repository implements the product described in `pay2chat-platform-spec.md`, including authentication, discoverable public profiles, realtime direct chat, the ten-message free allowance, wallet accounting, random matching, creator earnings, call billing state, moderation tools, and synthetic companion profiles.

The live Supabase project is named **wet dreams**. Local secrets are stored in `.env.local` and are intentionally ignored by Git.

## What is included

- Supabase email/password auth, session refresh, protected routes, OAuth callback handling, and phone/Google UI hooks
- Public SEO profile pages, sitemap, robots metadata, responsive discovery, favorites, blocks, and ratings
- Realtime chat with atomic paid-message charging, read state, bot replies, and a ten-message free allowance
- Unsigned Cloudinary chat uploads with 24-hour message expiry and scheduled media cleanup
- Coin/bean wallets, immutable transaction ledger, dummy top-ups, creator earnings, and withdrawal review
- Race-safe random matching using `FOR UPDATE SKIP LOCKED`
- Audio/video call request and billing state, with bot-call simulation
- Admin moderation for reports, bans, wallet adjustments, and withdrawal decisions
- RLS on every public table, restricted grants, authenticated security-definer RPCs, indexes, seed data, and database contract tests

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to `.env.local` when connecting a different Supabase project.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The stateful authenticated Playwright journey is opt-in so it never modifies a live project accidentally:

```bash
E2E_EMAIL=user@example.com E2E_PASSWORD=secret npm run test:e2e -- --project=chromium
```

The rollback-only database contract is in `supabase/tests/database_contract.sql`. It verifies auth provisioning, RLS isolation, paid messages, creator earnings, calls, bots, matchmaking, and ledger immutability without retaining test rows.

## Supabase operations

The complete schema is in `supabase/migrations/20260815200242_initial_pay2chat_schema.sql`; synthetic companion data is in `supabase/seed.sql`. Promote a trusted account to admin only from a privileged SQL session:

```sql
update public.users
set role = 'admin'
where username = 'trusted_username';
```

Do not expose a Supabase service-role key to the browser. Client code uses only the publishable key and relies on RLS plus authenticated RPCs.

## Provider configuration

The product scope intentionally defers production Agora and payment-provider integrations. Cloudinary chat-message uploads are wired through the unsigned preset in `.env.local`; profile media remains durable, while chat messages and their Cloudinary assets expire after 24 hours.

- Enable Google and phone providers in Supabase Auth before using those login methods. Add `${NEXT_PUBLIC_APP_URL}/auth/callback` to the allowed redirect URLs.
- Guest accounts are device-bound through a server route and require `SUPABASE_SERVICE_ROLE_KEY` plus `GUEST_AUTH_SECRET`. Supabase anonymous users cannot sign back into the same anonymous account after signout, so guests are stored as hidden email/password users mapped to the hashed device id.
- Cloudinary chat uploads use `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` and `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` in the browser. The cleanup route uses server-only `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
- The scheduled cleanup endpoint is `GET /api/maintenance/purge-expired-chats`. It accepts `Authorization: Bearer $CHAT_CLEANUP_SECRET` and is scheduled daily through `vercel.json`; set the same value as `CRON_SECRET` in Vercel so hosted cron calls are authorized.
- Add Agora credentials and a server-side token function when live audio/video is introduced.
- Replace the dummy payment-intent confirmation RPC with a verified Razorpay or Stripe webhook before accepting real money.
- In Supabase Dashboard, enable **Auth > Password Security > Leaked password protection** when the project plan supports it. This account-only setting cannot be changed through the database API.

## Deployment

The frontend is ready for a standard Vercel Next.js deployment. Add the required public and server-only environment variables from `.env.example`, set `NEXT_PUBLIC_APP_URL` to the production origin, and add the production auth callback URL in Supabase before deployment. The included `vercel.json` runs the chat cleanup route once per day.

Vercel should use the default Next.js framework settings, not static export. A successful `npm run build` should list all app routes, including `/discover`, `/login`, `/profile`, `/chat`, `/chat/[roomId]`, `/random`, `/wallet`, `/admin`, `/u/[username]`, `/api/agora/token`, and `/api/maintenance/purge-expired-chats`.

Required Vercel environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
- `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CHAT_CLEANUP_SECRET`
- `CRON_SECRET`
- `GUEST_AUTH_SECRET`
- `AGORA_PROJECT_NAME`
- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`
- `NEXT_PUBLIC_ANDROID_PUSH_ENABLED` (`false` until `android/app/google-services.json` is added and Firebase push is configured)
