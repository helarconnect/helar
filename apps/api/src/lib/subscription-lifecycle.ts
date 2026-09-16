import type { Prisma } from "@prisma/client";

import { prisma } from "./prisma.js";
import {
  sendSubscriptionExpiringSoonEmail,
  sendSubscriptionExpiredEmail,
  type SubscriptionExpiringSoonEmailInput,
  type SubscriptionExpiredEmailInput
} from "./email.js";

type NotificationFlags = Record<string, unknown>;

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

type ExpiringSubscriptionBatch = Awaited<
  ReturnType<typeof prisma.subscription.findMany<{
    include: {
      user: { select: { email: true; fullName: true } };
      plan: { select: { name: true } };
    };
  }>>
>;

type ExpiredSubscriptionBatch = Awaited<
  ReturnType<typeof prisma.subscription.findMany<{
    include: {
      user: { select: { email: true; fullName: true } };
      plan: { select: { name: true } };
    };
  }>>
>;

export function getPublicWebBaseUrl(): string {
  return (
    process.env.APP_PUBLIC_BASE_URL?.trim() ||
    process.env.WEB_PUBLIC_BASE_URL?.trim() ||
    process.env.VITE_APP_BASE_URL?.trim() ||
    "http://localhost:5173"
  );
}

export function getRenewUrl(): string {
  return `${getPublicWebBaseUrl()}/pricing`;
}

export function getDashboardUrl(): string {
  return `${getPublicWebBaseUrl()}/app/dashboard`;
}

function getDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUtc - fromUtc) / msPerDay);
}

function getExpiringBucket(daysRemaining: number): { bucket: string; typedBucket: 7 | 3 | 1 | 0 } | null {
  if (daysRemaining === 0) return { bucket: "expiringToday", typedBucket: 0 };
  if (daysRemaining === 1) return { bucket: "expiringSoon1d", typedBucket: 1 };
  if (daysRemaining === 3) return { bucket: "expiringSoon3d", typedBucket: 3 };
  if (daysRemaining === 7) return { bucket: "expiringSoon7d", typedBucket: 7 };
  return null;
}

function flagForBucket(bucket: string, dateKey: string): string {
  return `${bucket}_${dateKey}`;
}

export type SubscriptionLifecycleCycleResult = {
  expiringEmailsSent: number;
  expiredEmailsSent: number;
  subscriptionsExpired: number;
  renewUrl: string;
  dashboardUrl: string;
};

export async function runSubscriptionLifecycleCycle({
  now
}: {
  now: Date;
}): Promise<SubscriptionLifecycleCycleResult> {
  const dateKey = getDateKey(now);
  const renewUrl = getRenewUrl();
  const dashboardUrl = getDashboardUrl();

  // Start of today (midnight) as lower-bound gte for expiring pipeline —
  // prevents subs that already ended (endsAt < today 00:00) from hitting the
  // 0-day bucket; they will be caught by the expired pipeline instead.
  const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const BATCH_SIZE = 100;
  let expiringEmailsSent = 0;
  let expiredEmailsSent = 0;
  let subscriptionsExpired = 0;

  let cursor: string | undefined;
  while (true) {
    const batch: ExpiringSubscriptionBatch = await prisma.subscription.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      where: {
        status: { in: ["ACTIVE", "TRIALING"] },
        endsAt: { not: null, gte: todayMidnight },
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
      },
      include: {
        user: { select: { email: true, fullName: true } },
        plan: { select: { name: true } }
      },
      orderBy: { id: "asc" }
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const sub of batch) {
      if (!sub.endsAt) continue;

      const daysRemaining = daysBetween(now, sub.endsAt);
      const bucketInfo = getExpiringBucket(daysRemaining);

      if (!bucketInfo) continue;

      const { bucket, typedBucket } = bucketInfo;

      const flags = (sub.notificationFlags ?? {}) as NotificationFlags;
      const flagKey = flagForBucket(bucket, dateKey);
      const lifetimeKey = `${bucket}_sent`;
      if (flags[flagKey] || flags[lifetimeKey]) continue;

      const emailInput: SubscriptionExpiringSoonEmailInput = {
        email: sub.user.email,
        fullName: sub.user.fullName,
        planName: sub.plan.name,
        endsAt: sub.endsAt.toISOString(),
        daysRemaining: typedBucket,
        renewUrl
      };

      try {
        await sendSubscriptionExpiringSoonEmail(emailInput);
        const updatedFlags: NotificationFlags = {
          ...flags,
          [flagKey]: now.toISOString(),
          [lifetimeKey]: now.toISOString()
        };
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { notificationFlags: toJsonValue(updatedFlags) }
        });
        expiringEmailsSent++;
      } catch (err) {
        console.error(
          `Failed to send expiring soon email for subscription ${sub.id}:`,
          err
        );
      }
    }
  }

  cursor = undefined;
  while (true) {
    const batch: ExpiredSubscriptionBatch = await prisma.subscription.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      where: {
        status: "ACTIVE",
        endsAt: { lt: now },
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
      },
      include: {
        user: { select: { email: true, fullName: true } },
        plan: { select: { name: true } }
      },
      orderBy: { id: "asc" }
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const sub of batch) {
      if (!sub.endsAt) continue;

      const flags = (sub.notificationFlags ?? {}) as NotificationFlags;
      const flagKey = flagForBucket("expired", dateKey);
      const lifetimeKey = "expired_sent";
      const alreadyNotified = Boolean(flags[lifetimeKey]);

      if (!alreadyNotified) {
        const emailInput: SubscriptionExpiredEmailInput = {
          email: sub.user.email,
          fullName: sub.user.fullName,
          planName: sub.plan.name,
          endedAt: sub.endsAt.toISOString(),
          renewUrl
        };
        try {
          await sendSubscriptionExpiredEmail(emailInput);
          expiredEmailsSent++;
        } catch (err) {
          console.error(
            `Failed to send expired email for subscription ${sub.id}:`,
            err
          );
        }
      }

      try {
        const updatedFlags: NotificationFlags = {
          ...flags,
          [flagKey]: now.toISOString(),
          [lifetimeKey]: alreadyNotified
            ? (flags[lifetimeKey] as string)
            : now.toISOString(),
          expired: now.toISOString()
        };
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status: "EXPIRED",
            notificationFlags: toJsonValue(updatedFlags)
          }
        });
        subscriptionsExpired++;
      } catch (err) {
        console.error(
          `Failed to transition subscription ${sub.id} to EXPIRED:`,
          err
        );
      }
    }
  }

  console.info(
    JSON.stringify({
      event: "subscription_lifecycle_cycle",
      timestamp: now.toISOString(),
      expiringEmailsSent,
      expiredEmailsSent,
      subscriptionsExpired,
      renewUrl,
      dashboardUrl
    })
  );

  return {
    expiringEmailsSent,
    expiredEmailsSent,
    subscriptionsExpired,
    renewUrl,
    dashboardUrl
  };
}
