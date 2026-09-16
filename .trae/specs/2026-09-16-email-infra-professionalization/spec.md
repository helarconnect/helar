# Email Infrastructure Professionalization — Specification

## Problem
Helar's email system needs a unified, production-grade mail configuration and a complete set of branded transactional emails for the user lifecycle: registration welcome, subscription activation, upcoming-expiry & expired reminders, contact form delivery, and password recovery. Currently:

- Email credentials are not wired to `support@helar.law` / `[REDACTED_MAILBOX_PASSWORD_SET_VIA_ENV]`;
- Registration sends a verification email but no standalone welcome email;
- Subscription activation emails use a bare inline HTML block (not the branded master layout);
- No emails are sent when a subscription is expiring soon or has expired;
- Contact form recipient is configurable but must default to `info@helar.law`;
- Forgot/reset password flow exists but must be fully functional end-to-end with the new SMTP configuration;
- All transactional emails need a professional, consistent visual identity.

## Users & Goals

| User | Goal |
|---|---|
| New registrant | Receive a friendly, well-structured welcome email after creating a Helar account |
| Subscriber | Receive receipt/activation, pre-expiry reminder, and post-expiry notification emails |
| Contact-form visitor | Have their message delivered to `info@helar.law` via a professional formatted email with reply-to set correctly |
| User who forgot password | Receive a time-limited reset link email that works and looks trustworthy |
| Helar ops team | Receive admin notifications in the right inbox, all from `support@helar.law` SMTP |

## Non-Goals
- No newsletter / marketing bulk mail system (transactional only).
- No replacement of Paystack payment flow; only email hooks around existing events.
- No change to verification-link JWT semantics or password-reset replay protection.
- No new third-party transactional provider (Nodemailer + SMTP remains).

---

## Functional Requirements

### FR-1 — SMTP Identity & Credentials
- The SMTP sender identity MUST be `support@helar.law`.
- The SMTP auth password MUST be `[REDACTED_MAILBOX_PASSWORD_SET_VIA_ENV]`.
- If the existing host/port secure defaults from `.env.example` (server212.web-hosting.com:465 secure TLS) are not explicitly overridden via env, they SHALL continue to be used; only credentials change.
- `MAIL_FROM_NAME` SHALL default to "Helar Support" if unset.
- `MAIL_REPLY_TO` SHALL default to `support@helar.law` if unset.
- All exported email senders (`sendRegistrationVerificationEmails`, `sendPasswordResetEmail`, `sendContactEmail`, `sendSubscriptionActivationEmails`, `sendAdminUserProvisioningEmail`, and new functions below) SHALL use the single configured transport.

### FR-2 — Contact Form Delivery
- Submissions to `POST /api/v1/contact` MUST deliver to `info@helar.law`.
- The `CONTACT_TO_EMAIL` env var MAY override this default, but if it is empty or unset, `info@helar.law` SHALL be used as the hardcoded default.
- The reply-to header of the delivered email MUST be set to the visitor's submitted email so that the Helar team can reply directly.
- The delivered email SHALL use the branded master `renderEmailLayout` template.

### FR-3 — Registration Welcome Email
- After a successful public registration (`POST /api/v1/auth/register`), in addition to the existing email-verification email, a SEPARATE **Welcome Email** SHALL be sent to the new user.
- The welcome email SHALL:
  - Greet the user by full name;
  - Explain what Helar is (premium legal library, Helar Connect community, Bar preparation materials);
  - Highlight 3–4 key value items (e.g., "Structured law reports", "Subject summaries", "Bar final past papers", "Helar Connect community");
  - Include a clear primary CTA button: "Sign in to Helar" → `{APP_PUBLIC_BASE_URL}/auth/sign-in`;
  - Mention next steps: verify email (if not yet verified), explore library, visit pricing to subscribe;
  - Include contact/support reference and branded footer.
- The welcome email SHALL be rendered through the master `renderEmailLayout` template.
- If the verification email is skipped/failed, the welcome email SHALL still attempt to send; failures in either email MUST be logged separately but MUST NOT fail the registration response (registration itself is the critical path).
- The `persistRegister` return payload SHALL be extended with a `welcomeEmailStatus` meta field: `"sent"` | `"skipped"` | `"failed"`.

### FR-4 — Subscription Activation Email (Redesign)
- Existing `sendSubscriptionActivationEmails` currently sends bare inline HTML to the subscriber. This MUST be upgraded to the branded `renderEmailLayout` for both subscriber and admin copies.
- Subscriber activation email SHALL include:
  - Thank-you headline + personalized greeting;
  - A details card with: Plan name, Amount paid (en-NG formatted), Payment reference, Starts on, Expires on;
  - A primary CTA: "Open my dashboard" → `{APP_PUBLIC_BASE_URL}/app/dashboard`;
  - A secondary note: "Renew before expiry to keep uninterrupted access.";
  - Footer with support contact.
- Admin activation notification email SHALL include the same details but be addressed to the ops inbox; CTA MAY link to the admin payments page.

### FR-5 — Subscription Expiry Reminder & Expired Emails
A scheduled in-process daily runner SHALL be introduced in the API (`server.ts` startup) with the following behavior:

- Runs once every 24 hours (configurable interval), with jitter/guard so that it does not run twice in the same day even if the process restarts.
- On each run:
  1. Finds ACTIVE subscriptions whose `endsAt` is in 7 days, 3 days, 1 day, or today. For each one where no "expiry_reminder_7d" / "_3d" / "_1d" / "_today" flag has been recorded yet, send a **Subscription Expiring Soon** email and record the flag in a new JSON field `notificationFlags` on the Subscription model.
  2. Finds subscriptions whose `endsAt < now` and status transitions from ACTIVE → EXPIRED. For each one where no "expired_sent" flag is recorded yet:
     - Transition `status` to EXPIRED (in a transaction);
     - Send a **Subscription Has Expired** email;
     - Record the flag.
  3. (Re)-evaluate derived status for subscriptions where `endsAt < now` but status is still ACTIVE: transition to EXPIRED atomically before sending the expired email.
- "Expiring Soon" email template SHALL:
  - Clearly state the number of days remaining;
  - Show the Plan name, Expiry date, and a "Renew now" CTA button → `{APP_PUBLIC_BASE_URL}/pricing`;
  - Warn that access to the premium library will be lost on expiry.
- "Expired" email template SHALL:
  - Confirm access has been restricted;
  - Show Plan, Expired on date;
  - Offer "Renew subscription" CTA to `/pricing`;
  - Mention contacting `support@helar.law` for help.
- Templates SHALL use `renderEmailLayout` branded layout.

### FR-6 — Forgot Password / Reset Password Functionality
- The existing flows (`POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`, and the frontend `PasswordRecoveryPage`) MUST remain behaviorally intact but SHALL be verified end-to-end with the new SMTP config:
  - A reset request for a valid registered user delivers the branded password-reset email to the user's inbox;
  - The reset email uses `renderEmailLayout` (already does) with correct subject, 1-hour expiry notice, and a clickable button + link fallback;
  - Clicking the link in a browser correctly loads `/auth/reset-password?token=...`;
  - Submitting a new password via the form (with matching confirm) successfully updates the user's password, revokes old sessions, and shows a success state with a "Return to sign in" link;
  - Security semantics preserved: same generic success response for valid/invalid emails (no account enumeration); JWT replay protection via `updatedAt` check; 1-hour token expiry.
- No new features are required, only guaranteeing the flow works end-to-end.

### FR-7 — Visual / Professional Identity Across All Templates
Every transactional email rendered by this system SHALL:

- Use the shared `renderEmailLayout` master template;
- Display the "Helar" brand consistently in the gradient header area;
- Use inline CSS that renders reliably across Gmail, Outlook, Apple Mail, and mobile clients (no external stylesheets, no `<style>` blocks beyond `<body>` inline layout);
- Have a descriptive subject line that does not look spammy:
  - Welcome: `Welcome to Helar, {{firstName}} 👋`
  - Verification: unchanged (`Verify your Helar account`)
  - Password reset: unchanged (`Reset your Helar password`)
  - Subscription activation: `Your Helar subscription is active — thank you`
  - Expiring soon (7d): `Your Helar subscription expires in 7 days — renew early`
  - Expiring soon (3d): `Heads up: your Helar subscription ends in 3 days`
  - Expiring soon (1d/today): `Last chance: your Helar subscription expires today`
  - Expired: `Your Helar subscription has expired — renew to restore access`
  - Contact form: `Helar contact: {{subject}}`
  - Admin notification: appropriate "New …" subject lines with user/plan context
- All inserted dynamic values MUST pass through the existing `escapeHtml` helper to prevent XSS in HTML email bodies.

---

## Non-Functional Requirements

### NFR-1 — Backwards Compatibility
- All existing exported email sender function signatures MUST remain unchanged. New functions are additive exports only.
- The existing `verificationEmailStatus` meta field returned by `POST /api/v1/auth/register` MUST keep its semantics; adding `welcomeEmailStatus` is additive.
- Existing API route handlers MUST NOT require frontend changes beyond what is needed for `welcomeEmailStatus` surfacing (if any).

### NFR-2 — Idempotency & Duplicate Prevention
- Subscription reminder/expired emails MUST have at-least-once delivery with best-effort exactly-once via the `notificationFlags` JSON field on Subscription. The runner MUST check flags before sending and record them in the same transaction (or, if mail transport is outside the DB tx, use a best-effort pattern that records flags immediately after successful transport).
- The scheduled runner MUST NOT send duplicate reminders even if it runs multiple times within the same day.

### NFR-3 — Fail-Open for Critical UX Paths
- Registration, subscription activation, password reset, and contact form submissions MUST NOT return HTTP 5xx purely because the SMTP transport failed. Email send errors:
  - MUST be logged with full context (to, function name, error message, rejection metadata when available);
  - MUST surface the `*Status: "failed"` in any response metadata fields;
  - For contact form specifically: when email config is missing, return 503 `CONTACT_UNAVAILABLE` (existing behavior); for SMTP failures after config is present, log and return metadata showing failure while still accepting the HTTP submission.

### NFR-4 — Deployment Safety
- Environment variables added/changed (if any) MUST be documented in `.env.example` with sensible defaults and explanatory comments.
- Secrets (password `[REDACTED_MAILBOX_PASSWORD_SET_VIA_ENV]`) MUST NOT be hardcoded in source code. They are read from env vars only; `.env.example` SHALL have the placeholder empty but include a comment that says to set `MAIL_APP_PASSWORD=[REDACTED_MAILBOX_PASSWORD_SET_VIA_ENV]` and `MAIL_FROM_EMAIL=support@helar.law`.

### NFR-5 — Observability
- Each email send function MUST produce structured logs (via `console.*`) with: event name, recipient (email), outcome (`sent`/`skipped`/`failed`), and if failed, the error message. Avoid logging passwords or tokens.

---

## Constraints, Dependencies, Assumptions

- **Email service:** SMTP through Namecheap/hosting provider at `server212.web-hosting.com:465` TLS (per existing `.env.example`). If host/provider is later migrated, only env vars change — no code changes.
- **Nodemailer remains the mail transport library** (already in `apps/api/package.json`).
- **MongoDB via Prisma:** `notificationFlags` SHALL be stored as `Prisma.InputJsonValue` / `Prisma.JsonValue` on the `Subscription` model. If the field does not yet exist, a `startup-migrations.ts` update script MUST add it with a safe default of `{}`.
- **Scheduler:** Simple in-process `setInterval`-based daily runner with a day-level guard (last-run-timestamp persisted either in memory or a small collection). If the API process on Render restarts multiple times per day, duplicate sends are still prevented via `notificationFlags`.
- **Assumption:** The `info@helar.law` inbox is preconfigured on the hosting provider to receive mail.
- **Assumption:** The password `[REDACTED_MAILBOX_PASSWORD_SET_VIA_ENV]` has been set for the `support@helar.law` mailbox on the hosting provider's end.
- **Open question:** What time of day (UTC) should expiry reminders be sent? Default: 08:00 UTC, with ±30 min jitter.

---

## Acceptance Criteria

### Rule ACs (objectively verifiable)
- AC-R1: `.env.example` documents `MAIL_FROM_EMAIL=support@helar.law` and `MAIL_APP_PASSWORD` commented placeholder with value name `[REDACTED_MAILBOX_PASSWORD_SET_VIA_ENV]`, plus `CONTACT_TO_EMAIL=info@helar.law`.
- AC-R2: When env vars match the documented credentials, every email sender in `lib/email.ts` successfully delivers mail through the SMTP transport from `support@helar.law`.
- AC-R3: Submitting the public contact form (`POST /api/v1/contact`) with `CONTACT_TO_EMAIL` unset/empty delivers to `info@helar.law`; reply-to is the visitor's email.
- AC-R4: After `POST /api/v1/auth/register` succeeds, two distinct emails are attempted: verification + welcome. Response meta contains both `verificationEmailStatus` and `welcomeEmailStatus` fields.
- AC-R5: The welcome email HTML renders through `renderEmailLayout`, contains greeting by name, 3+ feature bullets, a Sign-in CTA button, and a footer note.
- AC-R6: `sendSubscriptionActivationEmails` subscriber and admin variants render through `renderEmailLayout` branded layout (not bare inline HTML).
- AC-R7: `Subscription` model has a `notificationFlags` JSON field defaulting to `{}`. Startup migrations ensure it exists.
- AC-R8: Daily subscription runner (1) sends expiring-soon emails at 7d/3d/1d/today boundaries; (2) transitions expired ACTIVE subs to EXPIRED; (3) sends expired-subscription emails; (4) records flags to avoid duplicates.
- AC-R9: Expiring-soon email contains days-remaining phrase, plan, expiry date, "Renew now" button to `/pricing`; expired email confirms restriction, expired-on date, renew CTA, support contact.
- AC-R10: Forgot password → reset flow is end-to-end functional: request receives same generic response regardless of email existence; valid registered user receives branded password-reset email with 1-hour expiry mention; clicking link opens reset page; submitting matching new passwords updates password, revokes sessions, shows success and "Return to sign in" link.
- AC-R11: All dynamic content inserted into HTML email templates passes through `escapeHtml` (existing call sites retained for current templates, added for new template helpers).
- AC-R12: No transactional endpoint (register, activate subscription, forgot password, contact) returns HTTP 5xx solely due to SMTP transport error; errors are logged and status is surfaced via response metadata where appropriate.
- AC-R13: TypeScript type-check (`npm run check`) and ESLint (`npm run lint`) pass for both `apps/api` and `apps/web`.

### Rubric ACs (evaluative)
- AC-RB1 — Professional visual quality (0–3):
  - `0` — Raw unstyled text; inconsistent layout; looks like a dev system.
  - `1` — Some styling but missing branded header, CTA button, or layout structure.
  - `2` — Consistent branded header/footer, CTA buttons, and details cards; looks trustworthy across most clients.
  - `3` — Fully polished, premium look: gradient header, clear visual hierarchy, elegant spacing, strong CTAs, personalized greeting, feature highlights, and mobile-friendly rendering that looks good in Gmail/Outlook/Apple Mail previews. **Pass threshold ≥ 2.**
- AC-RB2 — Subject line quality (0–2):
  - `0` — Generic, spammy, or missing punctuation/capitalization.
  - `1` — Clear but bland; no personalization.
  - `2` — Descriptive, well-cased, personalized where appropriate, and unlikely to trigger spam filters. **Pass threshold ≥ 1.**
- AC-RB3 — Error handling & logging quality (0–2):
  - `0` — Email failures silently swallowed; no log context.
  - `1` — Failures logged but response metadata is missing.
  - `2` — Structured console logs for every send with recipient + outcome; response metadata (`*Status`) accurately reflects outcome; contact form gracefully returns 503 only when config missing, not transient SMTP failure. **Pass threshold ≥ 1.**
