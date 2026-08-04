import { z } from "zod";
import bcrypt from "bcryptjs";

import { sendAdminUserProvisioningEmail } from "./lib/email.js";
import { prisma } from "./lib/prisma.js";
import { revokeUserSessions } from "./lib/sessions.js";
import { containsText } from "./lib/text-search.js";
import { runInTransaction } from "./lib/transactions.js";

type UserWhereInput = NonNullable<NonNullable<Parameters<typeof prisma.user.findMany>[0]>["where"]>;

const adminUserFiltersSchema = z.object({
  search: z.string().trim().max(120).optional().default(""),
  role: z.string().trim().max(80).optional().default("all"),
  status: z.enum(["all", "ACTIVE", "PENDING", "SUSPENDED"]).optional().default("all"),
  registeredFrom: z.string().trim().optional(),
  registeredTo: z.string().trim().optional(),
  sortBy: z.enum(["createdAt", "fullName", "email", "status"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(12)
});

const adminUserStatusSchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED"])
});

const adminUserRolesSchema = z.object({
  roleCodes: z.array(z.string().trim().min(1)).min(1).max(20)
});

const adminUserProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phoneNumber: z.string().trim().regex(/^\+?[0-9\s\-()]{7,20}$/).optional().or(z.literal("")),
  addressLine1: z.string().trim().max(120).optional().or(z.literal("")),
  addressLine2: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  postalCode: z.string().trim().max(20).optional().or(z.literal("")),
  country: z.string().trim().max(60).optional().or(z.literal(""))
});

const adminCreateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(120),
  roleCodes: z.array(z.string().trim().min(1)).min(1).max(20),
  phoneNumber: z.string().trim().regex(/^\+?[0-9\s\-()]{7,20}$/).optional().or(z.literal("")),
  addressLine1: z.string().trim().max(120).optional().or(z.literal("")),
  addressLine2: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  postalCode: z.string().trim().max(20).optional().or(z.literal("")),
  country: z.string().trim().max(60).optional().or(z.literal(""))
});

const adminUserPasswordSchema = z.object({
  password: z.string().trim().min(8).max(120)
});

const adminUserDeviceLimitSchema = z.object({
  deviceLimitOverride: z.union([z.coerce.number().int().min(1).max(20), z.null()])
});

const adminUserMonthlyRegistrationsSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional()
});

const adminManagedRoles = [
  { code: "super_admin", name: "Super Admin" },
  { code: "content_admin", name: "Content Admin" },
  { code: "judge", name: "Judge" },
  { code: "student", name: "Students" },
  { code: "lawyer", name: "Lawyers" }
] as const;

const activeDatabaseUrl = process.env.DATABASE_URL ?? "";
const usesMongoRuntime = activeDatabaseUrl.startsWith("mongodb");

export type AdminUserFilters = z.infer<typeof adminUserFiltersSchema>;
export type AdminUserStatusInput = z.infer<typeof adminUserStatusSchema>;
export type AdminUserRolesInput = z.infer<typeof adminUserRolesSchema>;
export type AdminUserProfileInput = z.infer<typeof adminUserProfileSchema>;
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUserPasswordInput = z.infer<typeof adminUserPasswordSchema>;
export type AdminUserDeviceLimitInput = z.infer<typeof adminUserDeviceLimitSchema>;
export type AdminUserMonthlyRegistrationsQuery = z.infer<typeof adminUserMonthlyRegistrationsSchema>;

type QueryValue = string | string[] | undefined;

function readQueryValue(value: QueryValue) {
  return Array.isArray(value) ? value[0] : value;
}

function toTitleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function createDate(value?: string, endOfDay = false) {
  if (!value) {
    return undefined;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return undefined;
  }

  if (endOfDay) {
    parsedDate.setHours(23, 59, 59, 999);
  } else {
    parsedDate.setHours(0, 0, 0, 0);
  }

  return parsedDate;
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMoney(amountMinor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format(amountMinor / 100);
}

function formatPercentageChange(currentValue: number, previousValue: number) {
  if (previousValue === 0) {
    return currentValue === 0 ? "No change from the previous period" : "New activity compared with the previous period";
  }

  const percentageChange = ((currentValue - previousValue) / previousValue) * 100;
  const roundedChange = Math.abs(percentageChange).toFixed(1);

  if (percentageChange === 0) {
    return "No change from the previous period";
  }

  return `${percentageChange > 0 ? "+" : "-"}${roundedChange}% versus the previous period`;
}

function createRegistrationWindow(filters: Pick<AdminUserFilters, "registeredFrom" | "registeredTo">) {
  const today = new Date();
  const rangeEnd = createDate(filters.registeredTo, true) ?? new Date(today);
  const rangeStart =
    createDate(filters.registeredFrom) ??
    new Date(rangeEnd.getTime() - 1000 * 60 * 60 * 24 * 29);

  if (rangeStart > rangeEnd) {
    return {
      start: new Date(rangeEnd.getTime() - 1000 * 60 * 60 * 24 * 29),
      end: rangeEnd
    };
  }

  return {
    start: rangeStart,
    end: rangeEnd
  };
}

function createBaseUserWhere(filters: AdminUserFilters): UserWhereInput {
  const registeredFrom = createDate(filters.registeredFrom);
  const registeredTo = createDate(filters.registeredTo, true);
  const notDeletedWhere: UserWhereInput = usesMongoRuntime
    ? { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }
    : { deletedAt: null };
  const notDeletedUserRoleWhere = usesMongoRuntime
    ? { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }
    : { deletedAt: null };

  return {
    ...notDeletedWhere,
    ...(filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.role !== "all"
      ? {
          roles: {
            some: {
              ...notDeletedUserRoleWhere,
              role: {
                code: filters.role
              }
            }
          }
        }
      : {}),
    ...(registeredFrom || registeredTo
      ? {
          createdAt: {
            ...(registeredFrom ? { gte: registeredFrom } : {}),
            ...(registeredTo ? { lte: registeredTo } : {})
          }
        }
      : {})
  };
}

function createUserWhere(filters: AdminUserFilters): UserWhereInput {
  const search = filters.search.trim();
  const baseWhere = createBaseUserWhere(filters);

  if (!search || usesMongoRuntime) {
    return baseWhere;
  }

  const normalizedStatus = search.toUpperCase();
  const searchConditions: UserWhereInput[] = [
    { fullName: containsText(search) },
    { email: containsText(search) },
    { phoneNumber: containsText(search) },
    { addressLine1: containsText(search) },
    { addressLine2: containsText(search) },
    { city: containsText(search) },
    { state: containsText(search) },
    { postalCode: containsText(search) },
    { country: containsText(search) }
  ];

  if (["ACTIVE", "PENDING", "SUSPENDED"].includes(normalizedStatus)) {
    searchConditions.push({
      status: normalizedStatus as "ACTIVE" | "PENDING" | "SUSPENDED"
    });
  }

  return {
    ...baseWhere,
    OR: searchConditions
  };
}

function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function matchesAdminUserSearch(
  user: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    status: string;
    avatarUrl?: string | null;
    emailVerifiedAt?: Date | null;
    sessionsRevokedAt?: Date | null;
    twoFactorEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  search: string
) {
  const normalizedSearch = normalizeSearchValue(search);

  if (!normalizedSearch) {
    return true;
  }

  const searchableValues = [
    user.id,
    user.fullName,
    user.email,
    user.phoneNumber,
    user.addressLine1,
    user.addressLine2,
    user.city,
    user.state,
    user.postalCode,
    user.country,
    user.status,
    user.avatarUrl ?? "",
    user.emailVerifiedAt?.toISOString() ?? "",
    user.sessionsRevokedAt?.toISOString() ?? "",
    user.twoFactorEnabled ? "true enabled yes" : "false disabled no",
    user.createdAt.toISOString(),
    user.updatedAt.toISOString()
  ];

  return searchableValues.some((value) => normalizeSearchValue(value).includes(normalizedSearch));
}

function compareAdminUsers(
  left: { createdAt: Date; email: string; fullName: string; status: string },
  right: { createdAt: Date; email: string; fullName: string; status: string },
  sortBy: AdminUserFilters["sortBy"],
  sortOrder: AdminUserFilters["sortOrder"]
) {
  const direction = sortOrder === "asc" ? 1 : -1;

  if (sortBy === "createdAt") {
    return (left.createdAt.getTime() - right.createdAt.getTime()) * direction;
  }

  return left[sortBy].localeCompare(right[sortBy], undefined, { sensitivity: "base" }) * direction;
}

async function ensureAdminManagedRoles() {
  await Promise.all(
    adminManagedRoles.map((role) =>
      prisma.role.upsert({
        where: { code: role.code },
        update: { deletedAt: null, name: role.name },
        create: { code: role.code, deletedAt: null, name: role.name }
      })
    )
  );

  return prisma.role.findMany({
    where: {
      deletedAt: null,
      code: {
        in: adminManagedRoles.map((role) => role.code)
      }
    },
    orderBy: {
      name: "asc"
    },
    select: {
      id: true,
      code: true,
      name: true
    }
  });
}

function getAssignableRoleCodes(actorRoleCodes: string[]) {
  if (actorRoleCodes.includes("super_admin")) {
    return adminManagedRoles.map((role) => role.code);
  }

  if (actorRoleCodes.includes("content_admin")) {
    return ["student"];
  }

  return [];
}

function canManagePasswordForTarget(actorRoleCodes: string[], targetRoleCodes: string[]) {
  if (actorRoleCodes.includes("super_admin")) {
    return true;
  }

  if (!actorRoleCodes.includes("content_admin")) {
    return false;
  }

  return targetRoleCodes.length > 0 && targetRoleCodes.every((roleCode) => roleCode === "student");
}

function getLastActiveAt(user: {
  devices: Array<{ lastSeenAt: Date | null; createdAt: Date }>;
  sessions: Array<{ updatedAt: Date; createdAt: Date }>;
  updatedAt: Date;
  createdAt: Date;
}) {
  const timestamps = [
    user.updatedAt,
    user.createdAt,
    ...user.devices.flatMap((device) => [device.lastSeenAt ?? device.createdAt]),
    ...user.sessions.flatMap((session) => [session.updatedAt ?? session.createdAt])
  ].filter((value): value is Date => value instanceof Date);

  return timestamps.sort((left, right) => right.getTime() - left.getTime())[0] ?? user.createdAt;
}

function getPrimaryRoleName(userRoles: Array<{ role: { code: string; name: string } }>) {
  return userRoles[0]?.role.name ?? "Unassigned";
}

function normalizeUserSummary(user: {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: string;
  twoFactorEnabled: boolean;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{ role: { code: string; name: string } }>;
  devices: Array<{ lastSeenAt: Date | null; createdAt: Date }>;
  sessions: Array<{ updatedAt: Date; createdAt: Date }>;
  subscriptions: Array<{
    status: string;
    createdAt: Date;
    plan: { name: string; code: string };
  }>;
  payments: Array<{
    status: string;
    amountMinor: number;
    currency: string;
    createdAt: Date;
  }>;
  _count: {
    devices: number;
    sessions: number;
    payments: number;
    topics: number;
    answers: number;
    comments: number;
    replies: number;
  };
}) {
  const latestSubscription = user.subscriptions[0];
  const latestPayment = user.payments[0];
  const lastActiveAt = getLastActiveAt(user);

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    status: user.status,
    roles: user.roles.map((userRole) => ({
      code: userRole.role.code,
      name: userRole.role.name
    })),
    primaryRole: getPrimaryRoleName(user.roles),
    city: user.city,
    state: user.state,
    country: user.country,
    twoFactorEnabled: user.twoFactorEnabled,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    lastActiveAt: lastActiveAt.toISOString(),
    deviceCount: user._count.devices,
    sessionCount: user._count.sessions,
    paymentCount: user._count.payments,
    contributionCount: user._count.topics + user._count.answers + user._count.comments + user._count.replies,
    subscriptionPlan: latestSubscription?.plan.name ?? null,
    subscriptionStatus: latestSubscription?.status ?? null,
    latestPaymentStatus: latestPayment?.status ?? null,
    latestPaymentAmount: latestPayment ? formatMoney(latestPayment.amountMinor, latestPayment.currency) : null
  };
}

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  const normalizedValue = value == null ? "" : String(value);
  const escapedValue = normalizedValue.replace(/"/g, "\"\"");
  return `"${escapedValue}"`;
}

export function parseAdminUserFilters(query: Record<string, QueryValue>) {
  return adminUserFiltersSchema.parse({
    search: readQueryValue(query.search),
    role: readQueryValue(query.role),
    status: readQueryValue(query.status),
    registeredFrom: readQueryValue(query.registeredFrom),
    registeredTo: readQueryValue(query.registeredTo),
    sortBy: readQueryValue(query.sortBy),
    sortOrder: readQueryValue(query.sortOrder),
    page: readQueryValue(query.page),
    pageSize: readQueryValue(query.pageSize)
  });
}

export function parseAdminUserStatusInput(body: unknown) {
  return adminUserStatusSchema.parse(body);
}

export function parseAdminUserRolesInput(body: unknown) {
  return adminUserRolesSchema.parse(body);
}

export function parseAdminUserProfileInput(body: unknown) {
  return adminUserProfileSchema.parse(body);
}

export function parseAdminCreateUserInput(body: unknown) {
  return adminCreateUserSchema.parse(body);
}

export function parseAdminUserPasswordInput(body: unknown) {
  return adminUserPasswordSchema.parse(body);
}

export function parseAdminUserDeviceLimitInput(body: unknown) {
  return adminUserDeviceLimitSchema.parse(body);
}

export function parseAdminUserMonthlyRegistrationsQuery(query: Record<string, QueryValue>) {
  return adminUserMonthlyRegistrationsSchema.parse({
    year: readQueryValue(query.year)
  });
}

function resolveDeviceLimit(deviceLimitOverride: number | null | undefined) {
  const overrideValue = Number.isFinite(deviceLimitOverride) ? Number(deviceLimitOverride) : NaN;
  const normalizedOverride = Number.isInteger(overrideValue) ? overrideValue : NaN;
  const limit = Number.isFinite(normalizedOverride) ? normalizedOverride : 3;

  return Math.max(1, limit);
}

export async function listAdminUsers(filters: AdminUserFilters, actorRoleCodes: string[]) {
  const assignableRoleCodes = getAssignableRoleCodes(actorRoleCodes);
  const managedRolesPromise = ensureAdminManagedRoles();
  const totalRegisteredUsersPromise = prisma.user.count({
    where: {
      ...(usesMongoRuntime
        ? {
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
          }
        : { deletedAt: null })
    }
  });
  const search = filters.search.trim();
  const where = createUserWhere(filters);
  const baseWhere = createBaseUserWhere(filters);
  const registrationWindow = createRegistrationWindow(filters);
  const previousWindowDuration = registrationWindow.end.getTime() - registrationWindow.start.getTime() + 1;
  const previousWindowStart = new Date(registrationWindow.start.getTime() - previousWindowDuration);
  const previousWindowEnd = new Date(registrationWindow.start.getTime() - 1);
  const skip = (filters.page - 1) * filters.pageSize;

  if (usesMongoRuntime && search) {
    const [allUsers, availableRoles, totalRegisteredUsers] = await Promise.all([
      prisma.user.findMany({
        where: baseWhere,
        include: {
          roles: {
            where: {
              deletedAt: null
            },
            include: {
              role: true
            }
          },
          devices: {
            where: {
              deletedAt: null
            },
            orderBy: {
              lastSeenAt: "desc"
            },
            take: 5
          },
          sessions: {
            where: {
              deletedAt: null
            },
            orderBy: {
              updatedAt: "desc"
            },
            take: 5
          },
          subscriptions: {
            where: {
              deletedAt: null
            },
            orderBy: {
              createdAt: "desc"
            },
            take: 1,
            include: {
              plan: true
            }
          },
          payments: {
            where: {
              deletedAt: null
            },
            orderBy: {
              createdAt: "desc"
            },
            take: 1
          },
          _count: {
            select: {
              devices: true,
              sessions: true,
              payments: true,
              topics: true,
              answers: true,
              comments: true,
              replies: true
            }
          }
        }
      }),
      managedRolesPromise,
      totalRegisteredUsersPromise
    ]);

    const matchedUsers = allUsers
      .filter((user) => matchesAdminUserSearch(user, search))
      .sort((left, right) => compareAdminUsers(left, right, filters.sortBy, filters.sortOrder));

    const filteredTotal = matchedUsers.length;
    const activeUsers = matchedUsers.filter((user) => user.status === "ACTIVE").length;
    const pendingUsers = matchedUsers.filter((user) => user.status === "PENDING").length;
    const suspendedUsers = matchedUsers.filter((user) => user.status === "SUSPENDED").length;
    const verifiedUsers = matchedUsers.filter((user) => user.emailVerifiedAt !== null).length;
    const registrationsInWindow = matchedUsers.filter(
      (user) => user.createdAt >= registrationWindow.start && user.createdAt <= registrationWindow.end
    ).length;
    const registrationsInPreviousWindow = matchedUsers.filter(
      (user) => user.createdAt >= previousWindowStart && user.createdAt <= previousWindowEnd
    ).length;
    const timelineMap = new Map<string, number>();
    const roleBreakdownMap = new Map<string, { code: string; name: string; count: number }>();

    for (const user of matchedUsers) {
      const dateKey = formatDateKey(user.createdAt);
      timelineMap.set(dateKey, (timelineMap.get(dateKey) ?? 0) + 1);

      for (const userRole of user.roles) {
        const existingRole = roleBreakdownMap.get(userRole.role.code);
        roleBreakdownMap.set(userRole.role.code, {
          code: userRole.role.code,
          name: userRole.role.name,
          count: (existingRole?.count ?? 0) + 1
        });
      }
    }

    const registrationTimeline = Array.from(timelineMap.entries()).map(([date, count]) => ({
      date,
      label: date,
      count
    }));
    const roleBreakdown = Array.from(roleBreakdownMap.values()).sort((left, right) => right.count - left.count);
    const totalPages = Math.max(1, Math.ceil(filteredTotal / filters.pageSize));
    const pagedUsers = matchedUsers.slice(skip, skip + filters.pageSize);

    return {
      globalSummary: {
        totalUsers: totalRegisteredUsers
      },
      summary: {
        totalUsers: filteredTotal,
        activeUsers,
        pendingUsers,
        suspendedUsers,
        verifiedUsers,
        registrationsInWindow
      },
      metrics: [
        {
          id: "total-users",
          label: "Matched users",
          value: filteredTotal.toLocaleString(),
          change: filters.search || filters.role !== "all" || filters.status !== "all" ? "Based on the active filters" : "Across the full user base"
        },
        {
          id: "registrations-window",
          label: "Registrations",
          value: registrationsInWindow.toLocaleString(),
          change: formatPercentageChange(registrationsInWindow, registrationsInPreviousWindow)
        },
        {
          id: "verified-users",
          label: "Verified email",
          value: verifiedUsers.toLocaleString(),
          change: filteredTotal === 0 ? "No users in this view yet" : `${Math.round((verifiedUsers / filteredTotal) * 100)}% of matched users`
        },
        {
          id: "active-users",
          label: "Active accounts",
          value: activeUsers.toLocaleString(),
          change: filteredTotal === 0 ? "No users in this view yet" : `${Math.round((activeUsers / filteredTotal) * 100)}% of matched users`
        }
      ],
      registrationTimeline,
      roleBreakdown,
      users: pagedUsers.map(normalizeUserSummary),
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        totalItems: filteredTotal,
        totalPages
      },
      availableRoles: availableRoles
        .filter((role) => assignableRoleCodes.includes(role.code))
        .map((role) => ({
          code: role.code,
          name: role.name
        })),
      appliedFilters: filters
    };
  }

  const [
    filteredTotal,
    activeUsers,
    pendingUsers,
    suspendedUsers,
    verifiedUsers,
    registrationsInWindow,
    registrationsInPreviousWindow,
    usersForTimeline,
    pagedUsers,
    availableRoles,
    totalRegisteredUsers
  ] =
    await Promise.all([
      prisma.user.count({ where }),
      prisma.user.count({ where: { ...where, status: "ACTIVE" } }),
      prisma.user.count({ where: { ...where, status: "PENDING" } }),
      prisma.user.count({ where: { ...where, status: "SUSPENDED" } }),
      prisma.user.count({
        where: {
          ...where,
          emailVerifiedAt: {
            not: null
          }
        }
      }),
      prisma.user.count({
        where: {
          ...where,
          createdAt: {
            gte: registrationWindow.start,
            lte: registrationWindow.end
          }
        }
      }),
      prisma.user.count({
        where: {
          ...where,
          createdAt: {
            gte: previousWindowStart,
            lte: previousWindowEnd
          }
        }
      }),
      prisma.user.findMany({
        where,
        select: {
          createdAt: true,
          roles: {
            where: {
              deletedAt: null
            },
            select: {
              role: {
                select: {
                  code: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      }),
      prisma.user.findMany({
        where,
        skip,
        take: filters.pageSize,
        orderBy: {
          [filters.sortBy]: filters.sortOrder
        },
        include: {
          roles: {
            where: {
              deletedAt: null
            },
            include: {
              role: true
            }
          },
          devices: {
            where: {
              deletedAt: null
            },
            orderBy: {
              lastSeenAt: "desc"
            },
            take: 5
          },
          sessions: {
            where: {
              deletedAt: null
            },
            orderBy: {
              updatedAt: "desc"
            },
            take: 5
          },
          subscriptions: {
            where: {
              deletedAt: null
            },
            orderBy: {
              createdAt: "desc"
            },
            take: 1,
            include: {
              plan: true
            }
          },
          payments: {
            where: {
              deletedAt: null
            },
            orderBy: {
              createdAt: "desc"
            },
            take: 1
          },
          _count: {
            select: {
              devices: true,
              sessions: true,
              payments: true,
              topics: true,
              answers: true,
              comments: true,
              replies: true
            }
          }
        }
      }),
      managedRolesPromise,
      totalRegisteredUsersPromise
    ]);

  const timelineMap = new Map<string, number>();
  const roleBreakdownMap = new Map<string, { code: string; name: string; count: number }>();

  for (const user of usersForTimeline) {
    const dateKey = formatDateKey(user.createdAt);
    timelineMap.set(dateKey, (timelineMap.get(dateKey) ?? 0) + 1);

    for (const userRole of user.roles) {
      const existingRole = roleBreakdownMap.get(userRole.role.code);
      roleBreakdownMap.set(userRole.role.code, {
        code: userRole.role.code,
        name: userRole.role.name,
        count: (existingRole?.count ?? 0) + 1
      });
    }
  }

  const registrationTimeline = Array.from(timelineMap.entries()).map(([date, count]) => ({
    date,
    label: date,
    count
  }));

  const roleBreakdown = Array.from(roleBreakdownMap.values()).sort((left, right) => right.count - left.count);
  const totalPages = Math.max(1, Math.ceil(filteredTotal / filters.pageSize));

  return {
    globalSummary: {
      totalUsers: totalRegisteredUsers
    },
    summary: {
      totalUsers: filteredTotal,
      activeUsers,
      pendingUsers,
      suspendedUsers,
      verifiedUsers,
      registrationsInWindow
    },
    metrics: [
      {
        id: "total-users",
        label: "Matched users",
        value: filteredTotal.toLocaleString(),
        change: filters.search || filters.role !== "all" || filters.status !== "all" ? "Based on the active filters" : "Across the full user base"
      },
      {
        id: "registrations-window",
        label: "Registrations",
        value: registrationsInWindow.toLocaleString(),
        change: formatPercentageChange(registrationsInWindow, registrationsInPreviousWindow)
      },
      {
        id: "verified-users",
        label: "Verified email",
        value: verifiedUsers.toLocaleString(),
        change: filteredTotal === 0 ? "No users in this view yet" : `${Math.round((verifiedUsers / filteredTotal) * 100)}% of matched users`
      },
      {
        id: "active-users",
        label: "Active accounts",
        value: activeUsers.toLocaleString(),
        change: filteredTotal === 0 ? "No users in this view yet" : `${Math.round((activeUsers / filteredTotal) * 100)}% of matched users`
      }
    ],
    registrationTimeline,
    roleBreakdown,
    users: pagedUsers.map(normalizeUserSummary),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems: filteredTotal,
      totalPages
    },
    availableRoles: availableRoles
      .filter((role) => assignableRoleCodes.includes(role.code))
      .map((role) => ({
      code: role.code,
      name: role.name
      })),
    appliedFilters: filters
  };
}

export async function getAdminUserMonthlyRegistrations(year = new Date().getFullYear()) {
  const notDeletedWhere = usesMongoRuntime ? { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } : { deletedAt: null };
  const registrationDates = await prisma.user.findMany({
    where: {
      ...notDeletedWhere
    },
    select: {
      createdAt: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const availableYears = Array.from(new Set(registrationDates.map((item) => item.createdAt.getFullYear()))).sort((left, right) => right - left);
  const effectiveYear = availableYears.includes(year) ? year : (availableYears[0] ?? year);
  const rangeStart = new Date(effectiveYear, 0, 1);
  const rangeEnd = new Date(effectiveYear + 1, 0, 1);
  const monthlyCounts = Array.from({ length: 12 }, (_, monthIndex) => ({
    month: monthIndex + 1,
    label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(effectiveYear, monthIndex, 1)),
    count: 0
  }));

  const users = await prisma.user.findMany({
    where: {
      ...notDeletedWhere,
      createdAt: {
        gte: rangeStart,
        lt: rangeEnd
      }
    },
    select: {
      createdAt: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  for (const user of users) {
    monthlyCounts[user.createdAt.getMonth()]!.count += 1;
  }

  return {
    availableYears,
    year: effectiveYear,
    totalRegistrations: monthlyCounts.reduce((sum, item) => sum + item.count, 0),
    months: monthlyCounts
  };
}

export async function getAdminUserDetail(userId: string) {
  const notDeletedWhere = usesMongoRuntime ? { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } : { deletedAt: null };
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      ...notDeletedWhere
    },
    include: {
      roles: {
        where: {
          ...notDeletedWhere
        },
        include: {
          role: true
        }
      },
      student: true,
      tutor: true,
      devices: {
        where: {
          ...notDeletedWhere
        },
        orderBy: {
          lastSeenAt: "desc"
        }
      },
      sessions: {
        where: {
          ...notDeletedWhere
        },
        orderBy: {
          updatedAt: "desc"
        }
      },
      subscriptions: {
        where: {
          ...notDeletedWhere
        },
        orderBy: {
          createdAt: "desc"
        },
        include: {
          plan: true,
          payments: {
            where: {
              ...notDeletedWhere
            },
            orderBy: {
              createdAt: "desc"
            },
            take: 5
          }
        }
      },
      payments: {
        where: {
          ...notDeletedWhere
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 10
      },
      activityLogs: {
        where: {
          ...notDeletedWhere
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 8
      },
      auditLogs: {
        where: {
          ...notDeletedWhere
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 8
      },
      _count: {
        select: {
          devices: true,
          sessions: true,
          payments: true,
          subscriptions: true,
          topics: true,
          answers: true,
          comments: true,
          replies: true,
          notifications: true,
          certificates: true
        }
      }
    }
  });

  if (!user) {
    return null;
  }

  const lastActiveAt = getLastActiveAt(user);

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    avatarUrl: user.avatarUrl,
    status: user.status,
    twoFactorEnabled: user.twoFactorEnabled,
    deviceLimitOverride: user.deviceLimitOverride ?? null,
    deviceLimit: resolveDeviceLimit(user.deviceLimitOverride),
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastActiveAt: lastActiveAt.toISOString(),
    address: {
      addressLine1: user.addressLine1,
      addressLine2: user.addressLine2,
      city: user.city,
      state: user.state,
      postalCode: user.postalCode,
      country: user.country
    },
    roles: user.roles.map((userRole) => ({
      code: userRole.role.code,
      name: userRole.role.name,
      description: userRole.role.description
    })),
    profileType: user.student ? "student" : user.tutor ? "tutor" : "general",
    studentProfile: user.student
      ? {
          id: user.student.id,
          headline: user.student.headline,
          studyHours: user.student.studyHours,
          streakDays: user.student.streakDays
        }
      : null,
    tutorProfile: user.tutor
      ? {
          id: user.tutor.id,
          bio: user.tutor.bio,
          specialty: user.tutor.specialty,
          rating: user.tutor.rating
        }
      : null,
    counts: {
      devices: user._count.devices,
      sessions: user._count.sessions,
      subscriptions: user._count.subscriptions,
      payments: user._count.payments,
      topics: user._count.topics,
      answers: user._count.answers,
      comments: user._count.comments,
      replies: user._count.replies,
      notifications: user._count.notifications,
      certificates: user._count.certificates
    },
    devices: user.devices.map((device) => ({
      id: device.id,
      name: device.name,
      createdAt: device.createdAt.toISOString(),
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null
    })),
    sessions: user.sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString()
    })),
    subscriptions: user.subscriptions.map((subscription) => ({
      id: subscription.id,
      status: subscription.status,
      autoRenew: subscription.autoRenew,
      startsAt: subscription.startsAt.toISOString(),
      endsAt: subscription.endsAt?.toISOString() ?? null,
      createdAt: subscription.createdAt.toISOString(),
      plan: {
        code: subscription.plan.code,
        name: subscription.plan.name,
        interval: subscription.plan.interval,
        price: formatMoney(subscription.plan.priceMinor, subscription.plan.currency)
      },
      recentPayments: subscription.payments.map((payment) => ({
        id: payment.id,
        status: payment.status,
        amount: formatMoney(payment.amountMinor, payment.currency),
        provider: payment.provider,
        createdAt: payment.createdAt.toISOString()
      }))
    })),
    payments: user.payments.map((payment) => ({
      id: payment.id,
      status: payment.status,
      provider: payment.provider,
      amount: formatMoney(payment.amountMinor, payment.currency),
      createdAt: payment.createdAt.toISOString()
    })),
    recentActivity: [
      ...user.activityLogs.map((item) => ({
        id: item.id,
        kind: "activity" as const,
        action: item.action,
        context: item.context,
        createdAt: item.createdAt.toISOString()
      })),
      ...user.auditLogs.map((item) => ({
        id: item.id,
        kind: "audit" as const,
        action: `${item.action} on ${item.resource}`,
        context: item.payload,
        createdAt: item.createdAt.toISOString()
      }))
    ].sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1))
  };
}

export async function updateAdminUserDeviceLimitOverride(
  userId: string,
  input: AdminUserDeviceLimitInput,
  actorUserId: string
) {
  const updated = await runInTransaction(async (tx) => {
    const notDeletedWhere = usesMongoRuntime ? { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } : { deletedAt: null };
    const user = await tx.user.findFirst({
      where: {
        id: userId,
        ...notDeletedWhere
      },
      select: {
        id: true
      }
    });

    if (!user) {
      return null;
    }

    await tx.user.update({
      where: {
        id: user.id
      },
      data: {
        deviceLimitOverride: input.deviceLimitOverride
      }
    });

    await tx.auditLog.create({
      data: {
        action: "admin.user.device_limit_override.updated",
        payload: input,
        resource: user.id,
        userId: actorUserId
      }
    });

    return user.id;
  });

  if (!updated) {
    return null;
  }

  return getAdminUserDetail(userId);
}

export async function resetAdminUserDevices(userId: string, actorUserId: string) {
  const updated = await runInTransaction(async (tx) => {
    const notDeletedWhere = usesMongoRuntime ? { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } : { deletedAt: null };
    const user = await tx.user.findFirst({
      where: {
        id: userId,
        ...notDeletedWhere
      },
      select: {
        id: true
      }
    });

    if (!user) {
      return null;
    }

    await tx.device.updateMany({
      where: {
        userId: user.id,
        ...(usesMongoRuntime ? { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] } : { deletedAt: null })
      },
      data: {
        deletedAt: new Date()
      }
    });

    await revokeUserSessions(tx, user.id);

    await tx.auditLog.create({
      data: {
        action: "admin.user.devices.reset",
        payload: {},
        resource: user.id,
        userId: actorUserId
      }
    });

    return user.id;
  });

  if (!updated) {
    return null;
  }

  return getAdminUserDetail(userId);
}

export async function exportAdminUsersCsv(filters: AdminUserFilters) {
  const search = filters.search.trim();
  const where = createUserWhere(filters);
  const baseWhere = createBaseUserWhere(filters);
  const users = usesMongoRuntime && search
    ? (
        await prisma.user.findMany({
          where: baseWhere,
          include: {
            roles: {
              where: {
                deletedAt: null
              },
              include: {
                role: true
              }
            },
            devices: {
              where: {
                deletedAt: null
              },
              orderBy: {
                lastSeenAt: "desc"
              },
              take: 5
            },
            sessions: {
              where: {
                deletedAt: null
              },
              orderBy: {
                updatedAt: "desc"
              },
              take: 5
            },
            subscriptions: {
              where: {
                deletedAt: null
              },
              orderBy: {
                createdAt: "desc"
              },
              take: 1,
              include: {
                plan: true
              }
            },
            payments: {
              where: {
                deletedAt: null
              },
              orderBy: {
                createdAt: "desc"
              },
              take: 1
            },
            _count: {
              select: {
                devices: true,
                sessions: true,
                payments: true,
                topics: true,
                answers: true,
                comments: true,
                replies: true
              }
            }
          }
        })
      )
        .filter((user) => matchesAdminUserSearch(user, search))
        .sort((left, right) => compareAdminUsers(left, right, filters.sortBy, filters.sortOrder))
    : await prisma.user.findMany({
        where,
        orderBy: {
          [filters.sortBy]: filters.sortOrder
        },
        include: {
          roles: {
            where: {
              deletedAt: null
            },
            include: {
              role: true
            }
          },
          devices: {
            where: {
              deletedAt: null
            },
            orderBy: {
              lastSeenAt: "desc"
            },
            take: 5
          },
          sessions: {
            where: {
              deletedAt: null
            },
            orderBy: {
              updatedAt: "desc"
            },
            take: 5
          },
          subscriptions: {
            where: {
              deletedAt: null
            },
            orderBy: {
              createdAt: "desc"
            },
            take: 1,
            include: {
              plan: true
            }
          },
          payments: {
            where: {
              deletedAt: null
            },
            orderBy: {
              createdAt: "desc"
            },
            take: 1
          },
          _count: {
            select: {
              devices: true,
              sessions: true,
              payments: true,
              topics: true,
              answers: true,
              comments: true,
              replies: true
            }
          }
        }
      });

  const header = [
    "User ID",
    "Full name",
    "Email",
    "Status",
    "Roles",
    "Phone number",
    "Address line 1",
    "Address line 2",
    "City",
    "State",
    "Postal code",
    "Country",
    "Two-factor enabled",
    "Email verified at",
    "Created at",
    "Last active at",
    "Device count",
    "Session count",
    "Contribution count",
    "Current plan",
    "Subscription status",
    "Latest payment status",
    "Latest payment amount"
  ];

  const rows = users.map((user) => {
    const latestSubscription = user.subscriptions[0];
    const latestPayment = user.payments[0];
    const lastActiveAt = getLastActiveAt(user);

    return [
      user.id,
      user.fullName,
      user.email,
      toTitleCase(user.status),
      user.roles.map((userRole) => userRole.role.name).join(", "),
      user.phoneNumber ?? "",
      user.addressLine1 ?? "",
      user.addressLine2 ?? "",
      user.city ?? "",
      user.state ?? "",
      user.postalCode ?? "",
      user.country ?? "",
      user.twoFactorEnabled,
      user.emailVerifiedAt?.toISOString() ?? "",
      user.createdAt.toISOString(),
      lastActiveAt.toISOString(),
      user._count.devices,
      user._count.sessions,
      user._count.topics + user._count.answers + user._count.comments + user._count.replies,
      latestSubscription?.plan.name ?? "",
      latestSubscription ? toTitleCase(latestSubscription.status) : "",
      latestPayment ? toTitleCase(latestPayment.status) : "",
      latestPayment ? formatMoney(latestPayment.amountMinor, latestPayment.currency) : ""
    ];
  });

  return `\uFEFF${[header, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n")}`;
}

export async function updateAdminUserStatus(userId: string, nextStatus: AdminUserStatusInput["status"], actorUserId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: null
    },
    select: {
      id: true,
      fullName: true,
      status: true
    }
  });

  if (!user) {
    return null;
  }

  await runInTransaction(async (tx) => {
    await tx.user.update({
      where: {
        id: userId
      },
      data: {
        status: nextStatus
      }
    });

    if (nextStatus === "SUSPENDED") {
      await revokeUserSessions(tx, userId);
    }

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: "ADMIN_USER_STATUS_UPDATED",
        resource: "user",
        payload: {
          targetUserId: userId,
          previousStatus: user.status,
          nextStatus
        }
      }
    });

    await tx.activityLog.create({
      data: {
        userId,
        action: `Account status changed from ${user.status} to ${nextStatus}`,
        context: {
          actorUserId
        }
      }
    });
  });

  return getAdminUserDetail(userId);
}

export async function updateAdminUserRoles(userId: string, roleCodes: string[], actorUserId: string) {
  const normalizedRoleCodes = [...new Set(roleCodes.map((roleCode) => roleCode.trim()).filter(Boolean))];

  if (normalizedRoleCodes.length === 0) {
    throw new Error("At least one role code is required.");
  }

  const [user, availableRoles, currentUserRoles] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null
      },
      select: {
        id: true,
        fullName: true
      }
    }),
    ensureAdminManagedRoles().then((roles) => roles.filter((role) => normalizedRoleCodes.includes(role.code))),
    prisma.userRole.findMany({
      where: {
        userId,
        deletedAt: null
      },
      include: {
        role: true
      }
    })
  ]);

  if (!user) {
    return null;
  }

  const missingRoleCodes = normalizedRoleCodes.filter((roleCode) => !availableRoles.some((role) => role.code === roleCode));

  if (missingRoleCodes.length > 0) {
    throw new Error(`Unknown role codes: ${missingRoleCodes.join(", ")}`);
  }

  const nextRoleIds = new Set(availableRoles.map((role) => role.id));
  const nextRoleCodes = new Set(availableRoles.map((role) => role.code));
  const currentActiveRoleIds = new Set(currentUserRoles.map((userRole) => userRole.roleId));
  const currentRoleCodes = currentUserRoles.map((userRole) => userRole.role.code);

  await runInTransaction(async (tx) => {
    for (const currentUserRole of currentUserRoles) {
      if (!nextRoleIds.has(currentUserRole.roleId)) {
        await tx.userRole.update({
          where: {
            id: currentUserRole.id
          },
          data: {
            deletedAt: new Date()
          }
        });
      }
    }

    for (const nextRole of availableRoles) {
      if (currentActiveRoleIds.has(nextRole.id)) {
        continue;
      }

      const existingHistoricalRole = await tx.userRole.findFirst({
        where: {
          userId,
          roleId: nextRole.id
        },
        select: {
          id: true,
          deletedAt: true
        }
      });

      if (existingHistoricalRole) {
        await tx.userRole.update({
          where: {
            id: existingHistoricalRole.id
          },
          data: {
            deletedAt: null
          }
        });
        continue;
      }

      await tx.userRole.create({
        data: {
          userId,
          roleId: nextRole.id
        }
      });
    }

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: "ADMIN_USER_ROLES_UPDATED",
        resource: "user",
        payload: {
          targetUserId: userId,
          previousRoleCodes: currentRoleCodes,
          nextRoleCodes: Array.from(nextRoleCodes)
        }
      }
    });

    await tx.activityLog.create({
      data: {
        userId,
        action: "Account roles updated",
        context: {
          actorUserId,
          roleCodes: Array.from(nextRoleCodes)
        }
      }
    });
  });

  return getAdminUserDetail(userId);
}

export async function updateAdminUserProfile(userId: string, input: AdminUserProfileInput, actorUserId: string) {
  const existingUser = await prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: null
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phoneNumber: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true
    }
  });

  if (!existingUser) {
    return null;
  }

  const conflictingUser = await prisma.user.findFirst({
    where: {
      email: input.email,
      deletedAt: null,
      NOT: {
        id: userId
      }
    },
    select: {
      id: true
    }
  });

  if (conflictingUser) {
    throw new Error("EMAIL_IN_USE");
  }

  await runInTransaction(async (tx) => {
    await tx.user.update({
      where: {
        id: userId
      },
      data: {
        fullName: input.fullName,
        email: input.email,
        phoneNumber: input.phoneNumber || null,
        addressLine1: input.addressLine1 || null,
        addressLine2: input.addressLine2 || null,
        city: input.city || null,
        state: input.state || null,
        postalCode: input.postalCode || null,
        country: input.country || null
      }
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: "ADMIN_USER_PROFILE_UPDATED",
        resource: "user",
        payload: {
          targetUserId: userId,
          previousProfile: existingUser,
          nextProfile: input
        }
      }
    });

    await tx.activityLog.create({
      data: {
        userId,
        action: "Account profile updated by super admin",
        context: {
          actorUserId
        }
      }
    });
  });

  return getAdminUserDetail(userId);
}

export async function updateAdminUserPassword(
  userId: string,
  input: AdminUserPasswordInput,
  actorUserId: string,
  actorRoleCodes: string[]
) {
  const targetUser = await prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: null
    },
    select: {
      id: true,
      fullName: true,
      roles: {
        where: {
          deletedAt: null
        },
        select: {
          role: {
            select: {
              code: true
            }
          }
        }
      }
    }
  });

  if (!targetUser) {
    return null;
  }

  const targetRoleCodes = targetUser.roles.map((item) => item.role.code);

  if (!canManagePasswordForTarget(actorRoleCodes, targetRoleCodes)) {
    throw new Error("PASSWORD_UPDATE_FORBIDDEN");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  await runInTransaction(async (tx) => {
    await tx.user.update({
      where: {
        id: userId
      },
      data: {
        passwordHash
      }
    });

    await revokeUserSessions(tx, userId);

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: "ADMIN_USER_PASSWORD_UPDATED",
        resource: "user",
        payload: {
          targetRoleCodes,
          targetUserId: userId
        }
      }
    });

    await tx.activityLog.create({
      data: {
        userId,
        action: "Account password updated by admin workspace",
        context: {
          actorUserId
        }
      }
    });
  });

  return getAdminUserDetail(userId);
}

export async function createAdminUser(input: AdminCreateUserInput, actorUserId: string, actorRoleCodes: string[]) {
  const normalizedRoleCodes = [...new Set(input.roleCodes.map((roleCode) => roleCode.trim()).filter(Boolean))];
  const assignableRoleCodes = getAssignableRoleCodes(actorRoleCodes);

  if (normalizedRoleCodes.length === 0) {
    throw new Error("ROLE_REQUIRED");
  }

  if (assignableRoleCodes.length === 0) {
    throw new Error("ROLE_ASSIGNMENT_FORBIDDEN");
  }

  const [existingUser, availableRoles] = await Promise.all([
    prisma.user.findFirst({
      where: {
        email: input.email,
        deletedAt: null
      },
      select: {
        id: true
      }
    }),
    ensureAdminManagedRoles().then((roles) =>
      roles.filter((role) => normalizedRoleCodes.includes(role.code) && assignableRoleCodes.includes(role.code))
    )
  ]);

  if (existingUser) {
    throw new Error("EMAIL_IN_USE");
  }

  const missingRoleCodes = normalizedRoleCodes.filter((roleCode) => !availableRoles.some((role) => role.code === roleCode));

  if (missingRoleCodes.length > 0) {
    throw new Error(`UNKNOWN_ROLE_CODES:${missingRoleCodes.join(",")}`);
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const nextRoleCodes = new Set(availableRoles.map((role) => role.code));
  let createdUserId = "";

  await runInTransaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        deletedAt: null,
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        phoneNumber: input.phoneNumber || null,
        addressLine1: input.addressLine1 || null,
        addressLine2: input.addressLine2 || null,
        city: input.city || null,
        state: input.state || null,
        postalCode: input.postalCode || null,
        country: input.country || null,
        status: "ACTIVE",
        emailVerifiedAt: new Date()
      }
    });

    createdUserId = createdUser.id;

    await Promise.all(
      availableRoles.map((role) =>
        tx.userRole.create({
          data: {
            deletedAt: null,
            userId: createdUser.id,
            roleId: role.id
          }
        })
      )
    );

    if (nextRoleCodes.has("student")) {
      await tx.student.create({
        data: {
          deletedAt: null,
          userId: createdUser.id
        }
      });
    }
  });

  await Promise.all([
    prisma.auditLog.create({
      data: {
        userId: actorUserId,
        action: "ADMIN_USER_CREATED",
        resource: "user",
        payload: {
          createdUserEmail: input.email,
          createdUserId,
          roleCodes: Array.from(nextRoleCodes)
        }
      }
    }),
    prisma.activityLog.create({
      data: {
        userId: createdUserId,
        action: "Account created by admin workspace",
        context: {
          actorUserId,
          roleCodes: Array.from(nextRoleCodes)
        }
      }
    })
  ]);

  const createdUser = await getAdminUserDetail(createdUserId);

  if (createdUser) {
    try {
      await sendAdminUserProvisioningEmail({
        email: input.email,
        fullName: input.fullName,
        password: input.password,
        roleCodes: Array.from(nextRoleCodes)
      });
    } catch (error) {
      console.error("Failed to send admin user provisioning email:", error);
    }
  }

  return createdUser;
}
