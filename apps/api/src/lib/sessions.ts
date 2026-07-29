import type { Prisma } from "@prisma/client";

export function isRefreshSessionActive(
  session: {
    createdAt: Date;
    deletedAt: Date | null;
    expiresAt: Date;
    user?: {
      sessionsRevokedAt?: Date | null;
    } | null;
  },
  now = new Date()
) {
  const revokedAt = session.user?.sessionsRevokedAt ?? null;

  return (
    !session.deletedAt &&
    session.expiresAt > now &&
    !(revokedAt && session.createdAt <= revokedAt)
  );
}

export async function revokeUserSessions(tx: Prisma.TransactionClient, userId: string) {
  const revokedAt = new Date();

  await tx.user.update({
    where: {
      id: userId
    },
    data: {
      sessionsRevokedAt: revokedAt
    } as Prisma.UserUpdateInput
  });
}
