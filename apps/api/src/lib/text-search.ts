const activeDatabaseUrl = process.env.DATABASE_URL ?? "";

function usesMongoRuntime() {
  return activeDatabaseUrl.startsWith("mongodb");
}

// Case-insensitive text containment helper. Works on both PostgreSQL and
// MongoDB. On Postgres we rely on Prisma's native mode:"insensitive" which
// maps to ILIKE-style semantics. On MongoDB we still request insensitive mode
// (modern Prisma + Mongo 4.2+ honour it) and every list-level caller also
// performs a manual in-memory post-filter pass to catch records that the
// raw BSON contains/regex might miss due to collation quirks.
export function containsText(value: string) {
  const filter = {
    contains: value,
    mode: "insensitive" as const
  };

  return filter;
}
