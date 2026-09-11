import type { Prisma } from "@prisma/client";

import { prisma } from "./prisma.js";

function usesMongoRuntime() {
  return (process.env.DATABASE_URL ?? "").startsWith("mongodb");
}

/*
 * Prisma interactive transaction defaults tuned for the Render + MongoDB Atlas
 * shard-cluster deployment. Prisma 6 defaults are { maxWait: 2000, timeout:
 * 5000 } ms, which are too aggressive for a cold-start Node process plus a
 * multi-hop Atlas SRV+TLS handshake and a join-heavy actor lookup inside an
 * approval tx — we observed exactly 5275 ms → expired tx → P2028 on law
 * report approvals (see admin-notifications.ts runApprovalMutation). The
 * values below still bound runaways (30s is way beyond any reasonable tx)
 * while leaving headroom for cold paths.
 */
const INTERACTIVE_TX_OPTS: { maxWait: number; timeout: number } = {
  maxWait: 10_000,
  timeout: 30_000
};

export async function runInTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  if (usesMongoRuntime()) {
    return prisma.$transaction((tx) => operation(tx), INTERACTIVE_TX_OPTS);
  }

  return prisma.$transaction((tx) => operation(tx), INTERACTIVE_TX_OPTS);
}

/*
 * MongoDB adapter (Prisma 6) exposes ONLY the interactive / callback form of
 * `$transaction` — the `promise[]` batch overload is SQL-only and is rejected
 * at the type level. On Mongo we therefore emulate a batch by running the
 * awaited list sequentially inside a single interactive transaction. The
 * singleton client promises passed by callers still execute inside the same
 * tx boundary and roll back together on throw — the Prisma Mongo driver
 * supports this pattern for the use case of "sequential writes within one
 * interactive tx".
 */
export async function runBatchTransaction<T extends Prisma.PrismaPromise<unknown>[]>(operations: [...T]): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const result = await runInTransaction(async () => {
    const out: unknown[] = [];
    for (const op of operations) {
      out.push(await op);
    }
    return out;
  });
  return result as { [K in keyof T]: Awaited<T[K]> };
}
