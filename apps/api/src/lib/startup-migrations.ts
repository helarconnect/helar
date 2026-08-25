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
  } catch (error) {
    console.error("Startup migrations failed:", error);
  }
}

