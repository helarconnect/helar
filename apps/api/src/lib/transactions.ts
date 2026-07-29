import type { Prisma } from "@prisma/client";

import { prisma } from "./prisma.js";

function usesMongoRuntime() {
  return (process.env.DATABASE_URL ?? "").startsWith("mongodb");
}

export async function runInTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  if (usesMongoRuntime()) {
    return prisma.$transaction((tx) => operation(tx));
  }

  return prisma.$transaction((tx) => operation(tx));
}

export async function runBatchTransaction<T extends Prisma.PrismaPromise<unknown>[]>(operations: [...T]) {
  return prisma.$transaction(operations);
}
