const activeDatabaseUrl = process.env.DATABASE_URL ?? "";

function usesMongoRuntime() {
  return activeDatabaseUrl.startsWith("mongodb");
}

export function containsText(value: string) {
  const filter = {
    contains: value
  };

  // Prisma's string filter capabilities differ across providers, so this helper
  // keeps the current PostgreSQL behavior while giving the Mongo cutover a single
  // place to adjust search semantics later.
  return usesMongoRuntime() ? filter : { ...filter, mode: "insensitive" as const };
}
