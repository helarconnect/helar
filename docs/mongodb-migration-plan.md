# MongoDB Migration Plan

## Scope

This repository now targets MongoDB Atlas as the primary database using the database name `Cluster0`.

The active Prisma runtime schema is now `prisma/schema.prisma` with a MongoDB datasource. The former PostgreSQL schema has been archived to `prisma/schema.postgresql.prisma` for legacy reference and one-time backfill work only.

## Current blockers

1. Existing PostgreSQL source data has not yet been imported because the legacy source database is currently unreachable.
2. MongoDB Atlas connectivity is currently failing in this environment at the DNS/server-selection level, so `db push` and seed cannot complete against the target cluster from here.
3. Some backend flows still retain SQL-shaped assumptions that should continue to be reviewed under Mongo runtime behavior.

## Stage 1: Preparation History

1. PostgreSQL was kept as the active runtime datasource during the conversion phase.
2. MongoDB Atlas was introduced first as a draft target.
3. The MongoDB target database name and connection format were documented.
4. The Prisma models were inventoried by migration complexity:
   - Simple collections
   - Collections with many references
   - Join-table heavy collections
   - Analytics-heavy collections

## Stage 2: MongoDB Schema Redesign

1. Change the Prisma datasource provider from `postgresql` to `mongodb`.
2. Replace PostgreSQL UUID fields with MongoDB-compatible ID definitions.
3. Rework relation fields and join models for MongoDB-compatible storage.
4. Revisit composite unique constraints and indexes for MongoDB support.
5. Decide where denormalization is better than preserving the current relational shape.

### Current progress

The MongoDB schema has now been promoted to the active runtime schema at `prisma/schema.prisma`.

This draft currently covers:

- `User`
- `Role`
- `Permission`
- `UserRole`
- `RolePermission`
- `Student`
- `Tutor`
- `Notification`
- `SubscriptionPlan`
- `ActivityLog`
- `AuditLog`
- `Session`
- `Device`
- `Subscription`
- `SubscriptionPlan`
- `Payment`
- `Transaction`
- `Coupon`
- `Category`
- `Course`
- `CourseCategory`
- `Module`
- `Lesson`
- `Enrollment`
- `StudyMaterial`
- `ReadingHistory`
- `Bookmark`
- `Assignment`
- `AssignmentSubmission`
- `Exam`
- `CbtQuestion`
- `CbtAnswer`
- `ExamAttempt`
- `ExamResult`
- `ProgressTracking`
- `SubjectSummarySubject`
- `SubjectSummaryTopic`
- `SubjectSummaryCase`
- `SubjectSummaryEntry`
- `SubjectSummaryEntryCase`
- `SubjectSummaryCaseView`
- `DiscussionTopic`
- `DiscussionAnswer`
- `Comment`
- `DiscussionTopicVote`
- `Reply`
- `Announcement`
- `Certificate`
- `LiveSession`

This schema now covers the auth/access-control foundation, library and subject-summary data, student study models, community models, learning and CBT models, and the remaining platform support models.
The first PostgreSQL-specific raw SQL dependency in `apps/api/src/admin-users.ts` has also been replaced with provider-neutral Prisma logic.
The subject-summary API layer has also been partially de-risked for MongoDB by replacing UUID-only request validators with UUID-or-ObjectId validation in the affected modules and by removing the `groupBy()`-based summary queries from:

- `apps/api/src/admin-subject-summaries.ts`
- `apps/api/src/subject-summary-module.ts`

Search filters in the following modules have also been routed through a shared provider-aware helper so the remaining PostgreSQL-specific `mode: "insensitive"` usage is no longer duplicated across the query layer:

- `apps/api/src/admin-library.ts`
- `apps/api/src/admin-subject-summaries.ts`
- `apps/api/src/subject-summary-module.ts`
- `apps/api/src/student-study-center.ts`
- `apps/api/src/lib/text-search.ts`

The library write flow in `apps/api/src/admin-library.ts` now also uses a provider-aware transaction wrapper so PostgreSQL keeps serializable writes while MongoDB will not inherit SQL-only isolation settings.
The Mongo draft schema now also includes the student study models required by the dashboard, study center, and revision flows:

- `StudentStudyProgress`
- `StudentStudyBookmark`
- `StudentStudyNote`
- `StudentStudyDownload`

The dashboard and community API layers have also been further de-risked:

- `apps/api/src/admin-dashboard.ts` no longer depends on Prisma `groupBy()` for its status, payment, study-type, and case-view summaries
- `apps/api/src/helar-connect.ts` now uses the shared provider-aware text search helper
- `apps/api/src/admin-users.ts` now uses the shared provider-aware text search helper

Transaction usage is also now centralized behind a shared helper in `apps/api/src/lib/transactions.ts`, and the current auth, admin-user, and subject-summary transaction callers have been switched over to it:

- `apps/api/src/app.ts`
- `apps/api/src/admin-users.ts`
- `apps/api/src/admin-subject-summaries.ts`

The auth and approval flows have also been hardened so that:

- registration creates the refresh session inside the main transaction scope
- sign-in creates the device row and refresh session inside one transaction scope
- approval or decline content mutations and their immediate notification writes now share a common transaction-based mutation helper in `apps/api/src/admin-notifications.ts`

Session handling is also now partially centralized for the next auth redesign step:

- `apps/api/src/lib/sessions.ts` now owns shared refresh-session validity and revocation helpers
- `apps/api/src/admin-users.ts` now revokes sessions through that shared helper instead of inlining `session.updateMany(...)`
- both Prisma schemas now include a prepared `sessionsRevokedAt` field on `User` for the future user-level invalidation rollout

That user-level invalidation rollout has now been completed in the live API path:

- the active Prisma client is now generated from the MongoDB `prisma/schema.prisma`
- refresh-session validation in `apps/api/src/app.ts` now reads `User.sessionsRevokedAt`
- admin-user suspension now revokes future refreshes by updating the user-level marker through the shared session helper

### Highest-impact models

- `User`, `Role`, `UserRole`, `RolePermission`
- `StudyMaterial`, `ReadingHistory`, `Bookmark`
- `SubjectSummarySubject`, `SubjectSummaryTopic`, `SubjectSummaryCase`, `SubjectSummaryEntry`, `SubjectSummaryEntryCase`
- `DiscussionTopic`, `DiscussionAnswer`, `Comment`, `Reply`, votes, and notifications
- `StudentStudyProgress`, `StudentStudyBookmark`, `StudentStudyNote`, `StudentStudyDownload`

## Stage 3: Rewrite query logic

The following areas must be rewritten or validated for MongoDB compatibility:

1. Raw SQL in `apps/api/src/admin-users.ts`
2. Remaining dashboard/reporting validation in `apps/api/src/admin-dashboard.ts`
3. Any remaining provider-specific search semantics that still need true Mongo case-insensitive parity, especially if lowercased shadow fields or Atlas Search are preferred over plain `contains`
4. Transaction flows that still rely on relational guarantees in:
   - `apps/api/src/app.ts`
   - `apps/api/src/admin-library.ts`
   - `apps/api/src/admin-users.ts`

## Stage 4: Data migration

If existing PostgreSQL data must be preserved:

1. Export PostgreSQL data by model in a deterministic order.
2. Transform relational IDs and foreign keys into MongoDB-compatible references.
3. Load base collections first.
4. Load dependent collections next.
5. Run validation checks for counts, key references, and critical records.
6. Verify auth, roles, approvals, dashboards, Helar Connect, and study-center data.

### Current progress

A real backfill script now exists at `prisma/migrate-postgres-to-mongo.ts`.

It currently migrates the Mongo-covered slices only:

- auth and RBAC models
- sessions and devices
- billing models
- library models
- student study models
- subject summary models
- learning and CBT models
- Helar Connect community models
- announcement, certificate, and live-session models
- activity, audit, and notification models

The script is designed to be rerunnable and uses deterministic UUID-to-ObjectId conversion so cross-model references remain stable in MongoDB Atlas.

Runnable commands now exist:

- `npm run prisma:generate`
- `npm run prisma:generate:legacy-postgres`
- `npm run db:migrate:legacy-postgres`

Current external blockers:

- PostgreSQL source data is not currently reachable in this environment because `localhost:5432` is down
- MongoDB Atlas works from this environment when using the direct non-SRV replica-set URI form in `DATABASE_URL`

This means the active Mongo runtime is now operational. The remaining operational dependency is the archived PostgreSQL source if legacy data still needs to be imported.

## Stage 5: Runtime Cutover

1. `DATABASE_URL` now points to the working direct MongoDB Atlas replica-set connection string.
2. `LEGACY_POSTGRES_DATABASE_URL` is reserved only for one-time import from the archived PostgreSQL source.
3. Regenerate Prisma Client whenever `prisma/schema.prisma` changes.
4. Run seed or legacy-import scripts as needed.
5. Run full API and web validation.
6. Smoke-test:
   - authentication
   - role-based routing
   - content approvals
   - Helar Connect
   - dashboards
   - study tracking

## Recommended next implementation slice

The next operational steps are:

1. Restore successful TLS handshake connectivity to MongoDB Atlas from this environment so `db push` and seed can succeed.
2. If legacy PostgreSQL data must be preserved, restore reachability to the old source and run the completed import via `npm run db:migrate:legacy-postgres`.
3. Validate Atlas collection counts and smoke-test the app under Mongo-backed runtime behavior.
4. Continue reviewing any remaining SQL-shaped write semantics such as counters, search parity, and multi-step consistency flows.

Useful operational command:

- `npm run db:doctor:mongo`

Confirmed operational result after switching to the direct replica-set URI:

- `npm run db:push` succeeds
- `npm run prisma:seed` succeeds
- MongoDB Atlas now contains seeded runtime data

## Environment notes

The active environment shape is represented in `.env.example` as:

- `DATABASE_URL` for MongoDB Atlas
- `LEGACY_POSTGRES_DATABASE_URL` for optional one-time legacy import
- `MONGODB_DATABASE_NAME`
