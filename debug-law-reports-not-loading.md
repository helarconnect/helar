# Debug Session: law-reports-not-loading
**Status:** [OPEN]
**Date:** 2026-08-18
**Symptom:** User opens law reports page in student/lawyer/judge portal → sees toast/banner error: "Could not load this library section right now. Please make sure the API server is running and try again."
**Regression Window:** Immediately following edit session 2026-08-18 where applied 3 fixes: sort-defaults + summary-cache + sidebar-prefetch-dedup + classifier.

## Hypotheses (Falsifiable)

### H1 — Prisma runtime rejects `{ sort, nulls: "last" }` on scalar orderBy syntax for `reportNumber` / `estimatedMins`
- Mechanism: TypeScript compiled OK via `as const` + `as never` 15 explicit Prisma client / Postgres driver / or / older Prisma version. If version doesn't supports `nulls` sort option for scalar fields. If this throws.
- Predicted runtime evidence: Server log /api/v1/library/law-reports list endpoint throws Prisma.PrismaClientValidationError or KnownRequestError with message mentioning "nulls" / "Invalid argument" orderBy".
- Observation point: API server console.error( debug on [listAdminLibraryMaterials → catch handler.

### H2 — Runtime TypeError on undefined sectionConfig cache reference
-Mechanism: adminListSummaryCache or cachedEnsureCategoriesPromise / or the the re-order declarations (SectionCategory re the the variable declaration.
- Predicted evidence: API endpoint hits a TypeErrors when the TypeError on cache Map access when we access adminListSummaryCache is undefined at the function scope.

### H3 — Zod defaults: const cachedEnsureCategoriesPromise wrong select clause lost
-Mechanism: my edits inadvertently the upsert previously had `create: select. the SectionCategory declares createdAt updatedAt deletedAt dates and there the return shape a Prisma return. No — the the — the types mismatch.
- Predicted: the getSectionCategory returns undefined because category.slug is not because the.

### H4 — CachedAdminListSummary type: lawReportEngagement cached value is assigned as lawReportEngagement is assigned before cache set wrong interface declares shape or the readingMetrics groupBy fails for not as never when the baseSectionWhere material: baseSectionWhere has the the the where-clause readingHistory groupBy. Actually Material: categoryId and deletedAt=null, but the `readingHisotry where readingHistory model actually where clause "material" a relation: {categoryId: readingHistory Material, not possible: category. groupBy prisma the a join by "materialId" with a group by.

### H5 — classifyAdminLibraryWriteError: UNIQUE_CONSTRAINT_VIOLATION is only. Actually not. H5: list call not even for (less likely — frontend fetch call: the Student page query cache dedupe prefetchLibrarySection: "student-law-reports" string queryKey mismatch: `queryKeys.adminLibrary("student-law-reports", filters)` actually in the sidebar new code vs actual query code — no the. Predicted:

## Reproduction Steps
1. Login as student, lawyer student/lawyer/judge
2. Click menu → Library → Law Reports
3. Expected the

## Evidence Log
- [ ] Pre-fix runtime logs collected
- [ ] Post-fix runtime logs collected
- [ ] Comparative analysis completed
