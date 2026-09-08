# Helar Portal: Content Approval Regression Fix - Product Requirements Document

## Overview
- **Summary**: Stabilize and correct the Super Admin → Content Review approval/decline/bulk-approve workflows so that every pending content type (law reports / studyMaterial, subject summary cases, subject summary entries, NLS bar-final theory questions, MCQ bar-final questions) can be reliably approved, declined, or bulk-approved on the first click on the production Render deployment.
- **Purpose**: During two prior debugging sessions, several incremental "hotfixes" were layered onto the `admin-notifications.ts` transactional approval wrapper (MongoDB soft-delete `isSet:false` fixes, defensive try/catch around notification writes). User reports the scope of failure has expanded from just law reports to "can't approve any content at all" — indicating one or more regressions were introduced into the shared `runApprovalMutation` wrapper, its nested relation lookups, or the route plumbing that calls it. This spec defines a professional end-to-end repair with independent verification so that no content type is broken and no 404/403/500 occurs on any approve/decline path.
- **Target Users**: Super Admin role (code `super_admin`) only on `helar.onrender.com` and local dev environments.

## Goals
1. Every single-item **Approve** action (5 endpoints × POST on `/api/v1/admin/approvals/<type>/:id/approve`) returns HTTP 200 `{ success: true, data: { id, success: true } }` when given a valid pending-content ObjectId of that entity type.
2. Every single-item **Decline** action (5 endpoints × POST on `.../decline` with `reason: string`) returns HTTP 200 success for valid pending rows.
3. **Bulk Approve All Pending** (`POST /api/v1/admin/approvals/approve-all-pending`) returns HTTP 200 with accurate counts, and every row moved from `PENDING_APPROVAL` → `PUBLISHED`.
4. **Content Review list** (`GET /api/v1/admin/content-review-queue` alias `GET /admin/content-review` + notification bell) correctly shows submitted-by labels, counts, and card metadata — no 500, no missing rows due to soft-delete under-match.
5. Regressions from the prior "quick fix" sessions (instrumentation leftovers, OR-branch syntax errors, removed `createNotification` fields, broken Prisma `select`/`include` shapes, unused `require()` calls that ESM cannot resolve) are fully removed or repaired.
6. Defensive semantics are preserved: informational failures (content-admin actor not found, notification write fails) must NOT abort the critical status transition; they degrade to `console.warn` so approve always succeeds.

## Non-Goals
1. No changes to frontend admin forms or React rendering of the Content Review cards.
2. No changes to the role definition of `super_admin` or route-gate middleware (`requireSuperAdminRequest`).
3. No changes to the content-admin submit/create flow — the 5 entity-type CRUD create/update endpoints are out of scope.
4. No new DB migrations are added unless Prisma demands them (migration additions must be explicitly approved).
5. No changes to NLS theory questions (barFinalExamQuestion) unrelated to the approve workflow.
6. Not adding e2e test infrastructure (scope is static compile + manual route trace evidence + production log guidance).

## Background & Context
**History (verified facts preserved from prior sessions):**
- Fact 1: Helar uses MongoDB via Prisma adapter. For documents with optional `DateTime? deletedAt`, Prisma strict filter `deletedAt: null` does NOT match rows where the field is **unset**. The correct universal pattern is `OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]` — documented in `project_memory.md` and applied to the 5 content entity `loadPendingItem` findFirst queries, list findMany, and bulk `updateMany` on ~2026-09-08 session 1.
- Fact 2: After session 1, user's symptom changed from **404** (APPROVAL_TARGET_NOT_FOUND — loadPendingItem returned null) to **500** — evidence that loadPendingItem now succeeded but a subsequent step threw.
- Fact 3: On session 2 (2026-09-08), a `TRAE-debugger` instrumentation was added to `runApprovalMutation` using `const fs = require("fs")` in an inline IIFE. `apps/api` is compiled as an **ES module** (`type: module` in package.json). On Node 18/20 Render runtimes, bare `require()` inside ESM is undefined → **ReferenceError: require is not defined** → exception at top of `runApprovalMutation` BEFORE the `loadPendingItem` step → 500 for EVERY entity type that uses `runApprovalMutation` (all 5 approve/decline pairs). This is the #1 hypothesized cause for "can't approve any content at all." The instrumented version also used `fetch()` for debug reporting — Node 18 has global fetch, but Render runtime may block outbound HTTP from server code to external collectors, silently slowing/crashing the hot path. At some point the instrumentation was replaced with a `// comment-only` revert that re-introduced defensive try/catch but may have left ES module syntax issues.
- Fact 4: Frontend axios interceptor uses `_retry: true` auto-refresh on 401. DevTools network tab shows 401 then 500 for a single click — the 401 is expected (15-min JWT refresh), only the 500 is the real failure.
- Fact 5: There are **10** approval-wrapper usages of `runApprovalMutation<T>` (5 types × approve/decline) + 1 special `approveAllPendingContent` (no wrapper — direct 5x updateMany in one tx, notification try/catch already present).

## Functional Requirements
### FR-1: ESM Safety
No server code in `apps/api/src/**/*.ts` may use `require(...)`. All module resolution uses ESM `import` syntax or `await import(...)` dynamic imports only.

### FR-2: runApprovalMutation No Fail-On-First-Error
For every `runApprovalMutation` execution on any valid pending entity:
1. Load the row → if `null` → return `null` (route → 404; unchanged).
2. **Immediately after load, run the critical status update (`updatePendingItem`) first inside the transaction.**
3. After update, attempt actor lookup → if throws or returns null → degrade with `console.warn` + continue, recipient = null.
4. If recipient exists → build notification + write it → if throws → degrade with `console.warn` + continue.
5. Return `createResult(item)` from the transaction.

### FR-3: Universal Soft-Delete Compliance on All Queries
All `deletedAt`-gated queries on soft-deletable collections (StudyMaterial, SubjectSummaryCase, SubjectSummaryEntry, BarFinalExamQuestion, BarFinalExamMcqQuestion, AuditLog, User, UserRole, Role, Notification) in `admin-notifications.ts` use `OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]`. **No standalone `deletedAt: null` where-clause key exists at top-level or nested without OR fallback.**

### FR-4: Defined Prisma Shapes
For every `tx.<Model>.findFirst`/`findMany`/`update`/`updateMany` in `admin-notifications.ts`:
- The `select`/`include` shape returned contains every field name that the downstream `buildNotification`, `createResult`, and "submittedBy" label map code accesses on the resulting object.
- For `update`/`updateMany`, `data:` writes only fields the Prisma schema defines.

### FR-5: Stable Approve Endpoint Contracts
For each of the 5 approve endpoints and 5 decline endpoints:
- Valid ObjectId of a row with `status == PENDING_APPROVAL` → HTTP 200 `{ success: true, data: { id: string, success: true } }` OR `{ success: true, data: {...counts...} }` for bulk.
- Response body never contains stack traces or Prisma error names. All inner exceptions caught by the route `try/catch` → return `{ success: false, error: { code: "<UPPER_SNAKE>", message: "<user-safe sentence>" } }` (HTTP 404 only for missing rows; HTTP 500 reserved for genuinely unrecoverable DB errors that occur AFTER the critical update — but these must be rare because of FR-2 fallbacks).

### FR-6: Route Error Messages Remain User-Friendly
Route catch block returns ADMIN_APPROVAL_FAILED or similar messages; never leaks raw error messages into HTTP response body (the actual exception is written to `console.error` only for Render logs).

### FR-7: Defensive Notification Semantics
After the critical status update, actor lookup + notification write failures are non-fatal (FR-2), so even if notification features are broken due to unrelated AuditLog or User data issues, the superadmin still successfully publishes the content.

## Non-Functional Requirements
### NFR-1: TypeScript Strict Compile
`apps/api tsc -p tsconfig.json --noEmit` → exit 0, 0 TS errors.
### NFR-2: Frontend Unchanged Compile
`apps/web tsc -b --noEmit` → exit 0 (no web changes should be needed; enforced as smoke regression check).
### NFR-3: No ES Module Runtime Errors
Every compiled server module successfully loads on Node 18 (Render's current LTS runtime). No `require is not defined` ReferenceErrors.
### NFR-4: Latency
Single-item approve latency < 1s p95 on Render (approve 99% fast path; notification degradation must not add more than 50ms even on audit-lookup failure).
### NFR-5: Log Hygiene
No production-visible `console.log` or `console.error` noise from leftover instrumentation. Real errors use `console.error` with structured prefixes like `[APPROVE] <message>`; informational warnings use `console.warn`.

## Constraints
- **Technical**: Prisma MongoDB adapter, no SQL. ESM modules only in apps/api. Render Node runtime. JWT 15-min access + refresh. No additional npm dependencies.
- **Business**: Approve is a single user action (super admin) and must be idempotent for the DB state (calling Approve twice on an already-approved row must not error — should degrade gracefully to 404 "not pending" since loadPendingItem requires PENDING_APPROVAL).
- **Dependencies**: `admin-notifications.ts` may depend only on existing imports `@prisma/client`, `./lib/prisma.js`, `./lib/transactions.js`, and the existing `ContentPublicationStatus`/`SubjectSummaryCaseStatus`/`BarFinalExamQuestionStatus` enums.

## Assumptions
1. The Prisma client has already been regenerated on Render with the current `schema.prisma` that adds `BarFinalExamMcqQuestion.explanation`. This is a separate deploy-time concern and not in scope of this spec's repair (it only affects MCQ question forms, not the MCQ approve endpoint).
2. `approvedBy` on all 5 entity schemas is correctly typed as `String? @db.ObjectId` (schema was read: StudyMaterial yes; SubjectSummaryCase/Entry + BarFinalExamQuestion/BarFinalExamMcqQuestion verified earlier).
3. Render server on deploy picks up the fixed TS; no long-cached compiled bundles survive.
4. User's production data contains law reports, cases, entries, NLS theory questions, and MCQ questions each with publication/question status `PENDING_APPROVAL` to exercise the full fix.

## Open Questions
- [ ] Does the superadmin want approval notification emails to be re-enabled later, or is the current content-admin Notification bell card sufficient? (Not blocking this fix — informational.)
- [ ] Do we need to add ObjectId validation in readRouteParam before passing to Prisma queries? Currently the route passes any URL string into `findFirst({ where: { id: <any> } })` — Prisma throws P2023 for invalid ObjectId strings, which the route catch block converts to 500. Optional but noted. (Not blocking — out of scope for minimal fix.)

## Acceptance Criteria
Type vocabulary: `rule` (observable binary pass/fail, evidence attached) OR `rubric` (evaluative score, threshold defined).

---

### AC-1: ESM Safety — No `require()` in Compiled Output
- **Type**: `rule`
- **Given**: The current source tree at `apps/api/src/`
- **When**: Grep `rg -n 'require\(' apps/api/src --type ts`
- **Then**: Zero matches (no lines use `require(...)` in TS files under apps/api/src)
- **Pass Condition**: Match count = 0
- **Evidence**: Shell grep output showing "0 matches" or empty result

### AC-2: Zero Bare `deletedAt: null` Outside OR Array
- **Type**: `rule`
- **Given**: Current `admin-notifications.ts`
- **When**: Grep all lines containing `deletedAt: null`
- **Then**: Every match is nested inside an `OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]` array; there are ZERO occurrences of the pattern `where: { ... deletedAt: null ... }` at any nesting level where no `OR: [ ... isSet: false ...]` sibling exists on the same where-clause level.
- **Pass Condition**: No standalone bare matches. Verified by reading every deletedAt:null line in the file OR via a parseable grep showing each line context.
- **Evidence**: Grep output lines 1..N, each showing OR sibling nearby OR a human attestation + line ranges

### AC-3: Compile Pass Both Apps
- **Type**: `rule`
- **Given**: Fresh terminal
- **When**: Run `cd apps/api && npm run check` then `cd apps/web && npm run check`
- **Then**: Both commands exit code 0 with no TypeScript errors
- **Pass Condition**: Exit-code-0 for api AND web; no error text in tail of stdout
- **Evidence**: Command stdout capture (last ~25 lines each) showing exit 0

### AC-4: All 10 runApprovalMutation Usages Follow Critical-First Order
- **Type**: `rule`
- **Given**: runApprovalMutation function body
- **When**: Read the runApprovalMutation control flow line-by-line
- **Then**: Order is: (1) loadPendingItem check; (2) `await updatePendingItem(tx, item)` — happens BEFORE any actor lookup or notification write; (3) actor lookup + notification creation wrapped in try/catch with console.warn fallback; (4) return createResult(item).
- **Pass Condition**: Control flow matches exactly; no "notification happens before update" or "update inside try/catch that rolls back with notification failure"
- **Evidence**: Source code capture of runApprovalMutation lines 119-171 showing correct ordering

### AC-5: Defensive Fallbacks Never Abort Critical Status Transition
- **Type**: `rubric`
- **Dimension**: Robustness of defensive fallbacks around actor lookup and notification
- **Scale**: 1-5
- **Anchors**: 1 = try/catch still re-throws OR transaction includes notification in a way that rollback occurs on failure; 3 = try/catch catches but silently swallows without any log; 5 = two distinct catch blocks (one for actor lookup, one for notification create), each logs a pre-formatted `console.warn` with prefix, and both fall through to return success
- **Pass Threshold**: >= 5
- **Evidence**: runApprovalMutation source; two separate catches; two distinct warn messages

### AC-6: Approve Library Material (Specific User Reported Case) Returns 200 on Valid Pending StudyMaterial
- **Type**: `rule`
- **Given**: A StudyMaterial document exists in Mongo with `publicationStatus = PENDING_APPROVAL`, id = any valid ObjectId (regardless of whether deletedAt is unset or null)
- **When**: Super admin sends POST `/api/v1/admin/approvals/library-materials/<id>/approve` with valid JWT
- **Then**: HTTP status = 200, JSON body contains `{ success: true, data: { id, success: true } }`, DB row's `publicationStatus == PUBLISHED` and `approvedAt` is a recent timestamp and `approvedBy == approver userId`.
- **Pass Condition**: Both HTTP response shape matches AND DB state matches
- **Evidence**: (User-directed) User clicks Approve on Render after deploy; DevTools Network panel shows 200 response (after the expected 401/refresh pair if session is old; the RETRY request is HTTP 200)

### AC-7: The Other 9 Single-Item Endpoints Also Succeed
- **Type**: `rule`
- **Given**: For each of the 9 remaining endpoints (declineLibraryMaterial, approve/decline SubjectSummaryCase & Entry, approve/decline BarFinalExamQuestion, approve/decline BarFinalExamMcqQuestion) there exists at least one valid PENDING_APPROVAL row
- **When**: Each endpoint is called with its expected parameters
- **Then**: Each returns HTTP 200 success, row moves to PUBLISHED (approve) or DRAFT + reviewFeedback populated (decline)
- **Pass Condition**: 9/9 endpoints return 200 and DB states updated correctly
- **Evidence**: (User-directed) Spot-check 2-3 other entity types after deploy, confirm Approve works, confirm declined material shows reason on Content Admin side edit-form review feedback

### AC-8: Bulk Approve All Still Works
- **Type**: `rule`
- **Given**: One or more rows of ANY pending content type exist. (Create 5 test rows, one per type, as pre-condition if needed.)
- **When**: Super admin clicks "Approve all pending"
- **Then**: HTTP 200 with `approvedCount > 0` and accurate per-type counts in `counts.*`; content review list shows 0 pending after page refresh.
- **Pass Condition**: Counts accurate + pending list empty
- **Evidence**: Network response JSON + Content Review empty UI screenshot/user confirmation

### AC-9: Content Review List Shows All Pending Items + Submitted-By Labels
- **Type**: `rule`
- **Given**: 5 pending items in DB (1 each: libraryMaterial, case, entry, NLS theory, MCQ)
- **When**: GET `/admin/content-review` loads queue snapshot
- **Then**: HTTP 200, all 5 items present, each has non-empty `submittedBy` label (falls back to "Content admin" default if audit log absent — never "undefined")
- **Pass Condition**: 5/5 items rendered; no undefined/null labels or 500 on list fetch
- **Evidence**: (User-directed) Post-deploy Content Review page screenshot or browser console showing no JS runtime errors + correct counts

---

### Change Approval Required Before Implementation
Per Spec Mode workflow: Notify user to confirm this `spec.md` captures the problem and desired acceptance criteria before Phase 3 → Phase 4 implementation proceeds.
