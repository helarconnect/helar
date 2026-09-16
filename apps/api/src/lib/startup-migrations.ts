import { prisma } from "./prisma.js";

let hasRunStartupMigrations = false;

function usesMongoRuntime() {
  return (process.env.DATABASE_URL ?? "").startsWith("mongodb");
}

async function normalizeSubjectSummaryModuleTypes() {
  await prisma.$runCommandRaw({
    update: "SubjectSummaryEntry",
    updates: [
      {
        q: { moduleType: "FACULTY" },
        u: { $set: { moduleType: "TEXTBOOK" } },
        multi: true
      },
      {
        q: { moduleType: "NLS" },
        u: { $set: { moduleType: "HANDBOOK" } },
        multi: true
      },
      {
        q: { moduleType: { $exists: false } },
        u: { $set: { moduleType: "TEXTBOOK" } },
        multi: true
      }
    ]
  });

  await prisma.$runCommandRaw({
    update: "SubjectSummarySerialCounter",
    updates: [
      {
        q: { moduleType: "FACULTY" },
        u: { $set: { moduleType: "TEXTBOOK" } },
        multi: true
      },
      {
        q: { moduleType: "NLS" },
        u: { $set: { moduleType: "HANDBOOK" } },
        multi: true
      }
    ]
  });
}

async function backfillSubscriptionNotificationFlags() {
  const BATCH_SIZE = 500;
  let processed = 0;
  let cursor: string | undefined;

  // Cursor-paginated batches: find subs missing notificationFlags, then
  // updateMany by ID per batch. Avoids a single huge multi-update that could
  // time out or lock the collection on larger datasets.
  while (true) {
    const batch = await prisma.subscription.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      where: {
        OR: [
          { notificationFlags: { equals: null as never } },
          { notificationFlags: { isSet: false } }
        ]
      },
      select: { id: true },
      orderBy: { id: "asc" }
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    const ids = batch.map((row) => row.id);
    const updateResult = await prisma.subscription.updateMany({
      where: { id: { in: ids } },
      data: { notificationFlags: {} as never }
    });

    processed += updateResult.count;
  }

  if (processed > 0) {
    console.info(`Backfilled notificationFlags on ${processed} Subscription rows.`);
  }
}

export async function runStartupMigrations() {
  if (hasRunStartupMigrations) {
    return;
  }

  hasRunStartupMigrations = true;

  if (!usesMongoRuntime()) {
    return;
  }

  try {
    await normalizeSubjectSummaryModuleTypes();
    await backfillSubscriptionNotificationFlags();
  } catch (error) {
    console.error("Startup migrations failed:", error);
  }
}

