# Email Infrastructure Professionalization — Implementation Tasks

## Map of Acceptance Criteria → Implementation Work

| AC | Primary Tasks |
|---|---|
| AC-R1 (env docs) | Task 1 |
| AC-R2 (SMTP credentials) | Task 1, Task 2 |
| AC-R3 (contact → info@helar.law) | Task 2 |
| AC-R4, AC-R5 (welcome email + renderEmailLayout) | Task 3, Task 4 |
| AC-R6 (sub activation branded layout) | Task 5 |
| AC-R7 (notificationFlags field) | Task 6 |
| AC-R8, AC-R9 (daily runner + reminder/expired emails) | Task 7, Task 8 |
| AC-R10 (forgot-password e2e) | Task 9 |
| AC-R11 (escapeHtml) | All email template tasks |
| AC-R12 (fail-open logging) | Task 2, Task 4, Task 5, Task 8 |
| AC-R13 (typecheck + lint) | Task 10 |
| AC-RB1, AC-RB2, AC-RB3 (rubrics) | Evidence captured in each completed task |

---

## Task 1: Configure env defaults & docs

**Status:** pending
**Priority:** high
**Covers:** AC-R1, AC-R2

### Scope
- Update `.env.example` to reflect production mail identity:
  - `MAIL_FROM_EMAIL=support@helar.law`
  - `MAIL_APP_PASSWORD=""` with comment that the value is `[REDACTED_MAILBOX_PASSWORD_SET_VIA_ENV]` (never commit the actual secret)
  - `MAIL_FROM_NAME="Helar Support"`
  - `MAIL_REPLY_TO="support@helar.law"`
  - `CONTACT_TO_EMAIL=info@helar.law`
  - Leave host/port/secure fields unchanged from current defaults.
- Add explanatory comments for each mail variable so deployers understand what to set.
- Ensure no actual credential values are committed.

### Test Requirements (TR)
- TR-1.1 **(rule)**: Grepping `.env.example` returns exactly one `MAIL_FROM_EMAIL` line with value `support@helar.law`, one `CONTACT_TO_EMAIL` with value `info@helar.law`, and one `MAIL_APP_PASSWORD` with empty quoted value plus a comment mentioning `[REDACTED_MAILBOX_PASSWORD_SET_VIA_ENV]`.
- TR-1.2 **(rule)**: Actual password `[REDACTED_MAILBOX_PASSWORD_SET_VIA_ENV]` does not appear in any committed source or env file.

### Completion Evidence
- Diff of `.env.example` showing the new values.
- `grep` output confirming absence of the literal password string in repository source files.

---

## Task 2: Wire SMTP credential defaults & structured send-logging helpers

**Status:** pending
**Priority:** high
**Covers:** AC-R2, AC-R3, AC-R12, AC-RB3

### Scope
- In `apps/api/src/lib/email.ts`:
  - Update `getGoogleMailConfig()` defaults so that when `MAIL_FROM_NAME` is empty it becomes `"Helar Support"`, and when `MAIL_REPLY_TO` is empty it falls back to `fromEmail` (so `support@helar.law` when correctly configured).
  - Ensure `CONTACT_TO_EMAIL` fallback is explicitly `"info@helar.law"` (already near line 791 — keep + add assertion in caller tests).
  - Add a small helper `logSendResult({ event, to, outcome, error? })` used by all email senders to emit structured `console.*` logs (no passwords or tokens logged).
  - Apply the helper in every existing export (provisioning, registration, password-reset, contact, subscription-activation) and every new export (welcome, expiring, expired).

### Test Requirements (TR)
- TR-2.1 **(rule)**: `getGoogleMailConfig()` called with `MAIL_FROM_NAME` unset and `MAIL_FROM_EMAIL=support@helar.law` returns `{ fromName: "Helar Support", fromEmail: "support@helar.law", replyTo: "support@helar.law" }`.
- TR-2.2 **(rule)**: With `CONTACT_TO_EMAIL` unset, `sendContactEmail` builds recipient `info@helar.law` and sets replyTo to the visitor email.
- TR-2.3 **(rubric, 0-2)**: Logging quality — structured logs exist, contain `event`/`to`/`outcome` fields, and never contain `password` or JWT token substrings. Pass threshold ≥ 1.

### Completion Evidence
- TypeScript check passes for `apps/api`.
- Manual unit-like trace through `getGoogleMailConfig` with mocked `process.env`.

---

## Task 3: Add Welcome Email template + exported sender

**Status:** pending
**Priority:** high
**Covers:** AC-R5 (partially: template itself), AC-R11, AC-RB1, AC-RB2

### Scope
- In `apps/api/src/lib/email.ts`:
  - Define new input type:
    ```ts
    type WelcomeEmailInput = {
      email: string;
      fullName: string;
      roleCodes: string[];
      signInUrl: string;
      pricingUrl: string;
      isAlreadyVerified: boolean;
    };
    ```
  - Implement `buildWelcomeEmailText(input)` and `buildWelcomeEmailHtml(input)`.
  - HTML MUST use `renderEmailLayout` with:
    - Eyebrow: "Welcome aboard"
    - Title: `Welcome to Helar, {{firstName}} 👋`
    - Preheader: `Your legal learning workspace is ready.`
    - Intro: personal greeting.
    - Body paragraphs (3–5): explain Helar value; outline next steps (verify email if not verified; explore library; check pricing for premium plans; join Helar Connect).
    - Feature highlights (details table or inline bullet list):
      - Structured Law Reports & Cases
      - Subject Summaries (Cases & Ratios)
      - Bar Final past papers (MCQ & Theory)
      - Helar Connect community
    - CTA label: "Sign in to Helar"; CTA URL: `signInUrl`.
    - Secondary link/paragraph: link to pricing page.
    - Footer note: contact support@helar.law.
  - Implement and export `async function sendWelcomeEmail(input): Promise<{ skipped: true } | { skipped: false; userAccepted: string[] }>`.
  - Ensure all dynamic values (name, email, role summary, URLs) pass through `escapeHtml`.
  - Use structured log helper from Task 2.

### Test Requirements (TR)
- TR-3.1 **(rule)**: `buildWelcomeEmailHtml` output contains string `"renderEmailLayout"` is NOT the answer — the built HTML output MUST contain all of: gradient header marker (`background: linear-gradient`), eyebrow "Welcome aboard", title substring "Welcome to Helar", a CTA anchor with `href="${signInUrl}"`, and a footer note containing `support@helar.law`.
- TR-3.2 **(rule)**: Subject line is `Welcome to Helar, {{firstName}} 👋` with first name properly escaped/capped.
- TR-3.3 **(rubric, 0-3)**: Visual quality. Pass threshold ≥ 2.

### Completion Evidence
- Snapshot of rendered HTML preview (a short extracted snippet) showing header, CTA button, and feature rows.
- Structured log trace showing welcome email send.

---

## Task 4: Integrate welcome email into registration flow

**Status:** pending
**Priority:** high
**Covers:** AC-R4, AC-R12, AC-RB3

### Scope
- In `apps/api/src/app.ts`:
  - Inside `persistRegister`, after (or immediately alongside) the existing `sendRegistrationVerificationEmails()` call, also attempt `sendWelcomeEmail()` using newly computed sign-in URL: `{APP_PUBLIC_BASE_URL}/auth/sign-in` and pricing URL `{APP_PUBLIC_BASE_URL}/pricing`.
  - Catch email errors separately so that neither email's failure aborts the registration response.
  - Extend `result.body.meta` returned by `persistRegister` to include `welcomeEmailStatus: "sent" | "skipped" | "failed"` alongside the existing `verificationEmailStatus`.
  - If verification email is not being sent because user is already verified (e.g. by admin) the welcome email MUST still be attempted.
- Optionally update `AuthPlaceholderPage.tsx` toast messages to read `welcomeEmailStatus` if present; preserve existing toasts for verification status.

### Test Requirements (TR)
- TR-4.1 **(rule)**: `persistRegister` success response body contains both `verificationEmailStatus` and `welcomeEmailStatus` meta fields.
- TR-4.2 **(rule)**: Throwing inside `sendWelcomeEmail` (mock) does NOT change the HTTP status code of the register endpoint (registration still succeeds with 201).
- TR-4.3 **(rubric, 0-2)**: Logging — both email attempts are logged separately with correct outcomes. Pass threshold ≥ 1.

### Completion Evidence
- `curl`-style simulated response showing both meta statuses.
- Mock test trace: welcome exception caught; registration status unaffected.

---

## Task 5: Redesign subscription activation emails using renderEmailLayout

**Status:** pending
**Priority:** high
**Covers:** AC-R6, AC-R11, AC-R12, AC-RB1, AC-RB2

### Scope
- In `apps/api/src/lib/email.ts`:
  - Rewrite `buildSubscriberSubscriptionHtml(input)` to use `renderEmailLayout` with:
    - Eyebrow: "Subscription activated"
    - Title: "Your Helar subscription is active 🎉"
    - Preheader: `Plan details and receipt for your Helar subscription.`
    - Intro: `Hello {{fullName}}, thank you for subscribing to Helar.`
    - Body: Thank you paragraph; explanation that premium access is now unlocked.
    - Details table: Plan name, Amount (formatMoney format), Reference, Starts on, Expires on.
    - CTA: "Open my dashboard" → build dashboard URL from config (helper function: `getAppPublicBaseUrl() + "/app/dashboard"`).
    - Footer note: Renew early to avoid interruption; contact `support@helar.law`.
  - Rewrite `buildAdminSubscriptionHtml(input)` similarly via `renderEmailLayout` with:
    - Eyebrow: "New subscription"
    - Title: "A Helar subscription has been activated"
    - Details table with subscriber fields; CTA MAY link to admin payments page if known (otherwise omit CTA, use body copy).
  - Update subject lines:
    - Subscriber: `Your Helar subscription is active — thank you`
    - Admin: `New Helar subscription: {{planName}} ({{email}})`
  - Ensure `escapeHtml` applied throughout.
  - Keep plain-text versions (`buildSubscriberSubscriptionText`, `buildAdminSubscriptionText`) up to date with matching content and new subject.

### Test Requirements (TR)
- TR-5.1 **(rule)**: Both HTML builders render via `renderEmailLayout` (identified by gradient header string), include the expected eyebrow/title, and contain plan details in a `details` card section.
- TR-5.2 **(rule)**: Subscriber CTA button href equals `{APP_PUBLIC_BASE_URL}/app/dashboard` (fallback resolved at runtime).
- TR-5.3 **(rubric, 0-3)**: Visual quality. Pass threshold ≥ 2.
- TR-5.4 **(rubric, 0-2)**: Subject line quality. Pass threshold ≥ 1.

### Completion Evidence
- Diff of old vs new HTML builders; extracted preview snippet showing header, details card, and CTA.

---

## Task 6: Add `notificationFlags` JSON field to Subscription model + startup migration

**Status:** pending
**Priority:** high
**Covers:** AC-R7

### Scope
- Add `notificationFlags` field to Prisma schema `Subscription` model:
  ```
  notificationFlags Json? @default("{}")
  ```
  (Use appropriate Prisma type for the target connector.)
- Because the project uses MongoDB Atlas + Prisma without migration scripts that auto-apply on Render, add a safe upsert-style migration in `apps/api/src/lib/startup-migrations.ts` that:
  1. Iterates over every Subscription document where `notificationFlags` is missing/null.
  2. Sets `notificationFlags` to `{}` via Prisma update, batching sensibly (cursor/limit to avoid memory pressure).
- Ensure the field is accessible in `subscriptions.ts` typing (it will be auto-included after Prisma re-generation but also add a direct Prisma `include`/`select` adjustment where reminders are evaluated, if needed).
- Update `apps/api/tests/app.test.ts` if any fixture references Subscriptions to include `notificationFlags: {}` default.

### Test Requirements (TR)
- TR-6.1 **(rule)**: After running the startup migration once, `count(subs where notificationFlags is null OR missing)` is 0 for all rows present before the migration.
- TR-6.2 **(rule)**: New subscriptions created by existing `subscriptions.ts` functions always have `notificationFlags` default (empty object `{}`).

### Completion Evidence
- Prisma schema diff + startup-migrations.ts diff.
- Local simulated test log showing 0 rows left with null flags after migration.

---

## Task 7: Implement subscription lifecycle email templates (expiring soon + expired)

**Status:** pending
**Priority:** high
**Covers:** AC-R9 (partially: templates), AC-R11, AC-RB1, AC-RB2

### Scope
- In `apps/api/src/lib/email.ts` add:
  - Types:
    ```ts
    type SubscriptionExpiringSoonEmailInput = {
      email: string;
      fullName: string;
      planName: string;
      endsAt: string; // ISO date
      daysRemaining: number; // 7 | 3 | 1 | 0
      renewUrl: string;
    };
    type SubscriptionExpiredEmailInput = {
      email: string;
      fullName: string;
      planName: string;
      endedAt: string; // ISO date
      renewUrl: string;
    };
    ```
  - Plain text and HTML builders for each (both through `renderEmailLayout`):
    1. `buildSubscriptionExpiringSoonHtml/Text(input)`:
       - Different subject lines by window:
         - days=7 → `Your Helar subscription expires in 7 days — renew early`
         - days=3 → `Heads up: your Helar subscription ends in 3 days`
         - days=1 → `Reminder: your Helar subscription expires tomorrow`
         - days=0 → `Last chance: your Helar subscription expires today`
       - Title, body, details (plan, expiry date), warning about losing access, CTA button label "Renew subscription now" → `renewUrl`.
    2. `buildSubscriptionExpiredHtml/Text(input)`:
       - Subject: `Your Helar subscription has expired — renew to restore access`
       - Title: `Your subscription has expired`
       - Body: access is restricted; what was lost (premium library, Bar materials, CBT tools, Connect premium perks); how to restore.
       - Details card: Plan name, Expired on.
       - CTA: "Renew subscription" → `renewUrl`.
       - Support hint paragraph: `Contact support@helar.law if you need assistance.`
  - Export two sender functions:
    - `sendSubscriptionExpiringSoonEmail(input, bucket)` — bucket = "7d" / "3d" / "1d" / "today"; used for logging.
    - `sendSubscriptionExpiredEmail(input)`.
  - Apply `escapeHtml`, `formatDateTime`, structured logging throughout.

### Test Requirements (TR)
- TR-7.1 **(rule)**: Subject lines exactly match the spec for each `daysRemaining` bucket and for expired.
- TR-7.2 **(rule)**: Each HTML template uses `renderEmailLayout` (gradient header marker) and contains a Renew CTA button with href=`renewUrl`.
- TR-7.3 **(rubric, 0-3)**: Visual quality across both templates. Pass threshold ≥ 2.

### Completion Evidence
- Previews of each template (snippet extracts).
- Subject line test assertions.

---

## Task 8: Implement daily subscription runner + expiry state transitions

**Status:** pending
**Priority:** high
**Covers:** AC-R8, AC-R9 (integration), AC-R12, AC-RB3

### Scope
- New module `apps/api/src/lib/subscription-lifecycle.ts` (or extend `subscriptions.ts`):
  - Export `runSubscriptionLifecycleCycle({ now })` — idempotent daily job:
    1. **Expiry window scan (AC-R8.1):** For each bucket in order `7d, 3d, 1d, today`:
       - Find ACTIVE subscriptions where `endsAt` is exactly bucket-distance in whole-days from `now`.
       - For each subscription whose `notificationFlags[flagName]` is falsy:
         - Call `sendSubscriptionExpiringSoonEmail(...)`.
         - On success, set `notificationFlags[flagName] = { sentAt: now.toISOString() }` via `prisma.subscription.update`.
         - On failure, log error with structured helper, set `notificationFlags[flagName] = { failedAt: now.toISOString(), error: message }` (so we don't hammer forever; next day scheduler will check — retry policy could be ≤3 attempts; for MVP we try once per bucket per lifecycle run).
    2. **Expiration transition (AC-R8.2+8.3):** Find subscriptions where `endsAt < now` AND `status === ACTIVE`. For each (batched in a per-item transaction):
       - Update `status = EXPIRED` + atomically check-and-set flag `notificationFlags.expired_sent = { sentAt: ... }` only if not already set.
       - Send expired email. If sending fails, roll back the flag so it retries next run.
  - Add safe helpers: `flagNameForBucket(bucket)`, `getRenewUrl()` (returns `APP_PUBLIC_BASE_URL + "/pricing"`).
  - Scheduler setup in `server.ts`:
    - After `app.listen`, schedule `runSubscriptionLifecycleCycle` with `setInterval` every 24 hours.
    - Use `lastRunDate` guard (`YYYY-MM-DD` stamp stored in memory + compared against each tick) so repeated restarts in same day don't run twice.
    - For Render multi-instance safety: use a Prisma-based simple lock with a singleton document in a new collection/model `SchedulerLock` (lockKey="subscription_lifecycle", lastRunDate, holder), OR if adding model is too heavy, document the assumption of single-instance deploy and keep in-memory guard. For MVP, implement the in-memory guard plus a note in code comments.
    - Run once at startup (jittered by ±60s) so fresh deploys immediately catch late expirations.

### Test Requirements (TR)
- TR-8.1 **(rule)**: Given seeded subscriptions with `endsAt` equal to +7d, +3d, +1d, today, and yesterday vs `now`, one full `runSubscriptionLifecycleCycle({ now })` invocation produces exactly 4 expiring-soon emails (one per bucket) and 1 expired email, with flags recorded so a second run at same `now` sends 0.
- TR-8.2 **(rule)**: Subscriptions ending yesterday and still ACTIVE are transitioned to EXPIRED before the expired email is sent.
- TR-8.3 **(rule)**: In-memory same-day guard prevents a second execution within the same date even if `setInterval` fires twice due to clock drift.
- TR-8.4 **(rubric, 0-2)**: Logging and error handling quality — each attempt logs event, subscriptionId, bucket, outcome. Pass threshold ≥ 1.

### Completion Evidence
- Console log snippet after simulated one full run showing 5 emails + flags.
- Second run log showing 0 sends.

---

## Task 9: Verify forgot/reset password flow end-to-end

**Status:** pending
**Priority:** high
**Covers:** AC-R10

### Scope
This task is verification-focused with light code fixes if anything breaks.

- Backend review (in `apps/api/src/app.ts`):
  - Confirm `/api/v1/auth/forgot-password` returns the same generic success response for all inputs.
  - Confirm the reset email uses `sendPasswordResetEmail` which calls the branded layout.
  - Confirm reset-token JWT expires in 1 hour, replay protected via `updatedAt`.
  - Confirm sessions are revoked on successful reset.
- Frontend review (in `apps/web/src/pages/PasswordRecoveryPage.tsx`):
  - Confirm forgot-password form submits correctly with loading state and success/error cards.
  - Confirm reset-password form reads token from `?token=`, validates it's present, validates password length, matching confirm; shows success card with "Return to sign in" link.
- Execute a local e2e smoke test (if possible within the session) using the API test harness or `axios` call to `/forgot-password` and then `/reset-password` to round-trip.

### Test Requirements (TR)
- TR-9.1 **(rule)**: POST `/forgot-password` for both a registered email and a non-registered email return identical top-level JSON response shape and status 200 (no account enumeration).
- TR-9.2 **(rule)**: The password reset email HTML contains "Reset Password" CTA button and "This password reset link will expire after 1 hour." sentence.
- TR-9.3 **(rule)**: POST `/reset-password` with a valid token + matching passwords → 200 response, user `updatedAt` refreshed, and the same token reused a second time fails (replay protection).
- TR-9.4 **(rule)**: After successful reset, the reset page renders a success state containing a link to `/auth/sign-in`.

### Completion Evidence
- HTTP response diffs confirming no enumeration.
- Round-trip log or test output confirming replay protection and session revocation.

---

## Task 10: Type-check + lint both workspaces + compile

**Status:** pending
**Priority:** medium
**Covers:** AC-R13

### Scope
- Run in `apps/api`: `npm run check` then `npm run lint`.
- Run in `apps/web`: `npm run check` then `npm run lint`.
- Fix any newly introduced errors.
- If Prisma schema changed in Task 6: run `npx prisma generate` first so types exist before check.

### Test Requirements (TR)
- TR-10.1 **(rule)**: All four commands (`api check`, `api lint`, `web check`, `web lint`) exit with code 0.

### Completion Evidence
- Terminal exit codes or CI snippet showing success for each.

---

## Queue Dependencies (Topological Order)

```
Task 1 ──┐
         ├─► Task 2 ──► Task 3 ──► Task 4
         │              Task 5
         └─► Task 6 ──► Task 7 ──► Task 8
Task 9 (verify) may run any time after Task 2.
Task 10 MUST be last.
```
