import { PrismaClient } from "@prisma/client";

declare global {
  // Reuse the Prisma client during local reloads to avoid exhausting connections.
  var __helarPrisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__helarPrisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__helarPrisma__ = prisma;
}
