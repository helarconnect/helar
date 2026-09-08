# Helar Content Approval Regression Fix - Implementation Plan

## Task 1: ES Module Compliance — Remove All `require()` in apps/api/src
- **Status**: `pending`
- **Priority**: high (suspected #1 cause of "can't approve any content")
- **Depends On**: None
- **Description**:
  - The prior debugging session added `const fs = require("fs")` inside inline IIFEs in `admin-notifications.ts`. The apps/api package is ESM (`type: module` in package.json). `require` is `undefined` → `ReferenceError: require is not defined` on EVERY call into `runApprovalMutation` → HTTP 500 for all 10 approve/decline endpoints.
  - Scan entire `apps/api/src/**/*.ts` for any `require(...)` calls. Remove them all using ESM-compliant alternatives (use existing static imports, or `await import()` only for dynamic imports, or simply delete dead debug-only code that read `.dbg/<sessionId>.env`).
  - Ensure NO file in apps/api/src uses CommonJS-only syntax.
- **Acceptance Criteria Addressed**: AC-1, NFR-1, NFR-3
- **Test Requirements**:
  - `rule` TR-1.1: `rg -n 'require\(' apps/api/src --type ts` returns ZERO matches (exit 0 empty output). Evidence = grep output copy.
  - `rule` TR-1.2: `apps/api npm run check` passes (no TS errors). Evidence = shell output.

---

## Task 2: Audit & Lock `runApprovalMutation` Correct Ordering + Defensive Fallbacks
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Read `runApprovalMutation<T>` top-to-bottom and force exactly one canonical control flow:
    1. `loadPendingItem` → if null → return null.
    2. `await updatePendingItem(tx, item)` — runs FIRST, with NO try/catch (if status update fails, the caller MUST see it as 500, so this is correct to throw).
    3. Actor lookup try/catch → `console.warn` fallback; recipient = null on error.
    4. If recipient: notification build + write try/catch → `console.warn` fallback; swallow.
    5. return `createResult(item)`.
  - Remove any dead code paths introduced by earlier instrumentation.
  - Ensure returned result data shape exactly matches route expectations for all 10 usages.
- **Acceptance Criteria Addressed**: AC-4, AC-5, FR-2
- **Test Requirements**:
  - `rule` TR-2.1: Static inspection of function shows `updatePendingItem` call comes before any actor/notification logic. Evidence = line-range read of function showing correct sequence.
  - `rubric` TR-2.2: Defensive Fallback Robustness — scale 1..5; (1 = no try/catch; 3 = one combined try/catch for both; 5 = two independent catches with distinct console.warn prefixes). Pass threshold >= 5. Evidence = function source + line citations.
  - `rule` TR-2.3: No unused imports introduced (linted via TS compile unused-var / strict TS error rule if set; fallback = compile passes). Evidence = compile 0 errors.

---

## Task 3: 100% Soft-Delete Compliance Audit & Final Standalone Fixes on All Remaining Queries
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Reproduce the grep for `deletedAt: null` in admin-notifications.ts.
  - Classify each match:
    - Good (NESTED inside `OR: [...]` array with `isSet: false` sibling → leave)
    - Bad (STANDALONE at any where-object nesting level without OR sibling → convert to canonical `OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]`)
  - Make targeted edits only for BAD matches. No mass regex replace across the file (risk of double-wrapping already-correct ORs). Each edit has 3-line before/after context check.
  - Verify coverage across all 10 soft-deletable collections used in the file: StudyMaterial, SubjectSummaryCase, SubjectSummaryEntry, BarFinalExamQuestion, BarFinalExamMcqQuestion, AuditLog, User, UserRole, Role, Notification.
- **Acceptance Criteria Addressed**: AC-2, FR-3
- **Test Requirements**:
  - `rule` TR-3.1: For each BAD match found, grep-result line + after-edit grepped line shows it now nested under OR with isSet:false. Evidence = before/after grep pairs for each converted standalone case.
  - `rule` TR-3.2: Final `rg deletedAt:null admin-notifications.ts -n | wc -l` count matches total expected count (all inside OR arrays; each match has a sibling `isSet: false` line at same level). Evidence = total count listing with line contexts.

---

## Task 4: Prisma Select/Include Shape Contract Validation for All 10 runApprovalMutation Usages
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - For every one of the 10 `runApprovalMutation<T>` instantiations:
    a) Read `generic parameter T` declaration.
    b) Read `loadPendingItem(tx)` → `select: {...}` shape.
    c) Read `buildNotification(item)` → list all `item.fieldName` accesses.
    d) Read `createResult(item)` → list all `item.fieldName` accesses.
    e) Assert every field accessed in (c) and (d) is PRESENT in (b) select.
  - For any mismatch found, ADD the missing field to the select.
  - Additionally for each `updatePendingItem`:
    a) Read `where: { id: material.id }` (no issues expected).
    b) Read `data: {...}` writes → cross-check against Prisma model fields for existence/types.
- **Acceptance Criteria Addressed**: FR-4, AC-6, AC-7
- **Test Requirements**:
  - `rule` TR-4.1: 10/10 instantiations pass the select-vs-access audit with zero missing fields. Evidence = 10-row table in completion evidence showing TypeParam, loadPendingItem fields, buildNotification accesses, createResult accesses, match=OK.
  - `rule` TR-4.2: 5 approve updatePendingItem data-writes + 5 decline data-writes each match schema field names/types. Evidence = Prisma schema snippet line references for each updated field.

---

## Task 5: Bulk Approve Sanity + Submitted-By Label Fallback Defensive Map
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - `approveAllPendingContent`: Confirm `count` sum of approved matches actual DB update counts (returned by Prisma `updateMany.count`). Confirm the outer notification try/catch is present (should be; add if missing).
  - Content review queue "submittedBy" label maps: if a name lookup returns undefined, enforce fallback to "Content admin" string — never `undefined` or the raw `null`. This is the last 500 source that shows "can't see any pending items" (user proxy symptom for "can't approve any").
  - Ensure `defaultActor` returns strings only (no null/undefined for `fullName` or `createdAt`).
- **Acceptance Criteria Addressed**: AC-8, AC-9
- **Test Requirements**:
  - `rule` TR-5.1: `approveAllPendingContent` notification writes are guarded by the existing try/catch block (or one added if not present). Also counts aggregation `approvedCount = sum of 5 table updateMany.count`; return JSON contains all 5 count keys. Evidence = function source read + line citations.
  - `rule` TR-5.2: For every pending item mapper (libraryItems, caseItems, entryItems, theoryItems, mcqItems) in getSuperAdminApprovalQueue, the `submittedBy` field coalesces to "Content admin" if both directName AND auditName are falsy; no `undefined` leak. Evidence = source of each mapper + string fallback.

---

## Task 6: Route Handlers Catch-Block Cleanliness — User-Safe Errors Only, Structured Logging
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - Review all 5 approve + 5 decline route handlers in `app.ts` around lines 2360..2780.
  - Confirm the catch block:
    a) ALWAYS does `console.error(error)` (for Render server logs / debugging).
    b) ALWAYS returns HTTP 404 for APPROVAL_TARGET_NOT_FOUND (returned null from helper).
    c) ALWAYS returns HTTP 500 with `{ code: "ADMIN_APPROVAL_FAILED", message: "<short user-safe sentence>" }` for exceptions thrown during the helper call or from any other reason.
    d) Never leaks the raw Prisma error name/message into the response JSON `message` field.
- **Acceptance Criteria Addressed**: FR-5, FR-6
- **Test Requirements**:
  - `rule` TR-6.1: 10/10 approve/decline routes — catch block never echoes `error.message` into JSON response.message. Evidence = source line read of each route catch.
  - `rule` TR-6.2: catch block always begins with console.error(error) or equivalent structured error logging. Evidence = source for each route.

---

## Task 7: Final Dual Compile + Static AC-1/2/3 Sweep
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Tasks 1..6 (all completed first)
- **Description**:
  - Run AC-1 (require grep), AC-2 (soft-delete audit), AC-3 (dual compile) once after all prior fixes are applied.
  - Capture all outputs as completion evidence in the final task completion record.
  - If any failure, return to the specific pending/in_progress task and remediate, then re-run until green.
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3
- **Test Requirements**:
  - `rule` TR-7.1: `rg -n 'require\(' apps/api/src --type ts` → 0 matches. Evidence = command output.
  - `rule` TR-7.2: Complete soft-delete compliance (per task 3 final state). Evidence = annotated grep lines + OK/FAIL for each line.
  - `rule` TR-7.3: `apps/api npm run check` exits 0, 0 errors. Evidence = tail of stdout.
  - `rule` TR-7.4: `apps/web npm run check` exits 0, 0 errors. Evidence = tail of stdout.

---

## Task 8: Deploy Guidance + User Verification Cheat Sheet
- **Status**: `pending`
- **Priority**: high (delivery)
- **Depends On**: Task 7
- **Description**:
  - After all tasks pass, write a concise Deploy+Verify instruction block for the user:
    1. Commit, push, Render redeploys both services.
    2. Verification steps (in order):
        a) Content Review list loads — shows N pending items, each has submitted-by label.
        b) Approve one law report — check Network tab, 401 (refresh) then RETRY request = 200; row leaves list.
        c) Approve one MCQ question, one NLS theory question, one subject case — all return 200 and leave list.
        d) Decline one entry with reason → returns 200; content admin opens back in edit form and sees reviewFeedback reason.
        e) Bulk approve-all button: remaining row count → 0 after apply; window.alert confirmation matches the count.
  - Provide the Render Dashboard Logs "grep lines" user should look for: `[APPROVE]` or `Approval succeeded but ... non-fatal` to confirm info-log behavior.
- **Acceptance Criteria Addressed**: AC-6, AC-7, AC-8, AC-9
- **Test Requirements**:
  - `rubric` TR-8.1: User-facing instruction clarity — scale 1-5; (1 = vague, missing steps; 3 = some steps missing; 5 = end-to-end ordered, with expected Network status codes, fallback log hints, A/B/C/D/E numbered steps). Threshold >= 5.
  - `rule` TR-8.2: Deliverable references all 5 entity types with at least one verify action per entity. Evidence = instruction text read.

---

**Queue is fully planned. Approve before implementation begins.**
