# Law Reports Save Failing — Debug Session

**Status:** [OPEN]
**Session ID:** `law-reports-save-failing`
**Opened:** 2026-08-17

## Symptom
Law reports fail to save *regardless of size*. Toast shows "could not create the library material" or similar generic fallback even for small single-paragraph pastes that previously succeeded.

## Expected
Small saves → fast 201 created. Large 26-page Word HTML paste → chunked transport upload + progress bar + eventual 201 created. Any failure surfaces classified server error in toast, not generic fallback.

## Environment
- Remote: Render web service (Node worker ~512 MB) + MongoDB Atlas.
- Frontend: React + TanStack Query + Axios via `authenticatedHttp`.
- Backend: Express + Prisma v6 (MongoDB) + Zod strict input schemas.

## Hypotheses (falsifiable)

| # | Hypothesis | Evidence signal to collect |
|---|---|---|
| H1 | FE sends explicit `bodyChunkToken: undefined` / `summaryChunkToken: undefined` keys. Zod `.strict()` treats these as unknown keys and rejects with field-level strict error that is not humanized properly. | FE: log `Object.keys(finalPayload)` right before Axios POST. BE: log `Object.keys(request.body)` + Zod parse `flattened.fieldErrors` + `formErrors`. |
| H2 | `buildNextLawReportNumber` probes inside the MongoDB multi-doc tx snapshot. All probe reads use the SAME stale snapshot. At commit, unique `reportNumber` P2002 fires. `runSerializableWrite` re-runs the same stale pattern 16× → all fail. | On every attempt: log `{ attempt, highestSequence, probeLoopIterations, chosenCandidate, isP2002 }`. If 16 attempts all pick same `chosenCandidate` with no other commits between them → H2 confirmed. |
| H3 | `calculateEstimatedMinutesFromBody` on long rich HTML returns NaN / Infinity / >20000, or `estimatedMins` is coerced to something Zod `.max(20_000)` rejects → Zod fail. | Log `{ draft.estimatedMins, body.length, estimatedMinsFromBody, Zod estimatedMins error(s) }`. |
| H4 | For large reports: transport chunk append (FE → BE) fails silently. `prepareAdminLibraryTransport` throws `AxiosError` that has no JSON envelope → `extractServerErrorMessage` returns undefined → generic toast. | FE: log every chunk append `{ kind: body|summary, index, total, httpStatus, responseShape, errorCode, serverMessage }`. If any chunk HTTP != 2xx or transport throws → H4 confirmed. |
| H5 | MongoDB unique index on `StudyMaterial.reportNumber` is being interpreted incorrectly (or is a compound index including `deletedAt`/`categoryId` in ways our "scan all regardless of deletedAt" logic doesn't match). P2002.meta.target shows fields. | Log P2002 `{ meta?.target, meta?.model_name, reportNumber }` whenever caught. |
| H6 | User auth token has expired or lacks admin scope, so chunk append (separate HTTP call routed above JSON middleware) fails 401/403 before the final POST even runs. | On FE/BE: log auth check pass/fail for chunk append handlers, `request.auth?.userId` or session shape. |

## Reproduction steps (user to run after instrumentation deployed)
1. In Super Admin or Content Admin workspace, navigate to Law Reports.
2. Click Create new law report.
3. Fill title (any ≥ 2 chars), storage link (e.g. `https://example.com/x`), material type.
4. For body, paste EITHER:
   - Small: "This is a small test report."
   - Large: the original 26-page Word HTML that started the whole debugging exercise.
5. Open Browser DevTools → Console + Network tabs.
6. Click **Save**.
7. In Console, find lines prefixed with `[debug-law-reports-save-failing]` and copy ALL of them. Also note the exact toast message.
8. Report: **A** (small works / large works) vs **B** (one or both still fail) and paste the console lines.

## Logs / Evidence folder
(tbd after reproduction run)

## Fixes applied
(none yet — instrumentation-only step first)
