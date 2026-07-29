import { PaymentStatus, SubscriptionInterval, SubscriptionStatus, type Prisma } from "@prisma/client";
import { z } from "zod";

import { sendSubscriptionActivationEmails } from "./lib/email.js";
import { prisma } from "./lib/prisma.js";
import { runInTransaction } from "./lib/transactions.js";

const notDeletedUserWhere: Prisma.UserWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

const notDeletedPlanWhere: Prisma.SubscriptionPlanWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

const notDeletedSubscriptionWhere: Prisma.SubscriptionWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

const notDeletedPaymentWhere: Prisma.PaymentWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

const notDeletedTransactionWhere: Prisma.TransactionWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

const subscriptionCheckoutSchema = z
  .object({
    planCode: z.enum(["monthly", "six_months", "annual"]),
    returnUrl: z.string().trim().url().max(500)
  })
  .strict();

const subscriptionVerifySchema = z
  .object({
    reference: z.string().trim().min(8).max(120)
  })
  .strict();

const adminManualActivationSchema = z
  .object({
    note: z.string().trim().max(500).optional(),
    planCode: z.enum(["monthly", "six_months", "annual"]),
    userId: z.string().trim().min(1)
  })
  .strict();

const managedPlans = [
  {
    code: "monthly",
    currency: "NGN",
    description: "Flexible monthly premium access for learners who want the lowest entry point without a long commitment.",
    featureHighlights: [
      "Full premium library and subject summary access",
      "Helar Connect participation and study tools",
      "Use your subscription on up to 3 devices",
      "NGN 2,000 monthly access"
    ],
    interval: SubscriptionInterval.MONTHLY,
    label: null,
    name: "Monthly Subscription",
    priceMinor: 200_000
  },
  {
    code: "six_months",
    currency: "NGN",
    description: "Six months of premium legal study access with a NGN 1,000 discount already applied for longer-term savings.",
    featureHighlights: [
      "Full premium library and subject summary access",
      "Helar Connect participation and study tools",
      "Use your subscription on up to 3 devices",
      "NGN 1,000 discount applied for the 6-month package"
    ],
    interval: SubscriptionInterval.MONTHLY,
    label: "Save NGN 1,000",
    name: "6 Months Subscription",
    priceMinor: 1_100_000
  },
  {
    code: "annual",
    currency: "NGN",
    description: "One full year of premium access with a NGN 2,000 discount for learners who want uninterrupted value.",
    featureHighlights: [
      "Everything in the 6-month subscription",
      "Use your subscription on up to 3 devices",
      "NGN 2,000 discount applied for the 1-year package"
    ],
    interval: SubscriptionInterval.ANNUAL,
    label: "Save NGN 2,000",
    name: "One Year Subscription",
    priceMinor: 2_200_000
  }
] as const;

const paystackBaseUrl = "https://api.paystack.co";

type ManagedPlanCode = (typeof managedPlans)[number]["code"];

type PaystackInitializeResponse = {
  status: boolean;
  message: string;
  data?: {
    access_code: string;
    authorization_url: string;
    reference: string;
  };
};

type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data?: {
    amount: number;
    channel: string | null;
    created_at?: string;
    currency: string;
    customer?: {
      email?: string | null;
    } | null;
    domain?: string;
    gateway_response?: string | null;
    id: number;
    metadata?: string | Record<string, unknown> | null;
    paid_at?: string | null;
    reference: string;
    status: string;
  };
};

export class BillingConfigurationError extends Error {}

export class BillingOperationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function getManagedPlan(planCode: ManagedPlanCode) {
  const plan = managedPlans.find((item) => item.code === planCode);

  if (!plan) {
    throw new BillingOperationError("The selected subscription plan is not available.", 400);
  }

  return plan;
}

function getPaystackSecretKey() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new BillingConfigurationError("Paystack is not configured yet.");
  }

  return secretKey;
}

function createReference(planCode: ManagedPlanCode) {
  return `helar.${planCode}.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
}

function createManualActivationReference(planCode: ManagedPlanCode) {
  return `helar.manual.${planCode}.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency
  }).format(amountMinor / 100);
}

function isPaystackTestMode() {
  return (process.env.PAYSTACK_SECRET_KEY ?? "").startsWith("sk_test_");
}

function isLikelyPaystackInvalidEmailDomain(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";

  if (!domain) {
    return true;
  }

  return (
    domain === "localhost" ||
    domain.endsWith(".localhost") ||
    domain.endsWith(".local") ||
    domain.endsWith(".test") ||
    domain.endsWith(".invalid")
  );
}

function buildPaystackCustomerEmail(user: { email: string; id: string }) {
  if (!isPaystackTestMode() || !isLikelyPaystackInvalidEmailDomain(user.email)) {
    return user.email;
  }

  const safeUserId = user.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24).toLowerCase() || "helaruser";
  return `paystack-test+${safeUserId}@example.com`;
}

function calculateSubscriptionEndDate(planCode: ManagedPlanCode, interval: SubscriptionInterval, startsAt: Date) {
  const endsAt = new Date(startsAt);

  if (planCode === "monthly") {
    endsAt.setMonth(endsAt.getMonth() + 1);
    return endsAt;
  }

  if (planCode === "six_months") {
    endsAt.setMonth(endsAt.getMonth() + 6);
    return endsAt;
  }

  if (planCode === "annual" || interval === SubscriptionInterval.ANNUAL) {
    endsAt.setFullYear(endsAt.getFullYear() + 1);
    return endsAt;
  }

  throw new BillingOperationError("Unsupported subscription interval.", 400);
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function callPaystack<T>(path: string, init?: RequestInit) {
  const secretKey = getPaystackSecretKey();
  const response = await fetch(`${paystackBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  let data = {} as T & { message?: string };

  if (typeof response.text === "function") {
    const rawText = await response.text();
    data = rawText ? (JSON.parse(rawText) as T & { message?: string }) : ({} as T & { message?: string });
  } else if (typeof response.json === "function") {
    data = (await response.json()) as T & { message?: string };
  }

  if (!response.ok) {
    const providerMessage =
      typeof data.message === "string" && data.message.trim()
        ? data.message
        : `Paystack request failed with status ${response.status}.`;

    console.error("Paystack request failed", {
      body: data,
      path,
      status: response.status
    });

    throw new BillingOperationError(providerMessage, 502);
  }

  return data;
}

async function ensureManagedPlans() {
  return Promise.all(
    managedPlans.map((plan) =>
      prisma.subscriptionPlan.upsert({
        where: {
          code: plan.code
        },
        update: {
          currency: plan.currency,
          deletedAt: null,
          interval: plan.interval,
          name: plan.name,
          priceMinor: plan.priceMinor
        },
        create: {
          code: plan.code,
          currency: plan.currency,
          deletedAt: null,
          interval: plan.interval,
          name: plan.name,
          priceMinor: plan.priceMinor
        }
      })
    )
  );
}

function serializePlan(plan: {
  code: string;
  currency: string;
  interval: SubscriptionInterval;
  name: string;
  priceMinor: number;
}) {
  const planMeta = getManagedPlan(plan.code as ManagedPlanCode);

  return {
    code: plan.code,
    currency: plan.currency,
    description: planMeta.description,
    featureHighlights: planMeta.featureHighlights,
    formattedPrice: formatMoney(plan.priceMinor, plan.currency),
    interval: plan.interval,
    label: planMeta.label,
    name: plan.name,
    priceMinor: plan.priceMinor
  };
}

function createPaymentSummary(payment: {
  amountMinor: number;
  createdAt: Date;
  currency: string;
  id: string;
  provider: string;
  status: PaymentStatus;
  subscription: null | {
    plan: {
      code: string;
      currency: string;
      interval: SubscriptionInterval;
      name: string;
      priceMinor: number;
    };
  };
  transactions: Array<{
    reference: string;
  }>;
}) {
  return {
    amountMinor: payment.amountMinor,
    createdAt: payment.createdAt.toISOString(),
    currency: payment.currency,
    formattedAmount: formatMoney(payment.amountMinor, payment.currency),
    id: payment.id,
    plan: payment.subscription ? serializePlan(payment.subscription.plan) : null,
    provider: payment.provider,
    reference: payment.transactions[0]?.reference ?? null,
    status: payment.status
  };
}

function deriveSubscriptionStatus(subscription: {
  endsAt: Date | null;
  status: SubscriptionStatus;
} | null) {
  if (!subscription) {
    return "inactive" as const;
  }

  const expiryReminder = buildExpiryReminder(subscription.endsAt);

  if (subscription.status === SubscriptionStatus.ACTIVE && !expiryReminder.isExpired) {
    return "active" as const;
  }

  if (subscription.status === SubscriptionStatus.CANCELED) {
    return "canceled" as const;
  }

  if (subscription.status === SubscriptionStatus.PAST_DUE) {
    return "past_due" as const;
  }

  if (subscription.status === SubscriptionStatus.EXPIRED || expiryReminder.isExpired) {
    return "expired" as const;
  }

  return "inactive" as const;
}

function buildExpiryReminder(endsAt: Date | null, now = new Date()) {
  if (!endsAt) {
    return {
      daysUntilExpiry: null,
      expiryReminderMessage: null,
      isExpired: false,
      isExpiringSoon: false,
      shouldShowExpiryReminder: false
    };
  }

  const millisecondsRemaining = endsAt.getTime() - now.getTime();
  const wholeDaysRemaining = Math.ceil(millisecondsRemaining / (1000 * 60 * 60 * 24));
  const isExpired = millisecondsRemaining < 0;
  const isExpiringSoon = !isExpired && wholeDaysRemaining <= 7;

  let expiryReminderMessage: string | null = null;

  if (isExpired) {
    expiryReminderMessage = "Your subscription has expired. Renew now to restore uninterrupted access.";
  } else if (wholeDaysRemaining <= 0) {
    expiryReminderMessage = "Your subscription expires today. Renew now to avoid losing access.";
  } else if (wholeDaysRemaining === 1) {
    expiryReminderMessage = "Your subscription expires in 1 day. Renew now to avoid losing access.";
  } else if (isExpiringSoon) {
    expiryReminderMessage = `Your subscription expires in ${wholeDaysRemaining} days. Renew early to avoid interruption.`;
  }

  return {
    daysUntilExpiry: isExpired ? 0 : Math.max(wholeDaysRemaining, 0),
    expiryReminderMessage,
    isExpired,
    isExpiringSoon,
    shouldShowExpiryReminder: isExpiringSoon || isExpired
  };
}

function createSubscriptionSummary(subscription: {
  autoRenew: boolean;
  createdAt: Date;
  endsAt: Date | null;
  id: string;
  plan: {
    code: string;
    currency: string;
    interval: SubscriptionInterval;
    name: string;
    priceMinor: number;
  };
  startsAt: Date;
  status: SubscriptionStatus;
}) {
  const expiryReminder = buildExpiryReminder(subscription.endsAt);

  return {
    autoRenew: subscription.autoRenew,
    createdAt: subscription.createdAt.toISOString(),
    daysUntilExpiry: expiryReminder.daysUntilExpiry,
    endsAt: subscription.endsAt?.toISOString() ?? null,
    expiryReminderMessage: expiryReminder.expiryReminderMessage,
    id: subscription.id,
    isExpired: expiryReminder.isExpired,
    isExpiringSoon: expiryReminder.isExpiringSoon,
    plan: serializePlan(subscription.plan),
    shouldShowExpiryReminder: expiryReminder.shouldShowExpiryReminder,
    startsAt: subscription.startsAt.toISOString(),
    status: subscription.status
  };
}

export async function listPublicSubscriptionPlans() {
  const plans = await ensureManagedPlans();
  return plans
    .filter((plan) => plan.deletedAt === null)
    .sort((left, right) => left.priceMinor - right.priceMinor)
    .map((plan) => serializePlan(plan));
}

export function parseSubscriptionCheckoutInput(input: unknown) {
  return subscriptionCheckoutSchema.parse(input);
}

export function parseSubscriptionVerifyInput(input: unknown) {
  return subscriptionVerifySchema.parse(input);
}

export function parseAdminManualActivationInput(input: unknown) {
  return adminManualActivationSchema.parse(input);
}

export async function getUserSubscriptionSnapshot(userId: string) {
  await ensureManagedPlans();

  const [activeSubscription, recentPayments] = await Promise.all([
    prisma.subscription.findFirst({
      where: {
        ...notDeletedSubscriptionWhere,
        status: SubscriptionStatus.ACTIVE,
        userId
      },
      orderBy: {
        createdAt: "desc"
      },
      include: {
        plan: true
      }
    }),
    prisma.payment.findMany({
      where: {
        ...notDeletedPaymentWhere,
        userId
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 6,
      include: {
        subscription: {
          include: {
            plan: true
          }
        },
        transactions: {
          where: notDeletedTransactionWhere,
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      }
    })
  ]);

  return {
    activeSubscription: activeSubscription ? createSubscriptionSummary(activeSubscription) : null,
    recentPayments: recentPayments.map((payment) => createPaymentSummary(payment))
  };
}

export async function getAdminBillingSnapshot() {
  await ensureManagedPlans();

  const [users, recentPayments, pendingPayments, failedPayments] = await Promise.all([
    prisma.user.findMany({
      where: notDeletedUserWhere,
      orderBy: {
        createdAt: "desc"
      },
      include: {
        roles: {
          include: {
            role: true
          }
        },
        subscriptions: {
          where: notDeletedSubscriptionWhere,
          orderBy: {
            createdAt: "desc"
          },
          include: {
            plan: true
          }
        },
        payments: {
          where: notDeletedPaymentWhere,
          orderBy: {
            createdAt: "desc"
          },
          take: 1,
          include: {
            subscription: {
              include: {
                plan: true
              }
            },
            transactions: {
              where: notDeletedTransactionWhere,
              orderBy: {
                createdAt: "desc"
              },
              take: 1
            }
          }
        }
      }
    }),
    prisma.payment.findMany({
      where: notDeletedPaymentWhere,
      orderBy: {
        createdAt: "desc"
      },
      include: {
        user: {
          select: {
            email: true,
            fullName: true,
            id: true
          }
        },
        subscription: {
          include: {
            plan: true
          }
        },
        transactions: {
          where: notDeletedTransactionWhere,
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      }
    }),
    prisma.payment.count({
      where: {
        ...notDeletedPaymentWhere,
        status: PaymentStatus.PENDING
      }
    }),
    prisma.payment.count({
      where: {
        ...notDeletedPaymentWhere,
        status: PaymentStatus.FAILED
      }
    })
  ]);

  const subscriberRows = users.map((user) => {
    const latestSubscription = user.subscriptions[0] ?? null;
    const activeSubscription =
      user.subscriptions.find(
        (subscription) =>
          subscription.status === SubscriptionStatus.ACTIVE && !buildExpiryReminder(subscription.endsAt).isExpired
      ) ?? null;
    const effectiveSubscription = activeSubscription ?? latestSubscription;
    const latestPayment = user.payments[0] ?? null;

    return {
      activeSubscription: activeSubscription ? createSubscriptionSummary(activeSubscription) : null,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      fullName: user.fullName,
      id: user.id,
      latestPayment: latestPayment ? createPaymentSummary(latestPayment) : null,
      latestSubscription: effectiveSubscription ? createSubscriptionSummary(effectiveSubscription) : null,
      phoneNumber: user.phoneNumber ?? null,
      registeredAt: user.createdAt.toISOString(),
      roleCodes: user.roles.map((item) => item.role.code),
      subscriptionPlanCode: effectiveSubscription?.plan.code ?? null,
      subscriptionInterval: effectiveSubscription?.plan.interval ?? null,
      subscriptionStatus: deriveSubscriptionStatus(effectiveSubscription),
      userStatus: user.status
    };
  });

  return {
    recentPayments: recentPayments.map((payment) => ({
      ...createPaymentSummary(payment),
      subscriptionStatus: deriveSubscriptionStatus(payment.subscription),
      user: payment.user
    })),
    summary: {
      activeSubscriptions: subscriberRows.filter((row) => row.subscriptionStatus === "active").length,
      annualSubscribers: subscriberRows.filter((row) => row.subscriptionPlanCode === "annual").length,
      failedPayments,
      monthlySubscribers: subscriberRows.filter((row) => row.subscriptionPlanCode === "monthly").length,
      pendingPayments,
      sixMonthSubscribers: subscriberRows.filter((row) => row.subscriptionPlanCode === "six_months").length,
      registeredUsers: subscriberRows.length
    },
    users: subscriberRows
  };
}

export async function activateSubscriptionForUserByAdmin(
  actorUserId: string,
  input: z.infer<typeof adminManualActivationSchema>
) {
  await ensureManagedPlans();

  const parsedInput = parseAdminManualActivationInput(input);
  const planRecord = await prisma.subscriptionPlan.findFirst({
    where: {
      code: parsedInput.planCode,
      ...notDeletedPlanWhere
    }
  });

  if (!planRecord) {
    throw new BillingOperationError("The selected subscription plan is not available.", 404);
  }

  const user = await prisma.user.findFirst({
    where: {
      ...notDeletedUserWhere,
      id: parsedInput.userId
    },
    select: {
      email: true,
      fullName: true,
      id: true
    }
  });

  if (!user) {
    throw new BillingOperationError("The selected user could not be found.", 404);
  }

  const activatedAt = new Date();
  const reference = createManualActivationReference(parsedInput.planCode);

  const result = await runInTransaction(async (tx) => {
    await tx.subscription.updateMany({
      where: {
        ...notDeletedSubscriptionWhere,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.TRIALING]
        },
        userId: user.id
      },
      data: {
        endsAt: activatedAt,
        status: SubscriptionStatus.EXPIRED
      }
    });

    const subscription = await tx.subscription.create({
      data: {
        autoRenew: false,
        deletedAt: null,
        endsAt: calculateSubscriptionEndDate(parsedInput.planCode, planRecord.interval, activatedAt),
        planId: planRecord.id,
        startsAt: activatedAt,
        status: SubscriptionStatus.ACTIVE,
        userId: user.id
      },
      include: {
        plan: true
      }
    });

    const payment = await tx.payment.create({
      data: {
        amountMinor: planRecord.priceMinor,
        currency: planRecord.currency,
        deletedAt: null,
        provider: "manual_admin_activation",
        status: PaymentStatus.SUCCEEDED,
        subscriptionId: subscription.id,
        userId: user.id
      }
    });

    await tx.transaction.create({
      data: {
        deletedAt: null,
        paymentId: payment.id,
        rawPayload: toJsonValue({
          actorUserId,
          kind: "manual_admin_activation",
          note: parsedInput.note ?? null,
          planCode: parsedInput.planCode
        }),
        reference
      }
    });

    return {
      payment,
      subscription
    };
  });

  try {
    await sendSubscriptionActivationEmails({
      amountMinor: result.payment.amountMinor,
      currency: result.payment.currency,
      email: user.email,
      fullName: user.fullName,
      planName: result.subscription.plan.name,
      reference,
      startsAt: result.subscription.startsAt.toISOString(),
      endsAt: result.subscription.endsAt?.toISOString() ?? null
    });
  } catch (error) {
    console.error("Failed to send manual subscription activation emails:", error);
  }

  return {
    subscription: createSubscriptionSummary(result.subscription),
    user: {
      email: user.email,
      fullName: user.fullName,
      id: user.id
    }
  };
}

export async function initializeSubscriptionCheckout(userId: string, input: z.infer<typeof subscriptionCheckoutSchema>) {
  await ensureManagedPlans();

  const parsedInput = parseSubscriptionCheckoutInput(input);
  const plan = getManagedPlan(parsedInput.planCode);
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      deletedAt: true,
      email: true,
      fullName: true,
      id: true
    }
  });

  if (!user || user.deletedAt) {
    throw new BillingOperationError("Could not find the account for this checkout.", 404);
  }

  const planRecord = await prisma.subscriptionPlan.findFirst({
    where: {
      code: plan.code,
      ...notDeletedPlanWhere
    }
  });

  if (!planRecord) {
    throw new BillingOperationError("The selected subscription plan is not available.", 404);
  }

  const checkoutEmail = buildPaystackCustomerEmail(user);
  const reference = createReference(plan.code);
  const payment = await prisma.payment.create({
    data: {
      amountMinor: planRecord.priceMinor,
      currency: planRecord.currency,
      deletedAt: null,
      provider: "paystack",
      status: PaymentStatus.PENDING,
      userId: user.id
    }
  });

  await prisma.transaction.create({
    data: {
      deletedAt: null,
      paymentId: payment.id,
      rawPayload: toJsonValue({
        checkoutEmail,
        kind: "paystack_initialize_request",
        originalUserEmail: user.email,
        planCode: plan.code,
        returnUrl: parsedInput.returnUrl
      }),
      reference
    }
  });

  try {
    const paystackResponse = await callPaystack<PaystackInitializeResponse>("/transaction/initialize", {
      body: JSON.stringify({
        amount: String(planRecord.priceMinor),
        callback_url: parsedInput.returnUrl,
        currency: planRecord.currency,
        email: checkoutEmail,
        metadata: JSON.stringify({
          checkoutEmail,
          fullName: user.fullName,
          originalUserEmail: user.email,
          planCode: plan.code,
          planInterval: planRecord.interval,
          planName: planRecord.name,
          userId: user.id
        }),
        reference
      }),
      method: "POST"
    });

    if (!paystackResponse.status || !paystackResponse.data?.authorization_url) {
      throw new BillingOperationError("Paystack could not initialize the subscription checkout.", 502);
    }

    await prisma.transaction.update({
      where: {
        reference
      },
      data: {
        rawPayload: toJsonValue({
          kind: "paystack_initialize",
          request: {
            checkoutEmail,
            originalUserEmail: user.email,
            planCode: plan.code,
            returnUrl: parsedInput.returnUrl
          },
          response: paystackResponse
        })
      }
    });

    return {
      authorizationUrl: paystackResponse.data.authorization_url,
      plan: serializePlan(planRecord),
      reference
    };
  } catch (error) {
    await prisma.payment.update({
      where: {
        id: payment.id
      },
      data: {
        status: PaymentStatus.FAILED
      }
    });

    throw error;
  }
}

export async function verifySubscriptionPayment(userId: string, reference: string) {
  await ensureManagedPlans();

  const transactionRecord = await prisma.transaction.findUnique({
    where: {
      reference
    },
    include: {
      payment: {
        include: {
          subscription: {
            include: {
              plan: true
            }
          },
          user: {
            select: {
              email: true,
              fullName: true,
              id: true
            }
          }
        }
      }
    }
  });

  if (!transactionRecord || transactionRecord.deletedAt || transactionRecord.payment.deletedAt) {
    throw new BillingOperationError("Could not find the payment reference to verify.", 404);
  }

  if (transactionRecord.payment.userId !== userId) {
    throw new BillingOperationError("You cannot verify another user's payment.", 403);
  }

  if (
    transactionRecord.payment.status === PaymentStatus.SUCCEEDED &&
    transactionRecord.payment.subscription &&
    !transactionRecord.payment.subscription.deletedAt
  ) {
    return {
      payment: createPaymentSummary({
        ...transactionRecord.payment,
        subscription: transactionRecord.payment.subscription
          ? {
              plan: transactionRecord.payment.subscription.plan
            }
          : null,
        transactions: [{ reference: transactionRecord.reference }]
      }),
      snapshot: await getUserSubscriptionSnapshot(userId),
      subscription: createSubscriptionSummary(transactionRecord.payment.subscription)
    };
  }

  const paystackResponse = await callPaystack<PaystackVerifyResponse>(`/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET"
  });

  if (!paystackResponse.status || !paystackResponse.data) {
    throw new BillingOperationError("Paystack could not verify this payment right now.", 502);
  }

  const verification = paystackResponse.data;
  const storedPayload =
    transactionRecord.rawPayload && typeof transactionRecord.rawPayload === "object"
      ? (transactionRecord.rawPayload as {
          checkoutEmail?: string;
          originalUserEmail?: string;
          request?: {
            checkoutEmail?: string;
            originalUserEmail?: string;
            planCode?: string;
          };
          planCode?: string;
        })
      : null;
  const expectedCheckoutEmail =
    storedPayload?.request?.checkoutEmail ?? storedPayload?.checkoutEmail ?? transactionRecord.payment.user.email;

  if (verification.reference !== reference) {
    throw new BillingOperationError("The verified payment reference does not match the checkout request.", 409);
  }

  if (verification.customer?.email && verification.customer.email !== expectedCheckoutEmail) {
    throw new BillingOperationError("The verified payment email does not match the signed-in user.", 409);
  }

  if (verification.status !== "success") {
    await prisma.payment.update({
      where: {
        id: transactionRecord.paymentId
      },
      data: {
        status: PaymentStatus.FAILED
      }
    });

    throw new BillingOperationError(
      verification.gateway_response || "The payment was not completed successfully.",
      409
    );
  }

  if (
    verification.amount !== transactionRecord.payment.amountMinor ||
    verification.currency !== transactionRecord.payment.currency
  ) {
    await prisma.payment.update({
      where: {
        id: transactionRecord.paymentId
      },
      data: {
        status: PaymentStatus.FAILED
      }
    });

    throw new BillingOperationError("The verified Paystack amount did not match the expected subscription amount.", 409);
  }

  const completedAt = verification.paid_at ? new Date(verification.paid_at) : new Date();

  const finalized = await runInTransaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: {
        id: transactionRecord.paymentId
      }
    });

    if (!payment || payment.deletedAt) {
      throw new BillingOperationError("The payment record is no longer available.", 404);
    }

    if (payment.status === PaymentStatus.SUCCEEDED && payment.subscriptionId) {
      const existingSubscription = await tx.subscription.findUnique({
        where: {
          id: payment.subscriptionId
        },
        include: {
          plan: true
        }
      });

      if (!existingSubscription || existingSubscription.deletedAt) {
        throw new BillingOperationError("The subscription record for this payment is missing.", 404);
      }

      return {
        payment: {
          ...payment,
          createdAt: payment.createdAt,
          subscription: {
            plan: existingSubscription.plan
          },
          transactions: [{ reference }]
        },
        subscription: existingSubscription
      };
    }

    const planCode = storedPayload?.request?.planCode ?? storedPayload?.planCode ?? null;

    if (planCode !== "monthly" && planCode !== "annual") {
      throw new BillingOperationError("The checkout plan could not be resolved for verification.", 409);
    }

    const planRecord = await tx.subscriptionPlan.findFirst({
      where: {
        code: planCode,
        deletedAt: null
      }
    });

    if (!planRecord) {
      throw new BillingOperationError("The subscription plan for this payment is missing.", 404);
    }

    await tx.subscription.updateMany({
      where: {
        deletedAt: null,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.TRIALING]
        },
        userId
      },
      data: {
        endsAt: completedAt,
        status: SubscriptionStatus.EXPIRED
      }
    });

    const subscription = await tx.subscription.create({
      data: {
        autoRenew: false,
        deletedAt: null,
        endsAt: calculateSubscriptionEndDate(planRecord.code as ManagedPlanCode, planRecord.interval, completedAt),
        planId: planRecord.id,
        startsAt: completedAt,
        status: SubscriptionStatus.ACTIVE,
        userId
      },
      include: {
        plan: true
      }
    });

    const updatedPayment = await tx.payment.update({
      where: {
        id: payment.id
      },
      data: {
        status: PaymentStatus.SUCCEEDED,
        subscriptionId: subscription.id
      }
    });

    await tx.transaction.update({
      where: {
        id: transactionRecord.id
      },
      data: {
        rawPayload: toJsonValue({
          kind: "paystack_verify",
          response: paystackResponse
        })
      }
    });

    return {
      payment: {
        ...updatedPayment,
        subscription: {
          plan: subscription.plan
        },
        transactions: [{ reference }]
      },
      subscription
    };
  });

  const result = {
    payment: createPaymentSummary(finalized.payment),
    snapshot: await getUserSubscriptionSnapshot(userId),
    subscription: createSubscriptionSummary(finalized.subscription)
  };

  try {
    await sendSubscriptionActivationEmails({
      amountMinor: finalized.payment.amountMinor,
      currency: finalized.payment.currency,
      email: transactionRecord.payment.user.email,
      fullName: transactionRecord.payment.user.fullName,
      planName: finalized.subscription.plan.name,
      reference,
      startsAt: finalized.subscription.startsAt.toISOString(),
      endsAt: finalized.subscription.endsAt?.toISOString() ?? null
    });
  } catch (error) {
    console.error("Failed to send subscription activation emails:", error);
  }

  return result;
}
