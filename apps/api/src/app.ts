import bcrypt from "bcryptjs";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import morgan from "morgan";
import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { sendContactEmail, sendPasswordResetEmail, sendRegistrationVerificationEmails } from "./lib/email.js";
import {
  appendAdminLibraryChunkBuffer,
  clearAdminLibraryChunkBuffer,
  createLawReportReadingSession,
  createAdminLibraryMaterial,
  deleteAdminLibraryMaterial,
  getAdminLibraryMaterial,
  getLibraryMaterial,
  listAdminLibraryMaterials,
  parseAdminLibraryFilters,
  parseAdminLibraryMaterialInput,
  parseAdminLibrarySearchQuery,
  parseAdminLibrarySection,
  peekAdminLibraryChunkBuffer,
  searchLibraryMaterialsForStudents,
  searchAdminLibraryMaterials,
  updateLawReportReadingSession,
  updateAdminLibraryMaterial
} from "./admin-library.js";
import {
  autocompleteSubjectSummaries,
  autocompletePublishedSubjectSummaries,
  bulkUpdateSubjectSummaryCases,
  bulkUpdateSubjectSummarySubjects,
  bulkUpdateSubjectSummaryTopics,
  createSubjectSummaryCase,
  createSubjectSummarySubject,
  createSubjectSummaryTopic,
  deleteSubjectSummaryCase,
  deleteSubjectSummarySubject,
  deleteSubjectSummaryTopic,
  getPublishedSubjectSummaryCaseDetail,
  getPublishedSubjectSummaryHierarchy,
  getPublishedSubjectSummaryHierarchyCases,
  getPublishedSubjectSummaryHierarchyTopics,
  getSubjectSummaryCaseDetail,
  getSubjectSummaryHierarchy,
  getSubjectSummaryHierarchyCases,
  getSubjectSummaryHierarchyTopics,
  getSubjectSummaryReadingInsights,
  listPublishedSubjectSummaryCases,
  listSubjectSummaryCases,
  listSubjectSummarySubjects,
  listSubjectSummaryTopics,
  parseSubjectSummaryAutocompleteQuery,
  parseSubjectSummaryCaseBulkAction,
  parseSubjectSummaryCaseFilters,
  parsePublishedSubjectSummaryCaseFilters,
  parseSubjectSummaryCaseInput,
  parseSubjectSummaryHierarchyQuery,
  parseSubjectSummarySubjectBulkAction,
  parseSubjectSummarySubjectFilters,
  parseSubjectSummarySubjectInput,
  parseSubjectSummaryTopicBulkAction,
  parseSubjectSummaryTopicFilters,
  parseSubjectSummaryTopicInput,
  recordSubjectSummaryCaseView,
  updateSubjectSummaryCase,
  updateSubjectSummarySubject,
  updateSubjectSummaryTopic
} from "./admin-subject-summaries.js";
import {
  createSubjectSummaryEntry,
  createSubjectSummaryTopicEntries,
  deleteSubjectSummaryEntry,
  getStudentSubjectSummaryRevisionView,
  getSubjectSummaryEntryFormOptions,
  listStudentSubjectSummaryTopics,
  listStudentSubjectSummarySubjects,
  listSubjectSummaryEntries,
  listSubjectSummaryModuleTopics,
  parseStudentSubjectSummaryEntriesQuery,
  parseStudentSubjectSummarySubjectsQuery,
  parseStudentSubjectSummaryTopicsQuery,
  parseSubjectSummaryEntryFilters,
  parseSubjectSummaryEntryInput,
  parseSubjectSummaryTopicBulkInput,
  parseSubjectSummaryModuleTopicsQuery,
  getAdminSubjectSummaryEntry,
  updateSubjectSummaryEntry
} from "./subject-summary-module.js";
import {
  createAdminBarFinalExamQuestion,
  createAdminBarFinalExamMcqQuestion,
  deleteAdminBarFinalExamQuestion,
  deleteAdminBarFinalExamMcqQuestion,
  fetchBarFinalExamFormOptions,
  getAdminBarFinalExamMcqQuestion,
  getAdminBarFinalExamQuestion,
  listAdminBarFinalExamQuestions,
  listAdminBarFinalExamMcqQuestions,
  listStudentBarFinalExamQuestions,
  listStudentBarFinalExamMcqQuestions,
  listStudentBarFinalExamMcqSubjects,
  listStudentBarFinalExamSubjects,
  parseAdminBarFinalExamMcqQuestionFilters,
  parseAdminBarFinalExamQuestionFilters,
  parseBarFinalExamMcqQuestionInput,
  parseBarFinalExamQuestionInput,
  parseStudentBarFinalExamMcqAttemptInput,
  parseStudentBarFinalExamMcqQuestionsQuery,
  parseStudentBarFinalExamQuestionsQuery,
  parseStudentBarFinalExamSubjectsQuery,
  submitStudentBarFinalExamMcqAttempt,
  updateAdminBarFinalExamMcqQuestion,
  updateAdminBarFinalExamQuestion
} from "./bar-final-exams.js";
import {
  parseAdminPortalSearchQuery,
  searchAdminPortal
} from "./portal-search.js";
import { parseStudentPortalSearchQuery, searchStudentPortal } from "./student-portal-search.js";
import { listLatestCatalogPublications, parseLatestCatalogPublicationsQuery } from "./catalog-latest-publications.js";
import {
  createHelarConnectAnswer,
  createHelarConnectComment,
  createHelarConnectQuestion,
  deleteHelarConnectAnswer,
  deleteHelarConnectComment,
  deleteHelarConnectQuestion,
  listHelarConnectQuestions,
  listHelarConnectUsers,
  parseHelarConnectAnswerInput,
  parseHelarConnectCommentInput,
  parseHelarConnectQuestionInput,
  parseHelarConnectQuestionListQuery,
  parseHelarConnectUserListQuery,
  recordHelarConnectQuestionView,
  toggleHelarConnectVote
} from "./helar-connect.js";
import {
  addStudentStudyBookmark,
  createStudentStudyNote,
  deleteStudentStudyNote,
  getStudentStudyCenterDashboard,
  getStudentStudyProgress,
  listStudentStudyBookmarks,
  listStudentStudyDownloads,
  listStudentStudyNotes,
  parseStudyBookmarkInput,
  parseStudyBookmarkQuery,
  parseStudyDownloadInput,
  parseStudyNoteInput,
  parseStudyNotesQuery,
  parseStudyProgressInput,
  parseStudyProgressQuery,
  parseStudySearchQuery,
  recordStudentStudyDownload,
  removeStudentStudyBookmark,
  searchStudentStudyCenter,
  updateStudentStudyNote,
  upsertStudentStudyProgress
} from "./student-study-center.js";
import {
  listCbts,
  getCbtDetail,
  createCbt,
  updateCbt,
  deleteCbt,
  listQuestions,
  getQuestionDetail,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  addQuestionToCbt,
  removeQuestionFromCbt,
  duplicateCbt,
  publishCbt,
  unpublishCbt,
  getCbtResults,
  parseCbtFilters,
  parseQuestionFilters,
  parseCbtInput,
  parseQuestionInput
} from "./cbt-admin.js";
import {
  listStudentCbts,
  getCbtForStudent,
  startCbtAttempt,
  getCbtAttemptForStudent,
  saveCbtAnswer,
  submitCbtAttempt,
  getStudentCbtResults,
  getCbtAttemptResult,
  parseStartAttemptInput,
  parseSaveAnswerInput,
  parseSubmitAttemptInput
} from "./cbt-student.js";
import {
  exportAdminUsersCsv,
  getAdminUserMonthlyRegistrations,
  getAdminUserDetail,
  listAdminUsers,
  createAdminUser,
  parseAdminCreateUserInput,
  parseAdminUserFilters,
  parseAdminUserMonthlyRegistrationsQuery,
  parseAdminUserDeviceLimitInput,
  parseAdminUserPasswordInput,
  parseAdminUserProfileInput,
  parseAdminUserRolesInput,
  parseAdminUserStatusInput,
  resetAdminUserDevices,
  updateAdminUserDeviceLimitOverride,
  updateAdminUserPassword,
  updateAdminUserProfile,
  updateAdminUserRoles,
  updateAdminUserStatus
} from "./admin-users.js";
import { getAdminDashboardOverview } from "./admin-dashboard.js";
import {
  activateSubscriptionForUserByAdmin,
  getAdminBillingSnapshot,
  BillingConfigurationError,
  BillingOperationError,
  getUserSubscriptionSnapshot,
  initializeSubscriptionCheckout,
  listPublicSubscriptionPlans,
  parseAdminManualActivationInput,
  parseSubscriptionCheckoutInput,
  parseSubscriptionVerifyInput,
  verifySubscriptionPayment
} from "./subscriptions.js";
import {
  approveAllPendingContent,
  approveBarFinalExamMcqQuestion,
  approveBarFinalExamQuestion,
  approveLibraryMaterial,
  approveSubjectSummaryCase,
  approveSubjectSummaryEntry,
  declineBarFinalExamMcqQuestion,
  declineBarFinalExamQuestion,
  declineLibraryMaterial,
  declineSubjectSummaryCase,
  declineSubjectSummaryEntry,
  getAdminNotificationCenter,
  getSuperAdminApprovalQueue,
  markAdminNotificationsRead
} from "./admin-notifications.js";
import { dashboardSnapshot } from "./data/platform-data.js";
import { prisma } from "./lib/prisma.js";
import { isRefreshSessionActive, revokeUserSessions } from "./lib/sessions.js";
import { runInTransaction } from "./lib/transactions.js";

const passwordSchema = z
  .string()
  .trim()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password is too long.");

const emailSchema = z.string().trim().toLowerCase().email();

const signInSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    deviceName: z.string().trim().min(2).max(120).optional()
  })
  .strict();

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().trim().min(8).max(72),
    registrationRole: z.enum(["student", "lawyer"]).default("student"),
    deviceName: z.string().trim().min(2).max(120).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"]
      });
    }
  });

const refreshSchema = z
  .object({
    refreshToken: z.string().trim().min(16).max(512)
  })
  .strict();

const notDeletedDeviceWhere: Prisma.DeviceWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

const MAX_ACCOUNT_DEVICES = 3;

const verifyEmailQuerySchema = z
  .object({
    token: z.string().trim().min(24).max(4_000)
  })
  .strict();

const forgotPasswordSchema = z
  .object({
    email: emailSchema
  })
  .strict();

const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(24).max(4_000),
    password: passwordSchema,
    confirmPassword: z.string().trim().min(8).max(72)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"]
      });
    }
  });

const contactMessageSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80),
    email: emailSchema,
    subject: z.string().trim().min(2).max(120),
    message: z.string().trim().min(10).max(2000)
  })
  .strict();

const lawReportReadingSessionUpdateSchema = z
  .object({
    progressPct: z.coerce.number().min(0).max(100).optional(),
    timeSpentSeconds: z.coerce.number().int().min(0).max(60 * 60 * 24).optional()
  })
  .strict();

const declineApprovalSchema = z
  .object({
    reason: z.string().trim().min(3).max(500)
  })
  .strict();

const profileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80),
    phoneNumber: z.string().trim().regex(/^\+?[0-9\s\-()]{7,20}$/).optional().or(z.literal("")),
    avatarUrl: z.string().trim().max(2_000_000).optional().or(z.literal("")),
    sex: z.union([z.literal("MALE"), z.literal("FEMALE"), z.literal("")]).optional(),
    addressLine1: z.string().trim().min(4).max(120),
    addressLine2: z.string().trim().max(120).optional().or(z.literal("")),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    institutionState: z.string().trim().max(80).optional().or(z.literal("")),
    institutionName: z.string().trim().max(160).optional().or(z.literal("")),
    institutionOtherName: z.string().trim().max(160).optional().or(z.literal("")),
    postalCode: z.string().trim().min(3).max(20),
    country: z.string().trim().min(2).max(60)
  })
  .strict();

const userPasswordUpdateSchema = z
  .object({
    currentPassword: z.string().trim().min(1).max(120),
    password: passwordSchema,
    confirmPassword: z.string().trim().min(8).max(72)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"]
      });
    }
  });

type AppOptions = {
  useDatabase?: boolean;
  allowAuthFallback?: boolean;
};

type ApiUser = {
  id: string;
  fullName: string;
  email: string;
  emailVerifiedAt: string | null;
  roleCodes: string[];
  institutionId: string;
  twoFactorEnabled: boolean;
  avatarUrl?: string | null;
  sex?: "MALE" | "FEMALE" | null;
  phoneNumber?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  institutionState?: string | null;
  institutionName?: string | null;
  institutionOtherName?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

type SessionResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: ApiUser;
};

const userRelationsInclude = Prisma.validator<Prisma.UserInclude>()({
  roles: {
    include: {
      role: true
    }
  },
  student: true
});

const sessionUserSelect = {
  id: true,
  fullName: true,
  email: true,
  emailVerifiedAt: true,
  status: true,
  sessionsRevokedAt: true,
  twoFactorEnabled: true,
  avatarUrl: true,
  sex: true,
  phoneNumber: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  institutionState: true,
  institutionName: true,
  institutionOtherName: true,
  postalCode: true,
  country: true,
  roles: {
    include: {
      role: true
    }
  },
  student: true
};

const refreshSessionInclude = Prisma.validator<Prisma.SessionInclude>()({
  user: {
    select: sessionUserSelect
  }
});

type UserWithRelations = Prisma.UserGetPayload<{
  include: typeof userRelationsInclude;
}>;

type UserForSessionPayload = Prisma.UserGetPayload<{
  select: typeof sessionUserSelect;
}>;

type RefreshSessionWithUser = Prisma.SessionGetPayload<{
  include: typeof refreshSessionInclude;
}>;

type RefreshSessionState = {
  createdAt: Date;
  deletedAt: Date | null;
  expiresAt: Date;
  refreshHash: string;
  userId: string;
  user: {
    status: string;
    sessionsRevokedAt?: Date | null;
  };
};

type AuthenticatedRequest = Request & {
  auth?: {
    userId: string;
    roleCodes: string[];
  };
};

const adminRoleCodes = new Set([
  "super_admin",
  "administrator",
  "academic_administrator",
  "finance_officer",
  "moderator",
  "content_admin"
]);

function hasRole(roleCodes: string[] = [], targetRoleCode: string) {
  return roleCodes.includes(targetRoleCode);
}

function isContentAdminRole(roleCodes: string[] = []) {
  return hasRole(roleCodes, "content_admin");
}

function canAccessPaymentsRole(roleCodes: string[] = []) {
  return roleCodes.some((roleCode) => adminRoleCodes.has(roleCode)) && !isContentAdminRole(roleCodes);
}

function canModerateHelarConnectRole(roleCodes: string[] = []) {
  return roleCodes.some((roleCode) => ["super_admin", "moderator", "content_admin"].includes(roleCode));
}

function getJwtSecret() {
  return process.env.JWT_SECRET ?? "change-me";
}

function getPublicApiBaseUrl() {
  return (
    process.env.API_PUBLIC_BASE_URL?.trim() ||
    process.env.VITE_API_BASE_URL?.trim() ||
    `http://localhost:${process.env.PORT ?? 4000}`
  );
}

function getPublicWebBaseUrl() {
  return (
    process.env.APP_PUBLIC_BASE_URL?.trim() ||
    process.env.WEB_PUBLIC_BASE_URL?.trim() ||
    process.env.VITE_APP_BASE_URL?.trim() ||
    "http://localhost:5173"
  );
}

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  if (value == null) {
    return "";
  }

  const normalizedValue = String(value);

  if (/["\n,]/.test(normalizedValue)) {
    return `"${normalizedValue.replace(/"/g, "\"\"")}"`;
  }

  return normalizedValue;
}

function createEmailVerificationToken(userId: string, email: string) {
  return jwt.sign(
    {
      sub: userId,
      email,
      purpose: "email_verification"
    },
    getJwtSecret(),
    { expiresIn: "24h" }
  );
}

function createEmailVerificationUrl(token: string) {
  return `${getPublicApiBaseUrl()}/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`;
}

function createPasswordResetToken(userId: string, email: string) {
  return jwt.sign(
    {
      sub: userId,
      email,
      purpose: "password_reset"
    },
    getJwtSecret(),
    { expiresIn: "1h" }
  );
}

function createPasswordResetUrl(token: string) {
  return `${getPublicWebBaseUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`;
}

function isPasswordResetDatabaseError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2010" || error.message.includes("Server selection timeout");
  }

  return false;
}

function buildFallbackUser(email: string, overrides?: Partial<ApiUser>): ApiUser {
  const localPart = email.split("@")[0]?.toLowerCase() ?? "student";

  const baseUser =
    localPart.includes("admin")
      ? {
          id: "admin-demo-user",
          fullName: "Helar Administrator",
          roleCodes: ["administrator"],
          institutionId: "institution-helar-admin"
        }
      : {
          id: "student-demo-user",
          fullName: "Adaeze Okonkwo",
          roleCodes: ["student"],
          institutionId: "institution-helar-demo"
        };

  return {
    ...baseUser,
    email,
    emailVerifiedAt: null,
    twoFactorEnabled: true,
    ...overrides
  };
}

class DeviceLimitError extends Error {
  code = "DEVICE_LIMIT_REACHED";
  statusCode = 403;

  constructor(limit: number) {
    super(
      `You can only use Helar on up to ${limit} devices. Please continue on one of your existing devices or contact support for help.`
    );
  }
}

function resolveAccountDeviceLimit(deviceLimitOverride: number | null | undefined) {
  const overrideValue = Number.isFinite(deviceLimitOverride) ? Number(deviceLimitOverride) : NaN;
  const normalizedOverride = Number.isInteger(overrideValue) ? overrideValue : NaN;
  const limit = Number.isFinite(normalizedOverride) ? normalizedOverride : MAX_ACCOUNT_DEVICES;

  return Math.max(1, limit);
}

function shouldEnforceAccountDeviceLimit(roleCodes: string[] = []) {
  if (roleCodes.includes("super_admin") || roleCodes.includes("content_admin")) {
    return false;
  }

  return roleCodes.includes("student") || roleCodes.includes("lawyer");
}

function createDatabaseFallbackErrorMessage() {
  return "The MongoDB database is not ready yet. Helar is using the temporary auth fallback so you can keep working."
}

type DatabaseErrorClassification =
  | "NO_USERS"
  | "DATABASE_UNREACHABLE"
  | "AUTH_SCHEMA_MISMATCH"
  | "UNKNOWN";

// Best-effort classifier for exceptions thrown during sign-in flow. Used to
// tailor the user-facing error instead of blanket "seed the users" messages.
function classifyDatabaseError(error: unknown): DatabaseErrorClassification {
  const message = error instanceof Error ? error.message : String(error ?? "");

  // Prisma connection / network errors.
  if (/P\d{4}/.test(message) && /(client version|connection|could not connect|reach|timed out|ETIMEDOUT|ECONNREFUSED|MongoNetworkError)/i.test(message)) {
    return "DATABASE_UNREACHABLE";
  }
  if (/(MongoNetworkError|failed to connect|server selection|connection error|no valid endpoints|DATABASE_URL)/i.test(message)) {
    return "DATABASE_UNREACHABLE";
  }

  // Prisma validation errors (schema/relation mismatches between code and DB).
  if (/P20(09|10|11|12|13|14|24|25|30|32)/.test(message) || /Unknown.*field|Invalid.*include|selection set/i.test(message)) {
    return "AUTH_SCHEMA_MISMATCH";
  }

  // "No users" heuristic — only reliable when the error explicitly mentions an
  // empty collection or missing data, since `findUnique` returning null never
  // throws (it's handled in persistSignIn and returns 401 instead).
  if (/(no users|no records|0 users|seed the users|User collection)/i.test(message)) {
    return "NO_USERS";
  }

  return "UNKNOWN";
}

type AdminLibraryFailureClassification =
  | "REPORT_NUMBER_COLLISION"
  | "REPORT_SEQUENCE_EXHAUSTED"
  | "LIBRARY_CATEGORY_MISSING"
  | "LIBRARY_MATERIAL_TYPE_MISMATCH"
  | "LIBRARY_BODY_TOO_LARGE"
  | "LIBRARY_PAYLOAD_TOO_LARGE"
  | "CHUNK_BUFFER_MISSING"
  | "CHUNK_TRANSPORT_FAILED"
  | "UNIQUE_CONSTRAINT_VIOLATION"
  | "TRANSACTION_CONFLICT"
  | "DATABASE_UNAVAILABLE"
  | "UNKNOWN";

// Translate a caught library-write exception into a human-usable category.
// The response surfaces the raw `message` on 4xx and a user-safe hint on 5xx,
// while the server keeps the full error in console.error for forensics.
function classifyAdminLibraryWriteError(error: unknown): AdminLibraryFailureClassification {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      // P2002 = unique-constraint violation. Distinguish three sub-classes
      // because the user-facing guidance differs dramatically:
      //   (1) reportNumber collision → "auto-assign next number on retry"
      //   (2) other unique field (storageUrl / slug / id) → "this link/ID already
      //       exists" (NEVER accuse them of concurrent upload)
      //   (3) unknown meta shape → still unique constraint, not a transaction
      //       conflict; surface a safe generic "entry already exists" message.
      const targetPieces: string[] = [];
      const rawTarget = (error.meta as { target?: unknown })?.target;
      if (Array.isArray(rawTarget)) targetPieces.push(rawTarget.map(String).join(","));
      else if (typeof rawTarget === "string") targetPieces.push(rawTarget);
      const metaKeys =
        error.meta && typeof error.meta === "object"
          ? Object.values(error.meta)
              .map((value) => (typeof value === "string" ? value : Array.isArray(value) ? value.join(",") : ""))
              .filter(Boolean)
          : [];
      try {
        targetPieces.push(JSON.stringify(error.meta ?? {}));
      } catch {
        /* non-serialisable meta — ignore */
      }
      targetPieces.push(...metaKeys);
      if (typeof error.message === "string") targetPieces.push(error.message);
      const fingerprint = targetPieces.join(" | ");
      if (/reportNumber|report_number|report-number/i.test(fingerprint)) return "REPORT_NUMBER_COLLISION";
      return "UNIQUE_CONSTRAINT_VIOLATION";
    }
    // P2034: transaction conflict due to write/write races (stale snapshot).
    // P2024: "Transaction API error" — tx lifecycle errors, which MongoDB Atlas
    //        raises on multi-doc tx under high load (e.g. expired tx lifetime).
    // P2028: "Transaction API error" alternate Prisma variant.
    if (error.code === "P2034" || error.code === "P2024" || error.code === "P2028") return "TRANSACTION_CONFLICT";
    // P1xxx: client/connection-level failures common on slow Atlas clusters.
    if (
      error.code === "P2021" ||
      error.code === "P2022" ||
      error.code === "P1000" ||
      error.code === "P1001" ||
      error.code === "P1002" ||
      error.code === "P1008" ||
      error.code === "P1010" ||
      error.code === "P1011" ||
      error.code === "P1012" ||
      error.code === "P1013" ||
      error.code === "P1014" ||
      error.code === "P1015" ||
      error.code === "P1016" ||
      error.code === "P1017"
    ) {
      return "DATABASE_UNAVAILABLE";
    }
    // P2020: Value is out of range for the type / column too short.
    // P2023: Inconsistent column data.
    // P2000: Provided value is too long for the column. This typically means
    //        a MongoDB string overflowed a 16MB BSON cap or a driver-level
    //        buffer.
    if (error.code === "P2000" || error.code === "P2020" || error.code === "P2023") return "LIBRARY_BODY_TOO_LARGE";
  }

  // Prisma also has a ValidationError + UnknownRequestError raised when the
  // driver-level rejects a query. Any mention of size/bson/max-document maps
  // to LIBRARY_BODY_TOO_LARGE so the admin sees the 413 guidance toast.
  if (
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      /BSONObj size|document is larger than|exceeds max bson size|16.?MB|BSON document too large|too long|exceeds the maximum/i.test(msg)
    ) {
      return "LIBRARY_BODY_TOO_LARGE";
    }
  }

  if (error instanceof Error) {
    const msg = error.message;
    if (/REPORT_NUMBER_COLLISION/i.test(msg)) return "REPORT_NUMBER_COLLISION";
    if (/LAW_REPORT_SEQUENCE_EXHAUSTED/i.test(msg)) return "REPORT_SEQUENCE_EXHAUSTED";
    if (/LIBRARY_CATEGORY_NOT_FOUND/i.test(msg)) return "LIBRARY_CATEGORY_MISSING";
    if (/LIBRARY_MATERIAL_TYPE_INVALID|SECTION_MATERIAL_TYPE/i.test(msg)) return "LIBRARY_MATERIAL_TYPE_MISMATCH";
    if (/LIBRARY_BODY_EXCEEDS_MAX_SIZE/i.test(msg)) return "LIBRARY_BODY_TOO_LARGE";
    if (/LIBRARY_PAYLOAD_TOO_LARGE/i.test(msg)) return "LIBRARY_PAYLOAD_TOO_LARGE";
    // Chunk transport buffer errors — explicit so the admin can retry without
    // guessing which step failed (append, finalize, or missing transport step).
    if (/LIBRARY_BODY_CHUNK_BUFFER_MISSING|LIBRARY_SUMMARY_CHUNK_BUFFER_MISSING/i.test(msg)) {
      return "CHUNK_BUFFER_MISSING";
    }
    if (/LIBRARY_CHUNK_CONTENT_EMPTY|LIBRARY_CHUNK_TOO_LARGE|LIBRARY_CHUNK_FIELD_INVALID|LIBRARY_CHUNK_INDEX_INVALID/i.test(msg)) {
      return "CHUNK_TRANSPORT_FAILED";
    }
    if (/SERIALIZABLE_WRITE_FAILED/i.test(msg)) return "TRANSACTION_CONFLICT";
    // MongoServer / native Node driver messages for tx-related failures —
    // Prisma often re-wraps these as Error (not KnownRequestError) on slow tx.
    if (
      /Transaction .*? (aborted|expired|timed out|cancelled)|NoSuchTransaction|RetryableWriteError|WriteConflict/i.test(msg)
    ) {
      return "TRANSACTION_CONFLICT";
    }
    if (
      /not authorized|requires authentication|AuthenticationFailed|connection closed|connection.*refused|socket hang up|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND/i.test(msg)
    ) {
      return "DATABASE_UNAVAILABLE";
    }
  }

  const msg = String(error instanceof Error ? error.message : error);
  // Express body-parser raises SyntaxError with 'request entity too large' when a
  // JSON request exceeds the size cap. Map it directly so users see "Your report is
  // too large" instead of a generic 500.
  if (/request entity too large|payload too large|entity.too.large/i.test(msg)) return "LIBRARY_PAYLOAD_TOO_LARGE";
  // MongoDB + Prisma driver raise one of several messages when a single BSON doc
  // exceeds the architectural 16MB cap. A very large 26-page MS-Word HTML import
  // can occasionally still trigger this even with chunking if the 1MB "safe head"
  // combines with other fields (metadata, indexed fields) to edge over 16MB; when
  // it does, classify it explicitly so the user gets a clear hint rather than the
  // generic "Could not create law report" toast.
  if (
    /BSONObj size|document is larger than|exceeds max bson size|16.?MB|BSON document too large/i.test(msg)
  ) {
    return "LIBRARY_BODY_TOO_LARGE";
  }
  if (/MongoNetworkError|ECONNRESET|connection/i.test(msg)) return "DATABASE_UNAVAILABLE";

  return "UNKNOWN";
}

function buildAdminLibraryFailureResponse(
  classification: AdminLibraryFailureClassification,
  error: unknown,
  fallbackMessage: string
): { status: number; code: string; message: string } {
  const rawMessage = error instanceof Error ? error.message : fallbackMessage;

  switch (classification) {
    case "REPORT_NUMBER_COLLISION":
      return {
        status: 409,
        code: "LAW_REPORT_NUMBER_COLLISION",
        message:
          "The generated law report number collided with an existing record. This usually happens when another admin saves at nearly the same moment. Wait 3–5 seconds, then click Save again — the server will assign the next available Helar-{year}-N number automatically."
      };
    case "REPORT_SEQUENCE_EXHAUSTED":
      return {
        status: 409,
        code: "LAW_REPORT_SEQUENCE_EXHAUSTED",
        message: "Unable to generate a unique law report number. Please contact support."
      };
    case "LIBRARY_CATEGORY_MISSING":
      return {
        status: 400,
        code: "LIBRARY_CATEGORY_NOT_FOUND",
        message: "The requested library section does not exist. Please refresh and try again."
      };
    case "LIBRARY_MATERIAL_TYPE_MISMATCH":
      return {
        status: 400,
        code: "LIBRARY_MATERIAL_TYPE_INVALID",
        message: rawMessage
      };
    case "LIBRARY_BODY_TOO_LARGE":
      return {
        status: 413,
        code: "LIBRARY_BODY_TOO_LARGE",
        message:
          "The report content is too large to save in a single document. Please reduce embedded images or split the report into smaller sections, then try again."
      };
    case "LIBRARY_PAYLOAD_TOO_LARGE":
      return {
        status: 413,
        code: "LIBRARY_PAYLOAD_TOO_LARGE",
        message:
          "The report you tried to upload is too large for a single request. Please reduce embedded images, remove base64 attachments, or split the report into smaller records, then try again."
      };
    case "CHUNK_BUFFER_MISSING":
      return {
        status: 400,
        code: "LIBRARY_CHUNK_BUFFER_MISSING",
        message:
          "The uploaded transport chunks could not be found for this material. Please re-paste the report (the browser may have navigated away mid-upload) and try again."
      };
    case "CHUNK_TRANSPORT_FAILED":
      return {
        status: 400,
        code: "LIBRARY_CHUNK_TRANSPORT_FAILED",
        message:
          rawMessage && rawMessage.trim().length > 0
            ? `One of the transport chunks failed to upload: ${rawMessage.trim().slice(0, 220)}`
            : "One of the transport chunks failed to upload. Please retry."
      };
    case "UNIQUE_CONSTRAINT_VIOLATION": {
      // P2002 on a *non-reportNumber* field (storageUrl, slug, id, etc.). We
      // avoid the misleading "another admin uploading" copy and instead name
      // the field(s) involved so the admin knows exactly what to fix.
      let fieldHint = "";
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.meta &&
        typeof error.meta === "object"
      ) {
        const raw = (error.meta as { target?: unknown }).target;
        const pieces = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? [raw] : [];
        const clean = pieces
          .map((piece) => piece.replace(/StudyMaterial_/g, "").replace(/_key$/g, ""))
          .filter(Boolean);
        if (clean.length > 0) fieldHint = clean.join(", ");
      }
      const friendly =
        fieldHint && /storageUrl|storage_url|storage-url/i.test(fieldHint)
          ? "The PDF link / storage URL you entered is already attached to an existing library entry. Please use a different URL or edit the existing record instead."
          : fieldHint && /slug|title/i.test(fieldHint)
            ? `A library entry with the same ${fieldHint} already exists. Please use a different ${fieldHint}.`
            : fieldHint
              ? `A library entry with the same ${fieldHint} already exists. Please adjust that field and try again.`
              : "A library entry with matching unique fields already exists. Please check the PDF link / suit number and try again.";
      return {
        status: 409,
        code: "LIBRARY_UNIQUE_CONSTRAINT_VIOLATION",
        message: friendly
      };
    }
    case "TRANSACTION_CONFLICT":
      return {
        status: 409,
        code: "LIBRARY_TRANSACTION_CONFLICT",
        message:
          "The save couldn't be committed right now. This usually means a momentary race with another write — wait 3–5 seconds then click Save again. If the problem persists, refresh the page and try once more."
      };
    case "DATABASE_UNAVAILABLE":
      return {
        status: 503,
        code: "DATABASE_UNAVAILABLE",
        message: "Database connection lost. Please try again in a moment."
      };
    case "UNKNOWN":
    default: {
      // We append the raw server error message to the safe fallback. Admins are
      // trusted users and the Prisma/Mongo driver message often contains the
      // fix they need (e.g. "Transaction 60s lifetime exceeded" vs a generic
      // "could not create"). We also keep it short — max 280 chars — so the
      // toast remains scannable.
      const rawTail = rawMessage ? rawMessage.trim() : "";
      const clippedTail = rawTail.length > 280 ? `${rawTail.slice(0, 280)}…` : rawTail;
      return {
        status: 500,
        code: fallbackMessage.includes("update")
          ? "ADMIN_LIBRARY_UPDATE_FAILED"
          : fallbackMessage.includes("remove")
            ? "ADMIN_LIBRARY_DELETE_FAILED"
            : "ADMIN_LIBRARY_CREATE_FAILED",
        message: clippedTail ? `${fallbackMessage} (${clippedTail})` : fallbackMessage
      };
    }
  }
}

async function registerUserDevice(
  tx: Prisma.TransactionClient,
  userId: string,
  rawDeviceName: string | undefined,
  roleCodes?: string[]
) {
  const deviceName = rawDeviceName?.trim();

  if (!deviceName) {
    return;
  }

  const existingDevice = await tx.device.findFirst({
    where: {
      ...notDeletedDeviceWhere,
      name: deviceName,
      userId
    },
    select: {
      id: true
    }
  });

  if (existingDevice) {
    await tx.device.update({
      where: { id: existingDevice.id },
      data: {
        lastSeenAt: new Date()
      }
    });
    return;
  }

  const resolvedRoleCodes =
    roleCodes ??
    (
      await tx.user
        .findUnique({
          where: { id: userId },
          select: {
            roles: {
              select: {
                role: {
                  select: {
                    code: true
                  }
                }
              }
            }
          }
        })
        .then((user) => user?.roles.map((item) => item.role.code) ?? [])
    );

  if (shouldEnforceAccountDeviceLimit(resolvedRoleCodes)) {
    const registeredDeviceCount = await tx.device.count({
      where: {
        ...notDeletedDeviceWhere,
        userId
      }
    });

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { deviceLimitOverride: true }
    });
    const deviceLimit = resolveAccountDeviceLimit(user?.deviceLimitOverride);

    if (registeredDeviceCount >= deviceLimit) {
      throw new DeviceLimitError(deviceLimit);
    }
  }

  await tx.device.create({
    data: {
      userId,
      name: deviceName,
      lastSeenAt: new Date()
    }
  });
}

function createAccessToken(user: ApiUser) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      roleCodes: user.roleCodes
    },
    getJwtSecret(),
    { expiresIn: "15m" }
  );
}

async function createRefreshToken(userId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const refreshSecret = crypto.randomBytes(48).toString("hex");
  const refreshHash = await bcrypt.hash(refreshSecret, 10);

  const session = await db.session.create({
    data: {
      userId,
      refreshHash,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
    }
  });

  return `${session.id}.${refreshSecret}`;
}

function createSessionPayload(user: ApiUser, refreshToken: string): SessionResponse {
  return {
    accessToken: createAccessToken(user),
    refreshToken,
    expiresIn: 900,
    user
  };
}

function createFallbackSession(user: ApiUser) {
  return createSessionPayload(user, `demo-refresh-token:${encodeURIComponent(user.email)}`);
}

function createRateLimiter(maxRequests: number, windowMs: number) {
  const requestWindow = new Map<string, { count: number; resetAt: number }>();

  return (request: Request, response: Response, next: NextFunction) => {
    const forwardedFor = request.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(",")[0];
    const clientKey = `${forwardedIp ?? request.ip ?? "unknown"}:${request.path}`;
    const now = Date.now();
    const entry = requestWindow.get(clientKey);

    if (!entry || entry.resetAt <= now) {
      requestWindow.set(clientKey, {
        count: 1,
        resetAt: now + windowMs
      });
      return next();
    }

    if (entry.count >= maxRequests) {
      return response.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many authentication attempts. Please wait a moment and try again."
        }
      });
    }

    entry.count += 1;
    requestWindow.set(clientKey, entry);
    return next();
  };
}

function authenticateRequest(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return response.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "A valid access token is required."
      }
    });
  }

  try {
    const token = authorizationHeader.slice("Bearer ".length);
    const payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;

    if (typeof payload.sub !== "string") {
      throw new Error("Missing token subject");
    }

    const roleCodes = Array.isArray(payload.roleCodes)
      ? payload.roleCodes.filter((roleCode): roleCode is string => typeof roleCode === "string")
      : [];

    request.auth = {
      userId: payload.sub,
      roleCodes
    };

    return next();
  } catch {
    return response.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Your access token is invalid or expired."
      }
    });
  }
}

function attachOptionalAuth(request: AuthenticatedRequest, _response: Response, next: NextFunction) {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return next();
  }

  try {
    const token = authorizationHeader.slice("Bearer ".length);
    const payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;

    if (typeof payload.sub === "string") {
      request.auth = {
        userId: payload.sub,
        roleCodes: Array.isArray(payload.roleCodes)
          ? payload.roleCodes.filter((roleCode): roleCode is string => typeof roleCode === "string")
          : []
      };
    }
  } catch {
    request.auth = undefined;
  }

  return next();
}

function readRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function requireAdminRequest(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  if (!request.auth?.roleCodes.some((roleCode) => adminRoleCodes.has(roleCode))) {
    return response.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Administrator access is required."
      }
    });
  }

  return next();
}

function requireSuperAdminRequest(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  if (!request.auth?.roleCodes.includes("super_admin")) {
    return response.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Super admin access is required."
      }
    });
  }

  return next();
}

function forbidJudgeRequest(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  if (request.auth?.roleCodes.includes("judge")) {
    return response.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "CBT access is not available for this role."
      }
    });
  }

  return next();
}

function requirePaymentAccessRequest(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  if (!canAccessPaymentsRole(request.auth?.roleCodes)) {
    return response.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Payment access is not available for this role."
      }
    });
  }

  return next();
}

function requireHelarConnectModeratorRequest(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  if (!canModerateHelarConnectRole(request.auth?.roleCodes)) {
    return response.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Helar Connect moderator access is required."
      }
    });
  }

  return next();
}

function normalizeUser(user: UserWithRelations | UserForSessionPayload): ApiUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    roleCodes: user.roles.map((userRole) => userRole.role.code),
    institutionId: user.student?.id ?? `institution-${user.id}`,
    twoFactorEnabled: user.twoFactorEnabled,
    avatarUrl: user.avatarUrl,
    sex: user.sex,
    phoneNumber: user.phoneNumber,
    addressLine1: user.addressLine1,
    addressLine2: user.addressLine2,
    city: user.city,
    state: user.state,
    institutionState: user.institutionState,
    institutionName: user.institutionName,
    institutionOtherName: user.institutionOtherName,
    postalCode: user.postalCode,
    country: user.country
  };
}

async function ensureRole(code: string, name: string) {
  return prisma.role.upsert({
    where: { code },
    update: { name },
    create: { code, name }
  });
}

async function persistRegister(payload: z.infer<typeof registerSchema>) {
  const existingUser = await prisma.user.findUnique({
    where: { email: payload.email }
  });

  if (existingUser) {
    return {
      status: 409 as const,
      body: {
        success: false,
        error: {
          code: "EMAIL_IN_USE",
          message: "An account with this email already exists."
        }
      }
    };
  }

  const selectedRole = await ensureRole(
    payload.registrationRole,
    payload.registrationRole === "lawyer" ? "Lawyer" : "Student"
  );
  const passwordHash = await bcrypt.hash(payload.password, 10);

  const createdSession = await runInTransaction(async (tx: Prisma.TransactionClient) => {
    const createdUser = await tx.user.create({
      data: {
        email: payload.email,
        fullName: payload.fullName,
        passwordHash,
        status: "ACTIVE",
        emailVerifiedAt: null,
        country: "Nigeria",
        state: "Lagos",
        roles: {
          create: {
            roleId: selectedRole.id
          }
        },
        student: payload.registrationRole === "student" ? { create: {} } : undefined
      },
      include: userRelationsInclude
    });

    await registerUserDevice(
      tx,
      createdUser.id,
      payload.deviceName,
      createdUser.roles.map((userRole) => userRole.role.code)
    );

    const refreshToken = await createRefreshToken(createdUser.id, tx);

    return {
      refreshToken,
      user: createdUser
    };
  });

  const apiUser = normalizeUser(createdSession.user);
  const emailVerificationToken = createEmailVerificationToken(createdSession.user.id, createdSession.user.email);
  const emailVerificationUrl = createEmailVerificationUrl(emailVerificationToken);

  try {
    await sendRegistrationVerificationEmails({
      email: createdSession.user.email,
      fullName: createdSession.user.fullName,
      roleCodes: [payload.registrationRole],
      verificationUrl: emailVerificationUrl
    });
  } catch (error) {
    console.error("Failed to send registration verification emails:", error);
  }

  return {
    status: 201 as const,
    body: {
      success: true,
      data: createSessionPayload(apiUser, createdSession.refreshToken)
    }
  };
}

async function persistSignIn(payload: z.infer<typeof signInSchema>) {
  const user = await prisma.user.findUnique({
    where: { email: payload.email },
    include: userRelationsInclude
  });

  if (!user?.passwordHash) {
    return {
      status: 401 as const,
      body: {
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email or password is incorrect."
        }
      }
    };
  }

  const passwordMatches = await bcrypt.compare(payload.password, user.passwordHash);

  if (!passwordMatches || user.status !== "ACTIVE") {
    return {
      status: 401 as const,
      body: {
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email or password is incorrect."
        }
      }
    };
  }

  const signedInSession = await runInTransaction(async (tx: Prisma.TransactionClient) => {
    await registerUserDevice(
      tx,
      user.id,
      payload.deviceName,
      user.roles.map((userRole) => userRole.role.code)
    );

    const refreshToken = await createRefreshToken(user.id, tx);

    return {
      refreshToken
    };
  });

  const apiUser = normalizeUser(user);

  return {
    status: 200 as const,
    body: {
      success: true,
      data: createSessionPayload(apiUser, signedInSession.refreshToken)
    }
  };
}

async function findRefreshSession(refreshToken: string) {
  const now = new Date();
  const [sessionId, refreshSecret] = refreshToken.includes(".") ? refreshToken.split(".", 2) : [null, null];

  if (sessionId && refreshSecret) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: refreshSessionInclude
    });

    if (
      session &&
      isRefreshSessionActive(session as RefreshSessionState, now) &&
      (await bcrypt.compare(refreshSecret, session.refreshHash))
    ) {
      return session;
    }
  }

  const activeSessions = await prisma.session.findMany({
    where: {
      deletedAt: null,
      expiresAt: {
        gt: now
      }
    },
    include: refreshSessionInclude
  });

  for (const session of activeSessions) {
    if (
      isRefreshSessionActive(session as RefreshSessionState, now) &&
      (await bcrypt.compare(refreshToken, session.refreshHash))
    ) {
      return session;
    }
  }

  return null;
}

async function persistRefreshSession(refreshToken: string) {
  const session = (await findRefreshSession(refreshToken)) as RefreshSessionWithUser | null;

  if (!session || session.user.status !== "ACTIVE") {
    return null;
  }

  return runInTransaction(async (tx: Prisma.TransactionClient) => {
    await tx.session.update({
      where: { id: session.id },
      data: {
        deletedAt: new Date()
      }
    });

    const nextRefreshToken = await createRefreshToken(session.userId, tx);
    const refreshedUser = await tx.user.findUnique({
      where: { id: session.userId },
      select: sessionUserSelect
    });

    if (!refreshedUser || refreshedUser.status !== "ACTIVE") {
      return null;
    }

    return createSessionPayload(normalizeUser(refreshedUser), nextRefreshToken);
  });
}

async function persistForgotPassword(payload: z.infer<typeof forgotPasswordSchema>) {
  const successBody = {
    success: true,
    data: {
      message: "If an account exists for that email, a password reset link has been sent."
    }
  } as const;

  const user = await prisma.user.findUnique({
    where: { email: payload.email },
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
      deletedAt: true,
      passwordHash: true
    }
  });

  // Always return a generic success payload so callers cannot enumerate accounts.
  if (!user || user.deletedAt || user.status !== "ACTIVE" || !user.passwordHash) {
    return {
      status: 200 as const,
      body: successBody
    };
  }

  const resetToken = createPasswordResetToken(user.id, user.email);
  const resetUrl = createPasswordResetUrl(resetToken);

  try {
    await sendPasswordResetEmail({
      email: user.email,
      fullName: user.fullName,
      resetUrl
    });
  } catch (error) {
    console.error("Failed to send password reset email:", error);
  }

  return {
    status: 200 as const,
    body: successBody
  };
}

async function persistResetPassword(payload: z.infer<typeof resetPasswordSchema>) {
  const tokenPayload = jwt.verify(payload.token, getJwtSecret()) as jwt.JwtPayload;

  if (tokenPayload.purpose !== "password_reset" || typeof tokenPayload.sub !== "string") {
    return {
      status: 400 as const,
      body: {
        success: false,
        error: {
          code: "INVALID_RESET_TOKEN",
          message: "The password reset link is invalid."
        }
      }
    };
  }

  if (typeof tokenPayload.iat !== "number") {
    return {
      status: 400 as const,
      body: {
        success: false,
        error: {
          code: "INVALID_RESET_TOKEN",
          message: "The password reset link is invalid."
        }
      }
    };
  }

  const userSelect = {
    id: true,
    deletedAt: true,
    status: true,
    updatedAt: true
  } as const;

  const user = tokenPayload.sub.includes("@")
    ? await prisma.user.findUnique({
        where: { email: tokenPayload.sub },
        select: userSelect
      })
    : await prisma.user.findUnique({
        where: { id: tokenPayload.sub },
        select: userSelect
      });

  if (!user || user.deletedAt || user.status !== "ACTIVE") {
    return {
      status: 400 as const,
      body: {
        success: false,
        error: {
          code: "INVALID_RESET_TOKEN",
          message: "The password reset link is invalid."
        }
      }
    };
  }

  const tokenIssuedAt = new Date(tokenPayload.iat * 1000);

  if (user.updatedAt.getTime() > tokenIssuedAt.getTime()) {
    return {
      status: 400 as const,
      body: {
        success: false,
        error: {
          code: "RESET_LINK_ALREADY_USED",
          message: "This password reset link has already been used or is no longer valid."
        }
      }
    };
  }

  const passwordHash = await bcrypt.hash(payload.password, 10);

  await runInTransaction(async (tx: Prisma.TransactionClient) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash
      }
    });

    await revokeUserSessions(tx, user.id);
  });

  return {
    status: 200 as const,
    body: {
      success: true,
      data: {
        message: "Your password has been updated successfully. You can now sign in with your new password."
      }
    }
  };
}

async function persistProfileUpdate(userId: string, payload: z.infer<typeof profileSchema>) {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      fullName: payload.fullName,
      phoneNumber: payload.phoneNumber || null,
      avatarUrl: payload.avatarUrl || null,
      sex: payload.sex ? (payload.sex as "MALE" | "FEMALE") : null,
      addressLine1: payload.addressLine1,
      addressLine2: payload.addressLine2 || null,
      city: payload.city,
      state: payload.state,
      institutionState: payload.institutionState || null,
      institutionName: payload.institutionName || null,
      institutionOtherName: payload.institutionOtherName || null,
      postalCode: payload.postalCode,
      country: payload.country
    },
    include: userRelationsInclude
  });

  return normalizeUser(updatedUser);
}

async function persistUserPasswordUpdate(userId: string, payload: z.infer<typeof userPasswordUpdateSchema>) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      deletedAt: true,
      passwordHash: true,
      status: true
    }
  });

  if (!user || user.deletedAt || user.status !== "ACTIVE" || !user.passwordHash) {
    return {
      status: 404 as const,
      body: {
        success: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "We could not update your password for this account."
        }
      }
    };
  }

  const currentPasswordMatches = await bcrypt.compare(payload.currentPassword, user.passwordHash);

  if (!currentPasswordMatches) {
    return {
      status: 400 as const,
      body: {
        success: false,
        error: {
          code: "CURRENT_PASSWORD_INCORRECT",
          message: "Your current password is incorrect."
        }
      }
    };
  }

  const passwordHash = await bcrypt.hash(payload.password, 10);

  await runInTransaction(async (tx: Prisma.TransactionClient) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash
      }
    });

    await revokeUserSessions(tx, user.id);
  });

  return {
    status: 200 as const,
    body: {
      success: true,
      data: {
        message: "Your password has been updated successfully."
      }
    }
  };
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const useDatabase = options.useDatabase ?? true;
  const allowAuthFallback = options.allowAuthFallback ?? false;

  app.use(cors());
  app.use(helmet());

  // Admin library material transport chunk endpoints. Huge Word-HTML pastes
  // split at 500 KB on the frontend are uploaded here as individual plain-
  // text chunks so express.json() never has to JSON.parse a multi-megabyte
  // body string (which would allocate 3-5× the raw size and OOM 512 MB
  // Render workers, returning an empty-bodied 500 the frontend cannot
  // surface). These endpoints read the request with the plain-text body
  // parser, capped to 1 MB per chunk (generous headroom vs 500 KB threshold).
  // Authentication: admin-level only (same as material create/update).
  const MAX_CHUNK_BODY_BYTES = 4 * 1024 * 1024;
  const textBodyParser = express.text({ limit: MAX_CHUNK_BODY_BYTES, defaultCharset: "utf-8", type: "*/*" });

  app.post(
    "/api/v1/admin/library/:section/materials/_chunks/:field/:index",
    authenticateRequest,
    requireAdminRequest,
    textBodyParser,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the admin library workspace."
          }
        });
      }
      try {
        const result = await appendAdminLibraryChunkBuffer(
          typeof request.query.token === "string" ? request.query.token : undefined,
          String(request.params.field),
          String(request.params.index),
          typeof request.body === "string" ? request.body : ""
        );
        return response.status(200).json({ success: true, data: result });
      } catch (error) {
        // Log the full error + request identity so admins can chase 400s in
        // Render service logs. On chunk routes, the request is small (< 1 MB),
        // so we can afford a bit of structured logging.
        console.error(
          "[admin-library-chunk-append] failure",
          {
            actorUserId: (request as { auth?: { userId?: unknown } }).auth?.userId ?? null,
            field: request.params.field,
            index: request.params.index,
            hasToken: Boolean(typeof request.query.token === "string" && request.query.token.length > 0),
            contentLength: typeof request.body === "string" ? request.body.length : typeof request.body,
            errorName: error instanceof Error ? error.name : typeof error,
            errorCode:
              error instanceof Prisma.PrismaClientKnownRequestError
                ? error.code
                : null,
            rawMessage: error instanceof Error ? error.message : String(error)
          }
        );
        if (error instanceof Error) {
          const code = error.message;
          if (code === "LIBRARY_CHUNK_CONTENT_EMPTY") {
            return response.status(400).json({
              success: false,
              error: {
                code,
                message:
                  "The transport chunk content was empty. This can happen if your Word paste included unsupported embedded content — please paste as plain text or remove images, then try again."
              }
            });
          }
          if (code === "LIBRARY_CHUNK_TOO_LARGE") {
            return response.status(413).json({
              success: false,
              error: {
                code,
                message: "The transport chunk exceeds the 1 MB per-chunk limit. Split the content and try again."
              }
            });
          }
          if (code === "LIBRARY_CHUNK_FIELD_INVALID") {
            return response.status(400).json({
              success: false,
              error: { code, message: "The transport chunk field must be either 'body' or 'summary'." }
            });
          }
          if (code === "LIBRARY_CHUNK_INDEX_INVALID") {
            return response.status(400).json({
              success: false,
              error: { code, message: "The transport chunk index is out of range." }
            });
          }
        }
        // Prisma-specific classification for chunk writes — Atlas-specific errors
        // (P1001/P1002, transient network) surface directly to the user instead of
        // "Could not append". These match the classifyAdminLibraryWriteError mappings
        // used by create/update.
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          const c = error.code;
          if (/^P1/.test(c)) {
            return response.status(503).json({
              success: false,
              error: {
                code: "DATABASE_UNAVAILABLE",
                message: "Database connection lost mid-upload. Please try the upload again in a moment."
              }
            });
          }
          if (c === "P2024" || c === "P2028" || c === "P2034") {
            return response.status(409).json({
              success: false,
              error: {
                code: "LIBRARY_TRANSACTION_CONFLICT",
                message: "This chunk write conflicted with a concurrent save. Please wait 2 seconds and try the upload again."
              }
            });
          }
        }
        const rawTail = error instanceof Error && error.message.trim().length > 0 ? error.message.trim().slice(0, 240) : "";
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_LIBRARY_CHUNK_APPEND_FAILED",
            message: rawTail
              ? `Could not append the transport chunk. (${rawTail})`
              : "Could not append the transport chunk. Please wait a moment and retry."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/library/:section/materials/_chunks/:token/clear",
    authenticateRequest,
    requireAdminRequest,
    express.json({ limit: "32kb" }),
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the admin library workspace."
          }
        });
      }
      try {
        const tokens: string[] = [String(request.params.token)];
        const reqTokens =
          request.body &&
          typeof request.body === "object" &&
          "tokens" in request.body &&
          Array.isArray((request.body as { tokens?: unknown }).tokens)
            ? ((request.body as { tokens: unknown[] }).tokens.filter((t): t is string => typeof t === "string" && t.length > 0))
            : [];
        for (const t of reqTokens) if (!tokens.includes(t)) tokens.push(t);
        await clearAdminLibraryChunkBuffer(tokens);
        return response.json({ success: true, data: { cleared: true, tokens: tokens.length } });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_LIBRARY_CHUNK_CLEAR_FAILED",
            message: "Could not clear the transport chunks."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/library/:section/materials/_chunks/:token/:field/peek",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the admin library workspace."
          }
        });
      }
      try {
        const data = await peekAdminLibraryChunkBuffer(String(request.params.token), String(request.params.field));
        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "ADMIN_LIBRARY_CHUNK_PEEK_EMPTY",
              message: "The transport chunk buffer has no rows for this token yet."
            }
          });
        }
        return response.json({ success: true, data });
      } catch (error) {
        if (error instanceof Error && error.message === "LIBRARY_CHUNK_FIELD_INVALID") {
          return response.status(400).json({
            success: false,
            error: { code: "LIBRARY_CHUNK_FIELD_INVALID", message: "The transport chunk field must be either 'body' or 'summary'." }
          });
        }
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_LIBRARY_CHUNK_PEEK_FAILED",
            message: "Could not read the transport chunk buffer."
          }
        });
      }
    }
  );

  // Content-length guard for admin library write routes. express.json() with a
  // 200 MB limit still allocates ~3-5× the raw payload size during JSON.parse
  // (buffer + string escapes + object graph). A 512 MB Render worker OOMs on
  // ~40 MB+ JSON payloads and the Render proxy returns an empty-bodied 500
  // with no JSON envelope the frontend can surface, leaving admins with only
  // "could not create library material". Instead we short-circuit ANY admin
  // library request over 32 MB BEFORE running the JSON parser with a proper
  // JSON 413 response. The frontend now uploads body/summary > 500 KB via the
  // chunked transport (AdminLibraryChunkBuffer) so this guard is a safety net,
  // not the happy path.
  //
  // NOTE: Route shape is /api/v1/admin/library/{section}/... — library is the
  // IMMEDIATE child of /admin/ with no category in between. The previous regex
  // required one unrelated segment between /admin/ and /library/ and therefore
  // never fired, letting huge payloads reach express.json() and OOM the worker.
  const MAX_ADMIN_LIBRARY_JSON_BYTES = 32 * 1024 * 1024;
  app.use("/api/v1/admin/", (request: Request, response: Response, next: NextFunction) => {
    const target = request.originalUrl || request.url || "";
    const isLibraryRoute = /^\/api\/v1\/admin\/library(\/|$)/.test(target);
    if (!isLibraryRoute) {
      next();
      return;
    }
    // Chunk endpoints read the body with express.text() (1 MB cap per chunk)
    // and never enter JSON parsing. Let them bypass the JSON-size guard so
    // retried 1 MB text/plain appends are not falsely rejected by a JSON
    // payload heuristic.
    const isChunkSubRoute = /\/_chunks(\/|$)/.test(target);
    if (isChunkSubRoute) {
      next();
      return;
    }
    const rawLen = request.headers["content-length"];
    if (rawLen === undefined || rawLen === null) {
      // If Content-Length is missing (chunked transfer) we still let it
      // through — express.json() has its own 200 MB stream-size limit, and
      // chunked streaming is much rarer here.
      next();
      return;
    }
    const n = Number(rawLen);
    if (!Number.isFinite(n) || n > MAX_ADMIN_LIBRARY_JSON_BYTES) {
      response.status(413).json({
        success: false,
        error: {
          code: "LIBRARY_PAYLOAD_TOO_LARGE",
          message:
            "The library material is too large for a single upload. Please split the body into sections or remove embedded images, then try again."
        }
      });
      return;
    }
    next();
  });

  // Raised from 30mb → 200mb so admin library submissions (large law report HTML with
  // embedded tables / inline images / full judgment text pasted into the body editor)
  // survive JSON serialization. Each endpoint still enforces its own safe upper bound
  // below (and MongoDB's per-document 16MB BSON cap is handled transparently via body
  // chunking in admin-library.ts so users can save arbitrarily long report content).
  app.use(express.json({ limit: "200mb" }));
  app.use(morgan("dev"));
  app.use(
    ["/api/v1/auth/demo-sign-in", "/api/v1/auth/register", "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password"],
    createRateLimiter(10, 60_000)
  );
  app.use("/api/v1/auth/refresh", createRateLimiter(20, 60_000));
  app.use("/api/v1/contact", createRateLimiter(10, 60_000));
  app.use("/api/v1/users/me", createRateLimiter(20, 60_000));

  app.get("/api/v1/health", (_request: Request, response: Response) => {
    response.json({
      success: true,
      data: {
        name: "Helar API",
        status: "ok",
        timestamp: new Date().toISOString()
      }
    });
  });

  app.get("/api/v1/catalog/overview", (_request: Request, response: Response) => {
    response.json({
      success: true,
      data: dashboardSnapshot
    });
  });

  app.get("/api/v1/catalog/latest-publications", async (request: Request, response: Response) => {
    if (!useDatabase) {
      return response.json({
        success: true,
        data: {
          items: []
        }
      });
    }

    try {
      const query = parseLatestCatalogPublicationsQuery(request.query as Record<string, string | string[] | undefined>);
      const items = await listLatestCatalogPublications(query);
      return response.json({
        success: true,
        data: {
          items
        }
      });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CATALOG_LATEST_PUBLICATIONS_FAILED",
          message: "Could not load latest publications right now."
        }
      });
    }
  });

  app.post("/api/v1/contact", async (request: Request, response: Response) => {
    const parsed = contactMessageSchema.safeParse(request.body);

    if (!parsed.success) {
      return response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The contact payload is invalid.",
          details: parsed.error.flatten()
        }
      });
    }

    try {
      const result = await sendContactEmail(parsed.data);

      if (result.skipped) {
        return response.status(503).json({
          success: false,
          error: {
            code: "CONTACT_UNAVAILABLE",
            message: "Contact is temporarily unavailable. Please try again shortly."
          }
        });
      }

      return response.json({
        success: true,
        data: {
          message: "Thanks for reaching out. Your message has been sent and we will respond via email."
        }
      });
    } catch (error) {
      console.error(error);
      return response.status(503).json({
        success: false,
        error: {
          code: "CONTACT_UNAVAILABLE",
          message: "Contact is temporarily unavailable. Please try again shortly."
        }
      });
    }
  });

  app.get("/api/v1/subscription/plans", async (_request: Request, response: Response) => {
    if (!useDatabase) {
      return response.json({
        success: true,
        data: await listPublicSubscriptionPlans()
      });
    }

    try {
      const plans = await listPublicSubscriptionPlans();

      return response.json({
        success: true,
        data: plans
      });
    } catch (error) {
      if (error instanceof BillingConfigurationError) {
        return response.status(503).json({
          success: false,
          error: {
            code: "BILLING_UNAVAILABLE",
            message: error.message
          }
        });
      }

      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "SUBSCRIPTION_PLANS_FAILED",
          message: "Could not load the subscription plans right now."
        }
      });
    }
  });

  app.get(
    "/api/v1/admin/dashboard/overview",
    authenticateRequest,
    requireAdminRequest,
    async (_request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the admin dashboard."
          }
        });
      }

      try {
        const data = await getAdminDashboardOverview();

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_DASHBOARD_FETCH_FAILED",
            message: "Could not load the admin dashboard overview."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/notifications",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const data = await getAdminNotificationCenter(request.auth!.userId, request.auth!.roleCodes);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_NOTIFICATIONS_FETCH_FAILED",
            message: "Could not load admin notifications."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/content-review",
    authenticateRequest,
    requireSuperAdminRequest,
    async (_request: AuthenticatedRequest, response: Response) => {
      try {
        const data = await getSuperAdminApprovalQueue();

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_CONTENT_REVIEW_FETCH_FAILED",
            message: "Could not load the content review queue."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/notifications/read-all",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const data = await markAdminNotificationsRead(request.auth!.userId);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_NOTIFICATIONS_UPDATE_FAILED",
            message: "Could not update admin notifications."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/approvals/approve-all-pending",
    authenticateRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const data = await approveAllPendingContent(request.auth!.userId);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_BULK_APPROVAL_FAILED",
            message: "Could not approve all pending content."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/approvals/library-materials/:materialId/approve",
    authenticateRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const data = await approveLibraryMaterial(readRouteParam(request.params.materialId), request.auth!.userId);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "APPROVAL_TARGET_NOT_FOUND",
              message: "The library item was not found or is no longer pending approval."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_APPROVAL_FAILED",
            message: "Could not approve the library item."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/approvals/subject-summary-cases/:caseId/approve",
    authenticateRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const data = await approveSubjectSummaryCase(readRouteParam(request.params.caseId));

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "APPROVAL_TARGET_NOT_FOUND",
              message: "The case was not found or is no longer pending approval."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_APPROVAL_FAILED",
            message: "Could not approve the case."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/approvals/subject-summary-entries/:entryId/approve",
    authenticateRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const data = await approveSubjectSummaryEntry(readRouteParam(request.params.entryId));

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "APPROVAL_TARGET_NOT_FOUND",
              message: "The subject summary was not found or is no longer pending approval."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_APPROVAL_FAILED",
            message: "Could not approve the subject summary."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/approvals/bar-final-exam-questions/:questionId/approve",
    authenticateRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const data = await approveBarFinalExamQuestion(readRouteParam(request.params.questionId), request.auth!.userId);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "APPROVAL_TARGET_NOT_FOUND",
              message: "The bar final exam question was not found or is no longer pending approval."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_APPROVAL_FAILED",
            message: "Could not approve the bar final exam question."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/approvals/bar-final-exam-mcq-questions/:questionId/approve",
    authenticateRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const data = await approveBarFinalExamMcqQuestion(readRouteParam(request.params.questionId), request.auth!.userId);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "APPROVAL_TARGET_NOT_FOUND",
              message: "The bar final exam MCQ question was not found or is no longer pending approval."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_APPROVAL_FAILED",
            message: "Could not approve the bar final exam MCQ question."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/approvals/library-materials/:materialId/decline",
    authenticateRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const parsed = declineApprovalSchema.safeParse(request.body);

        if (!parsed.success) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "A decline reason is required.",
              details: parsed.error.flatten()
            }
          });
        }

        const data = await declineLibraryMaterial(readRouteParam(request.params.materialId), parsed.data.reason);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "APPROVAL_TARGET_NOT_FOUND",
              message: "The library item was not found or is no longer pending approval."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_DECLINE_FAILED",
            message: "Could not decline the library item."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/approvals/subject-summary-cases/:caseId/decline",
    authenticateRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const parsed = declineApprovalSchema.safeParse(request.body);

        if (!parsed.success) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "A decline reason is required.",
              details: parsed.error.flatten()
            }
          });
        }

        const data = await declineSubjectSummaryCase(readRouteParam(request.params.caseId), parsed.data.reason);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "APPROVAL_TARGET_NOT_FOUND",
              message: "The case was not found or is no longer pending approval."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_DECLINE_FAILED",
            message: "Could not decline the case."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/approvals/subject-summary-entries/:entryId/decline",
    authenticateRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const parsed = declineApprovalSchema.safeParse(request.body);

        if (!parsed.success) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "A decline reason is required.",
              details: parsed.error.flatten()
            }
          });
        }

        const data = await declineSubjectSummaryEntry(readRouteParam(request.params.entryId), parsed.data.reason);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "APPROVAL_TARGET_NOT_FOUND",
              message: "The subject summary was not found or is no longer pending approval."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_DECLINE_FAILED",
            message: "Could not decline the subject summary."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/approvals/bar-final-exam-questions/:questionId/decline",
    authenticateRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const parsed = declineApprovalSchema.safeParse(request.body);

        if (!parsed.success) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "A decline reason is required.",
              details: parsed.error.flatten()
            }
          });
        }

        const data = await declineBarFinalExamQuestion(
          readRouteParam(request.params.questionId),
          request.auth!.userId,
          parsed.data.reason
        );

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "APPROVAL_TARGET_NOT_FOUND",
              message: "The bar final exam question was not found or is no longer pending approval."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_DECLINE_FAILED",
            message: "Could not decline the bar final exam question."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/approvals/bar-final-exam-mcq-questions/:questionId/decline",
    authenticateRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const parsed = declineApprovalSchema.safeParse(request.body);

        if (!parsed.success) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "A decline reason is required.",
              details: parsed.error.flatten()
            }
          });
        }

        const data = await declineBarFinalExamMcqQuestion(
          readRouteParam(request.params.questionId),
          request.auth!.userId,
          parsed.data.reason
        );

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "APPROVAL_TARGET_NOT_FOUND",
              message: "The bar final exam MCQ question was not found or is no longer pending approval."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_DECLINE_FAILED",
            message: "Could not decline the bar final exam MCQ question."
          }
        });
      }
    }
  );

  app.get("/api/v1/connect/questions", attachOptionalAuth, async (request: AuthenticatedRequest, response: Response) => {
    const parsed = z
      .object({
        search: z.string().optional(),
        sort: z.string().optional()
      })
      .safeParse(request.query);

    if (!parsed.success) {
      return response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The Helar Connect query is invalid.",
          details: parsed.error.flatten()
        }
      });
    }

    try {
      const filters = parseHelarConnectQuestionListQuery(parsed.data);
      const snapshot = await listHelarConnectQuestions(filters, request.auth?.userId);
      return response.json({
        success: true,
        data: snapshot
      });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CONNECT_LIST_FAILED",
          message: "Could not load Helar Connect questions."
        }
      });
    }
  });

  app.get("/api/v1/connect/users", async (request: Request, response: Response) => {
    const parsed = z
      .object({
        search: z.string().optional()
      })
      .safeParse(request.query);

    if (!parsed.success) {
      return response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The Helar Connect users query is invalid.",
          details: parsed.error.flatten()
        }
      });
    }

    try {
      const filters = parseHelarConnectUserListQuery(parsed.data);
      const snapshot = await listHelarConnectUsers(filters);
      return response.json({
        success: true,
        data: snapshot
      });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CONNECT_USERS_FAILED",
          message: "Could not load Helar Connect users."
        }
      });
    }
  });

  app.post("/api/v1/connect/questions", authenticateRequest, async (request: AuthenticatedRequest, response: Response) => {
    const parsed = z
      .object({
        body: z.string(),
        tags: z.array(z.string()).optional(),
        title: z.string()
      })
      .safeParse(request.body);

    if (!parsed.success) {
      return response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The question payload is invalid.",
          details: parsed.error.flatten()
        }
      });
    }

    try {
      const input = parseHelarConnectQuestionInput(parsed.data);
      const question = await createHelarConnectQuestion(request.auth!.userId, input);
      return response.status(201).json({
        success: true,
        data: question
      });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CONNECT_CREATE_QUESTION_FAILED",
          message: "Could not publish the question."
        }
      });
    }
  });

  app.post(
    "/api/v1/connect/questions/:questionId/votes",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const result = await toggleHelarConnectVote(request.auth!.userId, readRouteParam(request.params.questionId));
        return response.json({
          success: true,
          data: result
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "CONNECT_VOTE_FAILED",
            message: "Could not update the vote right now."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/connect/questions/:questionId/comments",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      const parsed = z
        .object({
          body: z.string()
        })
        .safeParse(request.body);

      if (!parsed.success) {
        return response.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The comment payload is invalid.",
            details: parsed.error.flatten()
          }
        });
      }

      try {
        const input = parseHelarConnectCommentInput(parsed.data);
        const comment = await createHelarConnectComment(request.auth!.userId, readRouteParam(request.params.questionId), input);
        return response.status(201).json({
          success: true,
          data: comment
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "CONNECT_COMMENT_FAILED",
            message: "Could not publish the comment."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/connect/questions/:questionId/answers",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      const parsed = z
        .object({
          body: z.string()
        })
        .safeParse(request.body);

      if (!parsed.success) {
        return response.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The answer payload is invalid.",
            details: parsed.error.flatten()
          }
        });
      }

      try {
        const input = parseHelarConnectAnswerInput(parsed.data);
        const answer = await createHelarConnectAnswer(request.auth!.userId, readRouteParam(request.params.questionId), input);
        return response.status(201).json({
          success: true,
          data: answer
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "CONNECT_ANSWER_FAILED",
            message: "Could not publish the answer."
          }
        });
      }
    }
  );

  app.post("/api/v1/connect/questions/:questionId/views", async (request: Request, response: Response) => {
    try {
      const result = await recordHelarConnectQuestionView(readRouteParam(request.params.questionId));
      return response.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CONNECT_VIEW_FAILED",
          message: "Could not record the view."
        }
      });
    }
  });

  app.delete(
    "/api/v1/connect/questions/:questionId",
    authenticateRequest,
    requireHelarConnectModeratorRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const result = await deleteHelarConnectQuestion(readRouteParam(request.params.questionId));

        if (!result) {
          return response.status(404).json({
            success: false,
            error: {
              code: "QUESTION_NOT_FOUND",
              message: "The question could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data: result
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "CONNECT_MODERATION_FAILED",
            message: "Could not remove the question."
          }
        });
      }
    }
  );

  app.delete(
    "/api/v1/connect/answers/:answerId",
    authenticateRequest,
    requireHelarConnectModeratorRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const result = await deleteHelarConnectAnswer(readRouteParam(request.params.answerId));

        if (!result) {
          return response.status(404).json({
            success: false,
            error: {
              code: "ANSWER_NOT_FOUND",
              message: "The answer could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data: result
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "CONNECT_MODERATION_FAILED",
            message: "Could not remove the answer."
          }
        });
      }
    }
  );

  app.delete(
    "/api/v1/connect/comments/:commentId",
    authenticateRequest,
    requireHelarConnectModeratorRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      try {
        const result = await deleteHelarConnectComment(readRouteParam(request.params.commentId));

        if (!result) {
          return response.status(404).json({
            success: false,
            error: {
              code: "COMMENT_NOT_FOUND",
              message: "The comment could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data: result
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "CONNECT_MODERATION_FAILED",
            message: "Could not remove the comment."
          }
        });
      }
    }
  );

  app.post("/api/v1/auth/demo-sign-in", async (request: Request, response: Response) => {
    const parsed = signInSchema.safeParse(request.body);

    if (!parsed.success) {
      return response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The sign-in payload is invalid.",
          details: parsed.error.flatten()
        }
      });
    }

    if (!useDatabase && allowAuthFallback) {
      const fallbackUser = buildFallbackUser(parsed.data.email);
      return response.json({
        success: true,
        data: createFallbackSession(fallbackUser)
      });
    }

    try {
      const result = await persistSignIn(parsed.data);
      return response.status(result.status).json(result.body);
    } catch (error) {
      if (error instanceof DeviceLimitError) {
        return response.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      // Classify the failure so clients and admins can act on it.
      const classification = classifyDatabaseError(error);
      console.error("[auth:demo-sign-in] sign-in failure", {
        email: parsed.data.email,
        classification,
        name: error instanceof Error ? error.constructor.name : typeof error,
        message: error instanceof Error ? error.message : String(error)
      });

      if (allowAuthFallback) {
        const fallbackUser = buildFallbackUser(parsed.data.email);
        return response.json({
          success: true,
          data: createFallbackSession(fallbackUser),
          meta: {
            storageMode: "fallback",
            message: createDatabaseFallbackErrorMessage()
          }
        });
      }

      if (classification === "NO_USERS") {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message:
              "The MongoDB database is not ready yet. No users were found in the database; seed the users table before signing in."
          }
        });
      }

      if (classification === "DATABASE_UNREACHABLE") {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message:
              "The MongoDB database is temporarily unreachable. Check the DATABASE_URL and network connectivity, then retry."
          }
        });
      }

      // Unexpected system error — surface a stable, actionable 500 without
      // leaking internals, but keep the actual exception in server logs (above).
      return response.status(500).json({
        success: false,
        error: {
          code: "AUTH_SIGN_IN_FAILED",
          message: "Sign-in failed unexpectedly. Check the server logs for details."
        }
      });
    }
  });

  app.post("/api/v1/auth/register", async (request: Request, response: Response) => {
    const parsed = registerSchema.safeParse(request.body);

    if (!parsed.success) {
      return response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The registration payload is invalid.",
          details: parsed.error.flatten()
        }
      });
    }

    if (!useDatabase && allowAuthFallback) {
      const localPart = parsed.data.email.split("@")[0]?.toLowerCase() ?? "";
      const fallbackRoleCodes = localPart.includes("admin") ? undefined : [parsed.data.registrationRole];
      const fallbackUser = buildFallbackUser(parsed.data.email, {
        fullName: parsed.data.fullName,
        ...(fallbackRoleCodes ? { roleCodes: fallbackRoleCodes } : {})
      });
      return response.status(201).json({
        success: true,
        data: createFallbackSession(fallbackUser)
      });
    }

    try {
      const result = await persistRegister(parsed.data);
      return response.status(result.status).json(result.body);
    } catch (error) {
      if (error instanceof DeviceLimitError) {
        return response.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      console.error(error);
      if (allowAuthFallback) {
        const localPart = parsed.data.email.split("@")[0]?.toLowerCase() ?? "";
        const fallbackRoleCodes = localPart.includes("admin") ? undefined : [parsed.data.registrationRole];
        const fallbackUser = buildFallbackUser(parsed.data.email, {
          fullName: parsed.data.fullName,
          ...(fallbackRoleCodes ? { roleCodes: fallbackRoleCodes } : {})
        });
        return response.status(201).json({
          success: true,
          data: createFallbackSession(fallbackUser),
          meta: {
            storageMode: "fallback",
            message: createDatabaseFallbackErrorMessage()
          }
        });
      }

      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The MongoDB database is not ready yet. Start the database before creating accounts."
        }
      });
    }
  });

  app.post("/api/v1/auth/forgot-password", async (request: Request, response: Response) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);

    if (!parsed.success) {
      return response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The forgot-password payload is invalid.",
          details: parsed.error.flatten()
        }
      });
    }

    if (!useDatabase && allowAuthFallback) {
      return response.json({
        success: true,
        data: {
          message: "If an account exists for that email, a password reset link has been sent."
        }
      });
    }

    try {
      const result = await persistForgotPassword(parsed.data);
      return response.status(result.status).json(result.body);
    } catch (error) {
      if (isPasswordResetDatabaseError(error)) {
        return response.status(503).json({
          success: false,
          error: {
            code: "PASSWORD_RESET_DATABASE_UNAVAILABLE",
            message: "Password reset is temporarily unavailable because the account service could not be reached. Please try again shortly."
          }
        });
      }

      console.error(error);
      return response.status(503).json({
        success: false,
        error: {
          code: "PASSWORD_RESET_UNAVAILABLE",
          message: "Password reset is temporarily unavailable. Please try again shortly."
        }
      });
    }
  });

  app.post("/api/v1/auth/reset-password", async (request: Request, response: Response) => {
    const parsed = resetPasswordSchema.safeParse(request.body);

    if (!parsed.success) {
      return response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The reset-password payload is invalid.",
          details: parsed.error.flatten()
        }
      });
    }

    if (!useDatabase && allowAuthFallback) {
      return response.status(503).json({
        success: false,
        error: {
          code: "PASSWORD_RESET_UNAVAILABLE",
          message: "Password reset is unavailable while the database fallback is active."
        }
      });
    }

    try {
      const result = await persistResetPassword(parsed.data);
      return response.status(result.status).json(result.body);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return response.status(400).json({
          success: false,
          error: {
            code: "RESET_LINK_EXPIRED",
            message: "This password reset link has expired. Please request a new one."
          }
        });
      }

      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
        return response.status(400).json({
          success: false,
          error: {
            code: "INVALID_RESET_TOKEN",
            message: "The password reset link is invalid. Please request a new one."
          }
        });
      }

      if (isPasswordResetDatabaseError(error)) {
        return response.status(503).json({
          success: false,
          error: {
            code: "PASSWORD_RESET_DATABASE_UNAVAILABLE",
            message: "Password reset is temporarily unavailable because the account service could not be reached. Please try again shortly."
          }
        });
      }

      console.error(error);
      return response.status(503).json({
        success: false,
        error: {
          code: "PASSWORD_RESET_UNAVAILABLE",
          message: "Password reset is temporarily unavailable. Please try again shortly."
        }
      });
    }
  });

  app.get("/api/v1/auth/verify-email", async (request: Request, response: Response) => {
    const parsed = verifyEmailQuerySchema.safeParse({
      token:
        typeof request.query.token === "string"
          ? request.query.token
          : Array.isArray(request.query.token) && typeof request.query.token[0] === "string"
            ? request.query.token[0]
            : undefined
    });

    const renderHtml = (title: string, message: string, statusCode = 200) =>
      response
        .status(statusCode)
        .type("html")
        .send(`
          <html>
            <body style="font-family: Arial, Helvetica, sans-serif; padding: 32px; color: #0f172a;">
              <h2>${title}</h2>
              <p>${message}</p>
            </body>
          </html>
        `);

    if (!parsed.success) {
      return renderHtml("Invalid Verification Link", "The email verification link is invalid.", 400);
    }

    try {
      const tokenPayload = jwt.verify(parsed.data.token, getJwtSecret()) as jwt.JwtPayload;

      if (tokenPayload.purpose !== "email_verification" || typeof tokenPayload.sub !== "string") {
        return renderHtml("Invalid Verification Link", "The email verification link is invalid.", 400);
      }

      const user = await prisma.user.findUnique({
        where: { id: tokenPayload.sub },
        select: {
          id: true,
          emailVerifiedAt: true
        }
      });

      if (!user) {
        return renderHtml("Account Not Found", "We could not find an account for this verification link.", 404);
      }

      if (user.emailVerifiedAt) {
        return renderHtml("Email Already Verified", "Your Helar account email is already verified.");
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date()
        }
      });

      return renderHtml("Email Verified", "Your Helar account has been verified successfully. You can now sign in.");
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return renderHtml("Verification Link Expired", "This verification link has expired. Please register again or request a new verification email.", 400);
      }

      return renderHtml("Invalid Verification Link", "The email verification link is invalid.", 400);
    }
  });

  app.post("/api/v1/auth/refresh", async (request: Request, response: Response) => {
    const parsed = refreshSchema.safeParse(request.body);

    if (!parsed.success) {
      return response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The refresh payload is invalid.",
          details: parsed.error.flatten()
        }
      });
    }

    if (!useDatabase && allowAuthFallback) {
      const fallbackEmail = parsed.data.refreshToken.startsWith("demo-refresh-token:")
        ? decodeURIComponent(parsed.data.refreshToken.replace("demo-refresh-token:", ""))
        : "student@helar.test";

      return response.json({
        success: true,
        data: createFallbackSession(buildFallbackUser(fallbackEmail))
      });
    }

    try {
      const refreshedSession = await persistRefreshSession(parsed.data.refreshToken);

      if (!refreshedSession) {
        return response.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Your refresh token is invalid or expired."
          }
        });
      }

      return response.json({
        success: true,
        data: refreshedSession
      });
    } catch (error) {
      console.error(error);
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The MongoDB database is not ready yet. Start the database before refreshing your session."
        }
      });
    }
  });

  app.patch("/api/v1/users/me", authenticateRequest, async (request: AuthenticatedRequest, response: Response) => {
    const parsed = profileSchema.safeParse(request.body);

    if (!parsed.success) {
      return response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The profile payload is invalid.",
          details: parsed.error.flatten()
        }
      });
    }

    if (!request.auth?.userId) {
      return response.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "A valid access token is required."
        }
      });
    }

    if (!useDatabase && allowAuthFallback) {
      return response.json({
        success: true,
        data: {
          user: {
            ...buildFallbackUser("student@helar.test"),
            ...parsed.data
          }
        }
      });
    }

    try {
      const user = await persistProfileUpdate(request.auth.userId, parsed.data);

      return response.json({
        success: true,
        data: {
          user
        }
      });
    } catch (error) {
      console.error(error);
      if (allowAuthFallback) {
        return response.json({
          success: true,
          data: {
            user: {
              ...buildFallbackUser("student@helar.test"),
              ...parsed.data
            }
          },
          meta: {
            storageMode: "fallback",
            message: createDatabaseFallbackErrorMessage()
          }
        });
      }

      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is not ready yet. Start the database before saving profile changes."
        }
      });
    }
  });

  app.patch("/api/v1/users/me/password", authenticateRequest, async (request: AuthenticatedRequest, response: Response) => {
    const parsed = userPasswordUpdateSchema.safeParse(request.body);

    if (!parsed.success) {
      return response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The password update payload is invalid.",
          details: parsed.error.flatten()
        }
      });
    }

    if (!request.auth?.userId) {
      return response.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "A valid access token is required."
        }
      });
    }

    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required to update your password."
        }
      });
    }

    try {
      const result = await persistUserPasswordUpdate(request.auth.userId, parsed.data);
      return response.status(result.status).json(result.body);
    } catch (error) {
      console.error(error);
      return response.status(503).json({
        success: false,
        error: {
          code: "PASSWORD_UPDATE_UNAVAILABLE",
          message: "We could not update your password right now. Please try again shortly."
        }
      });
    }
  });

  app.get("/api/v1/subscriptions/me", authenticateRequest, async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for subscription billing."
        }
      });
    }

    try {
      const snapshot = await getUserSubscriptionSnapshot(request.auth!.userId);

      return response.json({
        success: true,
        data: snapshot
      });
    } catch (error) {
      if (error instanceof BillingConfigurationError) {
        return response.status(503).json({
          success: false,
          error: {
            code: "BILLING_UNAVAILABLE",
            message: error.message
          }
        });
      }

      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "SUBSCRIPTION_SNAPSHOT_FAILED",
          message: "Could not load the subscription snapshot right now."
        }
      });
    }
  });

  app.post("/api/v1/subscriptions/checkout", authenticateRequest, async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for subscription billing."
        }
      });
    }

    try {
      const input = parseSubscriptionCheckoutInput(request.body);
      const checkout = await initializeSubscriptionCheckout(request.auth!.userId, input);

      return response.status(201).json({
        success: true,
        data: checkout
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return response.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The subscription checkout request is invalid.",
            details: error.flatten()
          }
        });
      }

      if (error instanceof BillingConfigurationError) {
        return response.status(503).json({
          success: false,
          error: {
            code: "BILLING_UNAVAILABLE",
            message: error.message
          }
        });
      }

      if (error instanceof BillingOperationError) {
        return response.status(error.statusCode).json({
          success: false,
          error: {
            code: "SUBSCRIPTION_CHECKOUT_FAILED",
            message: error.message
          }
        });
      }

      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "SUBSCRIPTION_CHECKOUT_FAILED",
          message: "Could not start the subscription checkout right now."
        }
      });
    }
  });

  app.post("/api/v1/subscriptions/verify", authenticateRequest, async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for subscription billing."
        }
      });
    }

    try {
      const input = parseSubscriptionVerifyInput(request.body);
      const verification = await verifySubscriptionPayment(request.auth!.userId, input.reference);

      return response.json({
        success: true,
        data: verification
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return response.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The subscription verification request is invalid.",
            details: error.flatten()
          }
        });
      }

      if (error instanceof BillingConfigurationError) {
        return response.status(503).json({
          success: false,
          error: {
            code: "BILLING_UNAVAILABLE",
            message: error.message
          }
        });
      }

      if (error instanceof BillingOperationError) {
        return response.status(error.statusCode).json({
          success: false,
          error: {
            code: "SUBSCRIPTION_VERIFICATION_FAILED",
            message: error.message
          }
        });
      }

      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "SUBSCRIPTION_VERIFICATION_FAILED",
          message: "Could not verify the Paystack payment right now."
        }
      });
    }
  });

  app.get(
    "/api/v1/admin/payments/overview",
    authenticateRequest,
    requirePaymentAccessRequest,
    async (_request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for payment operations."
          }
        });
      }

      try {
        const snapshot = await getAdminBillingSnapshot();

        return response.json({
          success: true,
          data: snapshot
        });
      } catch (error) {
        if (error instanceof BillingConfigurationError) {
          return response.status(503).json({
            success: false,
            error: {
              code: "BILLING_UNAVAILABLE",
              message: error.message
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_PAYMENTS_FAILED",
            message: "Could not load the payment workspace right now."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/payments/manual-activation",
    authenticateRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for payment operations."
          }
        });
      }

      try {
        const input = parseAdminManualActivationInput(request.body);
        const activation = await activateSubscriptionForUserByAdmin(request.auth!.userId, input);

        return response.status(201).json({
          success: true,
          data: activation
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The manual activation request is invalid.",
              details: error.flatten()
            }
          });
        }

        if (error instanceof BillingConfigurationError) {
          return response.status(503).json({
            success: false,
            error: {
              code: "BILLING_UNAVAILABLE",
              message: error.message
            }
          });
        }

        if (error instanceof BillingOperationError) {
          return response.status(error.statusCode).json({
            success: false,
            error: {
              code: "MANUAL_ACTIVATION_FAILED",
              message: error.message
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "MANUAL_ACTIVATION_FAILED",
            message: "Could not activate the subscription right now."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summary-module/entries",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subject summary entries."
          }
        });
      }

      try {
        const filters = parseSubjectSummaryEntryFilters(request.query as Record<string, string | string[] | undefined>);
        const data = await listSubjectSummaryEntries(filters);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summary entry query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_ENTRY_FETCH_FAILED",
            message: "Could not load subject summary entries."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summary-module/form-options",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subject summary form options."
          }
        });
      }

      try {
        const subjectId = Array.isArray(request.query.subjectId) ? request.query.subjectId[0] : request.query.subjectId;
        const data = await getSubjectSummaryEntryFormOptions(typeof subjectId === "string" ? subjectId : undefined);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_FORM_OPTIONS_FAILED",
            message: "Could not load subject summary form options."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summary-module/topics",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subject summary topics."
          }
        });
      }

      try {
        const query = parseSubjectSummaryModuleTopicsQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await listSubjectSummaryModuleTopics(query);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summary topics query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_TOPICS_FAILED",
            message: "Could not load subject summary topics."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/subject-summary-module/entries",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to create subject summaries."
          }
        });
      }

      try {
        const payload = parseSubjectSummaryEntryInput(request.body);
        const data = await createSubjectSummaryEntry(payload, request.auth!.userId, request.auth!.roleCodes);

        return response.status(201).json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summary payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_ENTRY_CREATE_FAILED",
            message: "Could not create the subject summary."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/subject-summary-module/topics",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to create subject summaries."
          }
        });
      }

      try {
        const payload = parseSubjectSummaryTopicBulkInput(request.body);
        const data = await createSubjectSummaryTopicEntries(payload, request.auth!.userId, request.auth!.roleCodes);

        return response.status(201).json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summary payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_ENTRY_CREATE_FAILED",
            message: "Could not create the subject summary."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summary-module/entries/:entryId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to load subject summary details."
          }
        });
      }

      try {
        const data = await getAdminSubjectSummaryEntry(String(request.params.entryId));

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "SUBJECT_SUMMARY_ENTRY_NOT_FOUND",
              message: "The requested subject summary could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_ENTRY_FETCH_FAILED",
            message: "Could not load the subject summary."
          }
        });
      }
    }
  );

  app.patch(
    "/api/v1/admin/subject-summary-module/entries/:entryId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to update subject summaries."
          }
        });
      }

      try {
        const payload = parseSubjectSummaryEntryInput(request.body);
        const data = await updateSubjectSummaryEntry(
          String(request.params.entryId),
          payload,
          request.auth!.userId,
          request.auth!.roleCodes
        );

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "SUBJECT_SUMMARY_ENTRY_NOT_FOUND",
              message: "The requested subject summary could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summary payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_ENTRY_UPDATE_FAILED",
            message: "Could not update the subject summary."
          }
        });
      }
    }
  );

  app.delete(
    "/api/v1/admin/subject-summary-module/entries/:entryId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to delete subject summaries."
          }
        });
      }

      try {
        const data = await deleteSubjectSummaryEntry(String(request.params.entryId), request.auth!.userId);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "SUBJECT_SUMMARY_ENTRY_NOT_FOUND",
              message: "The requested subject summary could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_ENTRY_DELETE_FAILED",
            message: "Could not delete the subject summary."
          }
        });
      }
    }
  );

  app.get(
    ["/api/v1/admin/bar-final-exams-nls-mcq/questions", "/api/v1/admin/bar-final-exams-mls-mcq/questions"],
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bar final exam questions."
          }
        });
      }

      try {
        const filters = parseAdminBarFinalExamQuestionFilters(request.query as Record<string, string | string[] | undefined>);
        const data = await listAdminBarFinalExamQuestions(filters);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bar final exam question query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_FETCH_FAILED",
            message: "Could not load bar final exam questions."
          }
        });
      }
    }
  );

  app.get(
    ["/api/v1/admin/bar-final-exams-nls-mcq/form-options", "/api/v1/admin/bar-final-exams-mls-mcq/form-options"],
    authenticateRequest,
    requireAdminRequest,
    async (_request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bar final exam form options."
          }
        });
      }

      try {
        const data = await fetchBarFinalExamFormOptions();

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_FORM_OPTIONS_FAILED",
            message: "Could not load bar final exam form options."
          }
        });
      }
    }
  );

  app.post(
    ["/api/v1/admin/bar-final-exams-nls-mcq/questions", "/api/v1/admin/bar-final-exams-mls-mcq/questions"],
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to create bar final exam questions."
          }
        });
      }

      try {
        const payload = parseBarFinalExamQuestionInput(request.body);
        const data = await createAdminBarFinalExamQuestion(payload, request.auth!.roleCodes, request.auth!.userId);

        return response.status(201).json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bar final exam question payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_CREATE_FAILED",
            message: "Could not create the bar final exam question."
          }
        });
      }
    }
  );

  app.get(
    [
      "/api/v1/admin/bar-final-exams-nls-mcq/questions/:questionId",
      "/api/v1/admin/bar-final-exams-mls-mcq/questions/:questionId"
    ],
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to load bar final exam questions."
          }
        });
      }

      try {
        const data = await getAdminBarFinalExamQuestion(String(request.params.questionId));

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "BAR_FINAL_EXAMS_NOT_FOUND",
              message: "The requested bar final exam question could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_FETCH_FAILED",
            message: "Could not load the bar final exam question."
          }
        });
      }
    }
  );

  app.patch(
    [
      "/api/v1/admin/bar-final-exams-nls-mcq/questions/:questionId",
      "/api/v1/admin/bar-final-exams-mls-mcq/questions/:questionId"
    ],
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to update bar final exam questions."
          }
        });
      }

      try {
        const payload = parseBarFinalExamQuestionInput(request.body);
        const data = await updateAdminBarFinalExamQuestion(
          String(request.params.questionId),
          payload,
          request.auth!.roleCodes,
          request.auth!.userId
        );

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bar final exam question payload is invalid.",
              details: error.flatten()
            }
          });
        }

        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return response.status(404).json({
            success: false,
            error: {
              code: "BAR_FINAL_EXAMS_NOT_FOUND",
              message: "The requested bar final exam question could not be found."
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_UPDATE_FAILED",
            message: "Could not update the bar final exam question."
          }
        });
      }
    }
  );

  app.delete(
    [
      "/api/v1/admin/bar-final-exams-nls-mcq/questions/:questionId",
      "/api/v1/admin/bar-final-exams-mls-mcq/questions/:questionId"
    ],
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to delete bar final exam questions."
          }
        });
      }

      try {
        const data = await deleteAdminBarFinalExamQuestion(String(request.params.questionId));

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return response.status(404).json({
            success: false,
            error: {
              code: "BAR_FINAL_EXAMS_NOT_FOUND",
              message: "The requested bar final exam question could not be found."
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_DELETE_FAILED",
            message: "Could not delete the bar final exam question."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/bar-final-exams-mcq/questions",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bar final exam MCQ questions."
          }
        });
      }

      try {
        const filters = parseAdminBarFinalExamMcqQuestionFilters(request.query as Record<string, string | string[] | undefined>);
        const data = await listAdminBarFinalExamMcqQuestions(filters);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bar final exam MCQ query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_MCQ_FETCH_FAILED",
            message: "Could not load bar final exam MCQ questions."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/bar-final-exams-mcq/form-options",
    authenticateRequest,
    requireAdminRequest,
    async (_request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bar final exam MCQ form options."
          }
        });
      }

      try {
        const data = await fetchBarFinalExamFormOptions();

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_MCQ_FORM_OPTIONS_FAILED",
            message: "Could not load bar final exam MCQ form options."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/bar-final-exams-mcq/questions",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to create bar final exam MCQ questions."
          }
        });
      }

      try {
        const payload = parseBarFinalExamMcqQuestionInput(request.body);
        const data = await createAdminBarFinalExamMcqQuestion(payload, request.auth!.roleCodes, request.auth!.userId);

        return response.status(201).json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bar final exam MCQ payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_MCQ_CREATE_FAILED",
            message: "Could not create the bar final exam MCQ question."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/bar-final-exams-mcq/questions/:questionId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to load bar final exam MCQ questions."
          }
        });
      }

      try {
        const data = await getAdminBarFinalExamMcqQuestion(String(request.params.questionId));

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "BAR_FINAL_EXAMS_MCQ_NOT_FOUND",
              message: "The requested bar final exam MCQ question could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_MCQ_FETCH_FAILED",
            message: "Could not load the bar final exam MCQ question."
          }
        });
      }
    }
  );

  app.patch(
    "/api/v1/admin/bar-final-exams-mcq/questions/:questionId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to update bar final exam MCQ questions."
          }
        });
      }

      try {
        const payload = parseBarFinalExamMcqQuestionInput(request.body);
        const data = await updateAdminBarFinalExamMcqQuestion(
          String(request.params.questionId),
          payload,
          request.auth!.roleCodes,
          request.auth!.userId
        );

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bar final exam MCQ payload is invalid.",
              details: error.flatten()
            }
          });
        }

        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return response.status(404).json({
            success: false,
            error: {
              code: "BAR_FINAL_EXAMS_MCQ_NOT_FOUND",
              message: "The requested bar final exam MCQ question could not be found."
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_MCQ_UPDATE_FAILED",
            message: "Could not update the bar final exam MCQ question."
          }
        });
      }
    }
  );

  app.delete(
    "/api/v1/admin/bar-final-exams-mcq/questions/:questionId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to delete bar final exam MCQ questions."
          }
        });
      }

      try {
        const data = await deleteAdminBarFinalExamMcqQuestion(String(request.params.questionId));

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return response.status(404).json({
            success: false,
            error: {
              code: "BAR_FINAL_EXAMS_MCQ_NOT_FOUND",
              message: "The requested bar final exam MCQ question could not be found."
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_MCQ_DELETE_FAILED",
            message: "Could not delete the bar final exam MCQ question."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summaries/reading-insights",
    authenticateRequest,
    requireAdminRequest,
    async (_request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subject summary insights."
          }
        });
      }

      try {
        const data = await getSubjectSummaryReadingInsights();

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_READING_INSIGHTS_FAILED",
            message: "Could not load the subject summary reading insights."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summaries/hierarchy",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the subject summaries workspace."
          }
        });
      }

      try {
        const query = parseSubjectSummaryHierarchyQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await getSubjectSummaryHierarchy(query);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summaries hierarchy query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_HIERARCHY_FAILED",
            message: "Could not load the subject summary hierarchy."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summaries/hierarchy/type/:caseType",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the subject summaries workspace."
          }
        });
      }

      try {
        const query = parseSubjectSummaryHierarchyQuery({
          ...(request.query as Record<string, string | string[] | undefined>),
          caseType: String(request.params.caseType)
        });
        const data = await getSubjectSummaryHierarchy(query);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summaries hierarchy query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_HIERARCHY_FAILED",
            message: "Could not load the subject summary hierarchy."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summaries/hierarchy/subjects/:subjectId/topics",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subject summary topics."
          }
        });
      }

      try {
        const query = parseSubjectSummaryHierarchyQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await getSubjectSummaryHierarchyTopics(String(request.params.subjectId), query);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summary topic query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_TOPIC_FETCH_FAILED",
            message: "Could not load subject summary topics."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summaries/hierarchy/subjects/:subjectId/topics/type/:caseType",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subject summary topics."
          }
        });
      }

      try {
        const query = parseSubjectSummaryHierarchyQuery({
          ...(request.query as Record<string, string | string[] | undefined>),
          caseType: String(request.params.caseType)
        });
        const data = await getSubjectSummaryHierarchyTopics(String(request.params.subjectId), query);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summary topic query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_TOPIC_FETCH_FAILED",
            message: "Could not load subject summary topics."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summaries/hierarchy/topics/:topicId/cases",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subject summary cases."
          }
        });
      }

      try {
        const query = parseSubjectSummaryHierarchyQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await getSubjectSummaryHierarchyCases(String(request.params.topicId), query);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summary case query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_CASE_FETCH_FAILED",
            message: "Could not load subject summary cases."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summaries/hierarchy/topics/:topicId/cases/type/:caseType",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subject summary cases."
          }
        });
      }

      try {
        const query = parseSubjectSummaryHierarchyQuery({
          ...(request.query as Record<string, string | string[] | undefined>),
          caseType: String(request.params.caseType)
        });
        const data = await getSubjectSummaryHierarchyCases(String(request.params.topicId), query);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summary case query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_CASE_FETCH_FAILED",
            message: "Could not load subject summary cases."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summaries/autocomplete",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subject summary search."
          }
        });
      }

      try {
        const query = parseSubjectSummaryAutocompleteQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await autocompleteSubjectSummaries(query);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summary autocomplete query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_AUTOCOMPLETE_FAILED",
            message: "Could not search subject summaries right now."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summaries/subjects",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subjects management."
          }
        });
      }

      try {
        const filters = parseSubjectSummarySubjectFilters(request.query as Record<string, string | string[] | undefined>);
        const data = await listSubjectSummarySubjects(filters);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_SUBJECTS_FETCH_FAILED",
            message: "Could not load subjects."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/subject-summaries/subjects",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to create subjects."
          }
        });
      }

      try {
        const payload = parseSubjectSummarySubjectInput(request.body);
        const data = await createSubjectSummarySubject(payload, request.auth!.userId);

        return response.status(201).json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_SUBJECT_CREATE_FAILED",
            message: "Could not create the subject."
          }
        });
      }
    }
  );

  app.patch(
    "/api/v1/admin/subject-summaries/subjects/:subjectId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to update subjects."
          }
        });
      }

      try {
        const payload = parseSubjectSummarySubjectInput(request.body);
        const data = await updateSubjectSummarySubject(String(request.params.subjectId), payload, request.auth!.userId);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "SUBJECT_NOT_FOUND",
              message: "The requested subject could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_SUBJECT_UPDATE_FAILED",
            message: "Could not update the subject."
          }
        });
      }
    }
  );

  app.delete(
    "/api/v1/admin/subject-summaries/subjects/:subjectId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to delete subjects."
          }
        });
      }

      try {
        const data = await deleteSubjectSummarySubject(String(request.params.subjectId), request.auth!.userId);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "SUBJECT_NOT_FOUND",
              message: "The requested subject could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_SUBJECT_DELETE_FAILED",
            message: "Could not delete the subject."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/subject-summaries/subjects/bulk",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bulk subject actions."
          }
        });
      }

      try {
        const action = parseSubjectSummarySubjectBulkAction(request.body);
        const data = await bulkUpdateSubjectSummarySubjects(action, request.auth!.userId);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bulk subject action is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_SUBJECT_BULK_FAILED",
            message: "Could not process the bulk subject action."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summaries/topics",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for topics management."
          }
        });
      }

      try {
        const filters = parseSubjectSummaryTopicFilters(request.query as Record<string, string | string[] | undefined>);
        const data = await listSubjectSummaryTopics(filters);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The topic query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_TOPICS_FETCH_FAILED",
            message: "Could not load topics."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/subject-summaries/topics",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to create topics."
          }
        });
      }

      try {
        const payload = parseSubjectSummaryTopicInput(request.body);
        const data = await createSubjectSummaryTopic(payload, request.auth!.userId);

        return response.status(201).json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The topic payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_TOPIC_CREATE_FAILED",
            message: "Could not create the topic."
          }
        });
      }
    }
  );

  app.patch(
    "/api/v1/admin/subject-summaries/topics/:topicId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to update topics."
          }
        });
      }

      try {
        const payload = parseSubjectSummaryTopicInput(request.body);
        const data = await updateSubjectSummaryTopic(String(request.params.topicId), payload, request.auth!.userId);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "TOPIC_NOT_FOUND",
              message: "The requested topic could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The topic payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_TOPIC_UPDATE_FAILED",
            message: "Could not update the topic."
          }
        });
      }
    }
  );

  app.delete(
    "/api/v1/admin/subject-summaries/topics/:topicId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to delete topics."
          }
        });
      }

      try {
        const data = await deleteSubjectSummaryTopic(String(request.params.topicId), request.auth!.userId);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "TOPIC_NOT_FOUND",
              message: "The requested topic could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_TOPIC_DELETE_FAILED",
            message: "Could not delete the topic."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/subject-summaries/topics/bulk",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bulk topic actions."
          }
        });
      }

      try {
        const action = parseSubjectSummaryTopicBulkAction(request.body);
        const data = await bulkUpdateSubjectSummaryTopics(action, request.auth!.userId);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bulk topic action is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_TOPIC_BULK_FAILED",
            message: "Could not process the bulk topic action."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summaries/cases",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for cases management."
          }
        });
      }

      try {
        const filters = parseSubjectSummaryCaseFilters(request.query as Record<string, string | string[] | undefined>);
        const data = await listSubjectSummaryCases(filters);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The case query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_CASES_FETCH_FAILED",
            message: "Could not load cases."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/law-reports",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the law reports library."
          }
        });
      }

      try {
        const filters = parseAdminLibraryFilters(request.query as Record<string, string | string[] | undefined>);
        const data = await listAdminLibraryMaterials("law-reports", filters, "student");

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The law reports query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "LAW_REPORTS_FETCH_FAILED",
            message: "Could not load the law reports."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/helarpedia",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the Helarpedia library."
          }
        });
      }

      try {
        const filters = parseAdminLibraryFilters(request.query as Record<string, string | string[] | undefined>);
        const data = await listAdminLibraryMaterials("helarpedia", filters, "student");

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The Helarpedia query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "HELARPEDIA_FETCH_FAILED",
            message: "Could not load the Helarpedia entries."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/student/study-center/dashboard",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the student study center."
          }
        });
      }

      try {
        const data = await getStudentStudyCenterDashboard(request.auth!.userId);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "STUDY_CENTER_DASHBOARD_FAILED",
            message: "Could not load the student study center."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/student/study-center/progress",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for study progress."
          }
        });
      }

      try {
        const query = parseStudyProgressQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await getStudentStudyProgress(request.auth!.userId, query.contentKey);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The study progress query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "STUDY_PROGRESS_FETCH_FAILED",
            message: "Could not load the saved study progress."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/student/study-center/progress",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for study progress."
          }
        });
      }

      try {
        const payload = parseStudyProgressInput(request.body ?? {});
        const data = await upsertStudentStudyProgress(request.auth!.userId, payload);

        return response.status(201).json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The study progress payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "STUDY_PROGRESS_SAVE_FAILED",
            message: "Could not save the study progress."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/student/study-center/bookmarks",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bookmarks."
          }
        });
      }

      try {
        const query = parseStudyBookmarkQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await listStudentStudyBookmarks(request.auth!.userId, query);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bookmark query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BOOKMARKS_FETCH_FAILED",
            message: "Could not load bookmarks."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/student/study-center/bookmarks",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bookmarks."
          }
        });
      }

      try {
        const payload = parseStudyBookmarkInput(request.body ?? {});
        const data = await addStudentStudyBookmark(request.auth!.userId, payload);

        return response.status(201).json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bookmark payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BOOKMARK_SAVE_FAILED",
            message: "Could not save the bookmark."
          }
        });
      }
    }
  );

  app.delete(
    "/api/v1/student/study-center/bookmarks/:bookmarkId",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bookmarks."
          }
        });
      }

      try {
        const data = await removeStudentStudyBookmark(request.auth!.userId, String(request.params.bookmarkId));

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "BOOKMARK_NOT_FOUND",
              message: "The bookmark could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BOOKMARK_DELETE_FAILED",
            message: "Could not remove the bookmark."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/student/study-center/notes",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for notes."
          }
        });
      }

      try {
        const query = parseStudyNotesQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await listStudentStudyNotes(request.auth!.userId, query);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The notes query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "NOTES_FETCH_FAILED",
            message: "Could not load study notes."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/student/study-center/notes",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for notes."
          }
        });
      }

      try {
        const payload = parseStudyNoteInput(request.body ?? {});
        const data = await createStudentStudyNote(request.auth!.userId, payload);

        return response.status(201).json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The note payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "NOTE_CREATE_FAILED",
            message: "Could not save the study note."
          }
        });
      }
    }
  );

  app.patch(
    "/api/v1/student/study-center/notes/:noteId",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for notes."
          }
        });
      }

      try {
        const payload = parseStudyNoteInput(request.body ?? {});
        const data = await updateStudentStudyNote(request.auth!.userId, String(request.params.noteId), payload);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "NOTE_NOT_FOUND",
              message: "The study note could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The note payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "NOTE_UPDATE_FAILED",
            message: "Could not update the study note."
          }
        });
      }
    }
  );

  app.delete(
    "/api/v1/student/study-center/notes/:noteId",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for notes."
          }
        });
      }

      try {
        const data = await deleteStudentStudyNote(request.auth!.userId, String(request.params.noteId));

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "NOTE_NOT_FOUND",
              message: "The study note could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "NOTE_DELETE_FAILED",
            message: "Could not delete the study note."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/student/study-center/downloads",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for download history."
          }
        });
      }

      try {
        const query = parseStudyNotesQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await listStudentStudyDownloads(request.auth!.userId, query);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The download query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "DOWNLOADS_FETCH_FAILED",
            message: "Could not load the download history."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/student/study-center/downloads",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for download history."
          }
        });
      }

      try {
        const payload = parseStudyDownloadInput(request.body ?? {});
        const data = await recordStudentStudyDownload(request.auth!.userId, payload);

        return response.status(201).json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The download payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "DOWNLOAD_RECORD_FAILED",
            message: "Could not record the download."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/student/study-center/search",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for study center search."
          }
        });
      }

      try {
        const query = parseStudySearchQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await searchStudentStudyCenter(request.auth!.userId, query);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The study center search query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "STUDY_CENTER_SEARCH_FAILED",
            message: "Could not search the study center."
          }
        });
      }
    }
  );

  // CBT Admin Endpoints
  const adminCbtHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT management."
        }
      });
    }

    try {
      const filters = parseCbtFilters(request.query as Record<string, string | string[] | undefined>);
      const data = await listCbts(filters);
      return response.json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return response.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The CBT filters are invalid.",
            details: error.flatten()
          }
        });
      }

      if (error instanceof Error) {
        const validationMessages: Record<string, string> = {
          CHOICE_QUESTIONS_REQUIRE_AT_LEAST_TWO_OPTIONS: "Objective questions must include at least two answer options.",
          MULTIPLE_SELECT_QUESTIONS_REQUIRE_A_CORRECT_OPTION: "Multiple-select questions need at least one correct answer.",
          MULTIPLE_SELECT_QUESTIONS_REQUIRE_AT_LEAST_TWO_OPTIONS: "Multiple-select questions must include at least two options.",
          SHORT_ANSWER_QUESTIONS_REQUIRE_ACCEPTED_ANSWERS: "Short-answer questions need at least one accepted answer for automatic grading.",
          SINGLE_ANSWER_QUESTIONS_REQUIRE_ONE_CORRECT_OPTION: "Single-answer questions must have exactly one correct option.",
          TRUE_FALSE_QUESTIONS_MUST_USE_TRUE_AND_FALSE_OPTIONS: "True/False questions must use True and False as the two options.",
          TRUE_FALSE_QUESTIONS_REQUIRE_TWO_OPTIONS: "True/False questions must contain exactly two options."
        };

        if (validationMessages[error.message]) {
          return response.status(400).json({
            success: false,
            error: {
              code: "QUESTION_CONFIGURATION_INVALID",
              message: validationMessages[error.message]
            }
          });
        }
      }

      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CBT_LIST_FAILED",
          message: "Could not list CBTs."
        }
      });
    }
  };
  app.get("/api/v1/admin/cbts", authenticateRequest, requireAdminRequest, adminCbtHandler);
  app.get("/api/v1/admin/cbt", authenticateRequest, requireAdminRequest, adminCbtHandler);

  const adminCbtDetailHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT details."
        }
      });
    }

    try {
      const data = await getCbtDetail(String(request.params.cbtId));
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "CBT_NOT_FOUND",
            message: "CBT not found."
          }
        });
      }
      return response.json({ success: true, data });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CBT_DETAIL_FAILED",
          message: "Could not get CBT details."
        }
      });
    }
  };
  app.get("/api/v1/admin/cbts/:cbtId", authenticateRequest, requireAdminRequest, adminCbtDetailHandler);
  app.get("/api/v1/admin/cbt/:cbtId", authenticateRequest, requireAdminRequest, adminCbtDetailHandler);

  const adminCbtCreateHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT creation."
        }
      });
    }

    try {
      const input = parseCbtInput(request.body ?? {});
      const data = await createCbt(input, request.auth!.userId);
      return response.status(201).json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return response.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The CBT input is invalid.",
            details: error.flatten()
          }
        });
      }

      if (error instanceof Error) {
        const validationMessages: Record<string, string> = {
          CHOICE_QUESTIONS_REQUIRE_AT_LEAST_TWO_OPTIONS: "Objective questions must include at least two answer options.",
          MULTIPLE_SELECT_QUESTIONS_REQUIRE_A_CORRECT_OPTION: "Multiple-select questions need at least one correct answer.",
          MULTIPLE_SELECT_QUESTIONS_REQUIRE_AT_LEAST_TWO_OPTIONS: "Multiple-select questions must include at least two options.",
          SHORT_ANSWER_QUESTIONS_REQUIRE_ACCEPTED_ANSWERS: "Short-answer questions need at least one accepted answer for automatic grading.",
          SINGLE_ANSWER_QUESTIONS_REQUIRE_ONE_CORRECT_OPTION: "Single-answer questions must have exactly one correct option.",
          TRUE_FALSE_QUESTIONS_MUST_USE_TRUE_AND_FALSE_OPTIONS: "True/False questions must use True and False as the two options.",
          TRUE_FALSE_QUESTIONS_REQUIRE_TWO_OPTIONS: "True/False questions must contain exactly two options."
        };

        if (validationMessages[error.message]) {
          return response.status(400).json({
            success: false,
            error: {
              code: "QUESTION_CONFIGURATION_INVALID",
              message: validationMessages[error.message]
            }
          });
        }
      }

      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CBT_CREATE_FAILED",
          message: "Could not create CBT."
        }
      });
    }
  };
  app.post("/api/v1/admin/cbts", authenticateRequest, requireAdminRequest, adminCbtCreateHandler);
  app.post("/api/v1/admin/cbt", authenticateRequest, requireAdminRequest, adminCbtCreateHandler);

  const adminCbtUpdateHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT updates."
        }
      });
    }

    try {
      const input = parseCbtInput(request.body ?? {});
      const data = await updateCbt(String(request.params.cbtId), input);
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "CBT_NOT_FOUND",
            message: "CBT not found."
          }
        });
      }
      return response.json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return response.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The CBT input is invalid.",
            details: error.flatten()
          }
        });
      }
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CBT_UPDATE_FAILED",
          message: "Could not update CBT."
        }
      });
    }
  };
  app.put("/api/v1/admin/cbts/:cbtId", authenticateRequest, requireAdminRequest, adminCbtUpdateHandler);
  app.put("/api/v1/admin/cbt/:cbtId", authenticateRequest, requireAdminRequest, adminCbtUpdateHandler);
  app.patch("/api/v1/admin/cbts/:cbtId", authenticateRequest, requireAdminRequest, adminCbtUpdateHandler);
  app.patch("/api/v1/admin/cbt/:cbtId", authenticateRequest, requireAdminRequest, adminCbtUpdateHandler);

  const adminCbtDeleteHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT deletion."
        }
      });
    }

    try {
      const data = await deleteCbt(String(request.params.cbtId));
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "CBT_NOT_FOUND",
            message: "CBT not found."
          }
        });
      }
      return response.json({ success: true, data });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CBT_DELETE_FAILED",
          message: "Could not delete CBT."
        }
      });
    }
  };
  app.delete("/api/v1/admin/cbts/:cbtId", authenticateRequest, requireAdminRequest, adminCbtDeleteHandler);
  app.delete("/api/v1/admin/cbt/:cbtId", authenticateRequest, requireAdminRequest, adminCbtDeleteHandler);

  const adminCbtPublishHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT publishing."
        }
      });
    }

    try {
      const data = await publishCbt(String(request.params.cbtId));
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "CBT_NOT_FOUND",
            message: "CBT not found."
          }
        });
      }

      return response.json({ success: true, data });
    } catch (error) {
      if (error instanceof Error && error.message === "Add at least one question before publishing this CBT.") {
        return response.status(400).json({
          success: false,
          error: {
            code: "CBT_PUBLISH_INVALID",
            message: error.message
          }
        });
      }

      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CBT_PUBLISH_FAILED",
          message: "Could not publish CBT."
        }
      });
    }
  };
  app.patch("/api/v1/admin/cbts/:cbtId/publish", authenticateRequest, requireAdminRequest, adminCbtPublishHandler);
  app.patch("/api/v1/admin/cbt/:cbtId/publish", authenticateRequest, requireAdminRequest, adminCbtPublishHandler);

  const adminCbtUnpublishHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT unpublishing."
        }
      });
    }

    try {
      const data = await unpublishCbt(String(request.params.cbtId));
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "CBT_NOT_FOUND",
            message: "CBT not found."
          }
        });
      }

      return response.json({ success: true, data });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CBT_UNPUBLISH_FAILED",
          message: "Could not unpublish CBT."
        }
      });
    }
  };
  app.patch("/api/v1/admin/cbts/:cbtId/unpublish", authenticateRequest, requireAdminRequest, adminCbtUnpublishHandler);
  app.patch("/api/v1/admin/cbt/:cbtId/unpublish", authenticateRequest, requireAdminRequest, adminCbtUnpublishHandler);

  const adminCbtDuplicateHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT duplication."
        }
      });
    }

    try {
      const data = await duplicateCbt(String(request.params.cbtId), request.auth!.userId);
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "CBT_NOT_FOUND",
            message: "CBT not found."
          }
        });
      }
      return response.json({ success: true, data });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CBT_DUPLICATE_FAILED",
          message: "Could not duplicate CBT."
        }
      });
    }
  };
  app.post("/api/v1/admin/cbts/:cbtId/duplicate", authenticateRequest, requireAdminRequest, adminCbtDuplicateHandler);
  app.post("/api/v1/admin/cbt/:cbtId/duplicate", authenticateRequest, requireAdminRequest, adminCbtDuplicateHandler);

  const adminCbtResultsHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT results."
        }
      });
    }

    try {
      const data = await getCbtResults(String(request.params.cbtId));
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "CBT_NOT_FOUND",
            message: "CBT not found."
          }
        });
      }
      return response.json({ success: true, data });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CBT_RESULTS_FAILED",
          message: "Could not get CBT results."
        }
      });
    }
  };
  app.get("/api/v1/admin/cbts/:cbtId/results", authenticateRequest, requireAdminRequest, adminCbtResultsHandler);
  app.get("/api/v1/admin/cbt/:cbtId/results", authenticateRequest, requireAdminRequest, adminCbtResultsHandler);

  const adminCbtResultsExportHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT result exports."
        }
      });
    }

    try {
      const data = await getCbtResults(String(request.params.cbtId));
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "CBT_NOT_FOUND",
            message: "CBT not found."
          }
        });
      }

      const header = [
        "Student Name",
        "Student Email",
        "Attempt Number",
        "Started At",
        "Submitted At",
        "Answered Count",
        "Correct Count",
        "Earned Points",
        "Total Points",
        "Percentage Score",
        "Passed"
      ];

      const rows = data.attempts.map((attempt) => [
        attempt.user.fullName,
        attempt.user.email,
        attempt.attemptNumber,
        attempt.startedAt,
        attempt.submittedAt ?? "",
        attempt.result?.answeredCount ?? "",
        attempt.result?.correctCount ?? "",
        attempt.result?.earnedPoints ?? "",
        attempt.result?.totalPoints ?? "",
        attempt.result?.percentageScore ?? "",
        attempt.result?.passed ?? ""
      ]);

      const csv = `\uFEFF${[header, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n")}`;

      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${data.cbt.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-results-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`
      );

      return response.send(csv);
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "CBT_RESULTS_EXPORT_FAILED",
          message: "Could not export CBT results."
        }
      });
    }
  };
  app.get("/api/v1/admin/cbts/:cbtId/results/export", authenticateRequest, requireAdminRequest, adminCbtResultsExportHandler);
  app.get("/api/v1/admin/cbt/:cbtId/results/export", authenticateRequest, requireAdminRequest, adminCbtResultsExportHandler);

  const adminQuestionListHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT questions."
        }
      });
    }

    try {
      const filters = parseQuestionFilters(request.query as Record<string, string | string[] | undefined>);
      const data = await listQuestions(filters);
      return response.json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return response.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The question filters are invalid.",
            details: error.flatten()
          }
        });
      }
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "QUESTION_LIST_FAILED",
          message: "Could not list questions."
        }
      });
    }
  };
  app.get("/api/v1/admin/cbt-questions", authenticateRequest, requireAdminRequest, adminQuestionListHandler);
  app.get("/api/v1/admin/cbt/questions", authenticateRequest, requireAdminRequest, adminQuestionListHandler);

  const adminQuestionDetailHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for question details."
        }
      });
    }

    try {
      const data = await getQuestionDetail(String(request.params.questionId));
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "QUESTION_NOT_FOUND",
            message: "Question not found."
          }
        });
      }
      return response.json({ success: true, data });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "QUESTION_DETAIL_FAILED",
          message: "Could not get question details."
        }
      });
    }
  };
  app.get("/api/v1/admin/cbt-questions/:questionId", authenticateRequest, requireAdminRequest, adminQuestionDetailHandler);
  app.get("/api/v1/admin/cbt/questions/:questionId", authenticateRequest, requireAdminRequest, adminQuestionDetailHandler);

  const adminQuestionCreateHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for question creation."
        }
      });
    }

    try {
      const input = parseQuestionInput(request.body ?? {});
      const data = await createQuestion(input);
      return response.status(201).json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return response.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The question input is invalid.",
            details: error.flatten()
          }
        });
      }
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "QUESTION_CREATE_FAILED",
          message: "Could not create question."
        }
      });
    }
  };
  app.post("/api/v1/admin/cbt-questions", authenticateRequest, requireAdminRequest, adminQuestionCreateHandler);
  app.post("/api/v1/admin/cbt/questions", authenticateRequest, requireAdminRequest, adminQuestionCreateHandler);

  const adminQuestionUpdateHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for question updates."
        }
      });
    }

    try {
      const input = parseQuestionInput(request.body ?? {});
      const data = await updateQuestion(String(request.params.questionId), input);
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "QUESTION_NOT_FOUND",
            message: "Question not found."
          }
        });
      }
      return response.json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return response.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The question input is invalid.",
            details: error.flatten()
          }
        });
      }
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "QUESTION_UPDATE_FAILED",
          message: "Could not update question."
        }
      });
    }
  };
  app.put("/api/v1/admin/cbt-questions/:questionId", authenticateRequest, requireAdminRequest, adminQuestionUpdateHandler);
  app.put("/api/v1/admin/cbt/questions/:questionId", authenticateRequest, requireAdminRequest, adminQuestionUpdateHandler);
  app.patch("/api/v1/admin/cbt-questions/:questionId", authenticateRequest, requireAdminRequest, adminQuestionUpdateHandler);
  app.patch("/api/v1/admin/cbt/questions/:questionId", authenticateRequest, requireAdminRequest, adminQuestionUpdateHandler);

  const adminQuestionDeleteHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for question deletion."
        }
      });
    }

    try {
      const data = await deleteQuestion(String(request.params.questionId));
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "QUESTION_NOT_FOUND",
            message: "Question not found."
          }
        });
      }
      return response.json({ success: true, data });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "QUESTION_DELETE_FAILED",
          message: "Could not delete question."
        }
      });
    }
  };
  app.delete("/api/v1/admin/cbt-questions/:questionId", authenticateRequest, requireAdminRequest, adminQuestionDeleteHandler);
  app.delete("/api/v1/admin/cbt/questions/:questionId", authenticateRequest, requireAdminRequest, adminQuestionDeleteHandler);

  const adminAddQuestionToCbtHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for adding questions to CBT."
        }
      });
    }

    try {
      const { displayOrder, questionId } = request.body as { displayOrder?: number; questionId?: string };

      if (!questionId) {
        return response.status(400).json({
          success: false,
          error: {
            code: "QUESTION_ID_REQUIRED",
            message: "Select a question to add to this CBT."
          }
        });
      }
      const data = await addQuestionToCbt(String(request.params.cbtId), questionId, displayOrder);
      return response.json({ success: true, data });
    } catch (error) {
      if (error instanceof Error && error.message === "CBT_NOT_FOUND") {
        return response.status(404).json({
          success: false,
          error: {
            code: "CBT_NOT_FOUND",
            message: "CBT not found."
          }
        });
      }

      if (error instanceof Error && error.message === "QUESTION_NOT_FOUND") {
        return response.status(404).json({
          success: false,
          error: {
            code: "QUESTION_NOT_FOUND",
            message: "Question not found."
          }
        });
      }

      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "QUESTION_ADD_FAILED",
          message: "Could not add question to CBT."
        }
      });
    }
  };
  app.post("/api/v1/admin/cbts/:cbtId/questions", authenticateRequest, requireAdminRequest, adminAddQuestionToCbtHandler);
  app.post("/api/v1/admin/cbt/:cbtId/questions", authenticateRequest, requireAdminRequest, adminAddQuestionToCbtHandler);

  const adminRemoveQuestionFromCbtHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for removing questions from CBT."
        }
      });
    }

    try {
      const resolvedCbtId =
        typeof request.params.cbtId === "string" && request.params.cbtId
          ? request.params.cbtId
          : (await getQuestionDetail(String(request.params.questionId)))?.cbtId;

      if (!resolvedCbtId) {
        return response.status(404).json({
          success: false,
          error: {
            code: "QUESTION_NOT_FOUND",
            message: "Question not found in this CBT."
          }
        });
      }

      const data = await removeQuestionFromCbt(resolvedCbtId, String(request.params.questionId));
      return response.json({ success: true, data });
    } catch (error) {
      if (error instanceof Error && error.message === "QUESTION_NOT_FOUND") {
        return response.status(404).json({
          success: false,
          error: {
            code: "QUESTION_NOT_FOUND",
            message: "Question not found in this CBT."
          }
        });
      }

      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "QUESTION_REMOVE_FAILED",
          message: "Could not remove question from CBT."
        }
      });
    }
  };
  app.delete(
    "/api/v1/admin/cbts/:cbtId/questions/:questionId",
    authenticateRequest,
    requireAdminRequest,
    adminRemoveQuestionFromCbtHandler
  );
  app.delete(
    "/api/v1/admin/cbt/:cbtId/questions/:questionId",
    authenticateRequest,
    requireAdminRequest,
    adminRemoveQuestionFromCbtHandler
  );
  app.delete("/api/v1/admin/cbt-questions/:questionId/cbt", authenticateRequest, requireAdminRequest, adminRemoveQuestionFromCbtHandler);
  app.delete("/api/v1/admin/cbt/questions/:questionId/cbt", authenticateRequest, requireAdminRequest, adminRemoveQuestionFromCbtHandler);

  // CBT Student Endpoints
  const studentCbtListHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for student CBTs."
        }
      });
    }

    try {
      const data = await listStudentCbts(request.auth!.userId);
      return response.json({ success: true, data });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "STUDENT_CBT_LIST_FAILED",
          message: "Could not list student CBTs."
        }
      });
    }
  };
  app.get("/api/v1/student/cbts", authenticateRequest, forbidJudgeRequest, studentCbtListHandler);
  app.get("/api/v1/student/cbt", authenticateRequest, forbidJudgeRequest, studentCbtListHandler);

  const studentCbtDetailHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT details."
        }
      });
    }

    try {
      const data = await getCbtForStudent(String(request.params.cbtId), request.auth!.userId);
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "CBT_NOT_FOUND",
            message: "CBT not found or not available."
          }
        });
      }
      return response.json({ success: true, data });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "STUDENT_CBT_DETAIL_FAILED",
          message: "Could not get CBT details."
        }
      });
    }
  };
  app.get("/api/v1/student/cbts/:cbtId", authenticateRequest, forbidJudgeRequest, studentCbtDetailHandler);
  app.get("/api/v1/student/cbt/:cbtId", authenticateRequest, forbidJudgeRequest, studentCbtDetailHandler);

  const studentStartCbtAttemptHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for starting CBT attempts."
        }
      });
    }

    try {
      const input = parseStartAttemptInput({
        cbtId: String(request.params.cbtId ?? (request.body as { cbtId?: string } | undefined)?.cbtId ?? "")
      });
      const data = await startCbtAttempt(input, request.auth!.userId);
      return response.status(201).json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return response.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The attempt start input is invalid.",
            details: error.flatten()
          }
        });
      }
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "ATTEMPT_START_FAILED",
          message: error instanceof Error ? error.message : "Could not start CBT attempt."
        }
      });
    }
  };
  app.post("/api/v1/student/cbt-attempts", authenticateRequest, forbidJudgeRequest, studentStartCbtAttemptHandler);
  app.post("/api/v1/student/cbt/:cbtId/start", authenticateRequest, forbidJudgeRequest, studentStartCbtAttemptHandler);

  const studentCbtAttemptDetailHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT attempt details."
        }
      });
    }

    try {
      const data = await getCbtAttemptForStudent(String(request.params.attemptId), request.auth!.userId);
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "ATTEMPT_NOT_FOUND",
            message: "CBT attempt not found."
          }
        });
      }
      return response.json({ success: true, data });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "ATTEMPT_DETAIL_FAILED",
          message: "Could not get CBT attempt details."
        }
      });
    }
  };
  app.get("/api/v1/student/cbt-attempts/:attemptId", authenticateRequest, forbidJudgeRequest, studentCbtAttemptDetailHandler);
  app.get("/api/v1/student/cbt/attempts/:attemptId", authenticateRequest, forbidJudgeRequest, studentCbtAttemptDetailHandler);

  const studentSaveCbtAnswerHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for saving CBT answers."
        }
      });
    }

    try {
      const body = (request.body ?? {}) as Partial<{
        attemptId: string;
        answerText: string;
        markedForReview: boolean;
        questionId: string;
        selectedOptionIds: string[];
      }> & Partial<{ answer: string; answers: string[]; isMarkedForReview: boolean }>;

      const input = parseSaveAnswerInput({
        attemptId: String(request.params.attemptId ?? body.attemptId ?? ""),
        questionId: body.questionId,
        answerText: body.answerText ?? body.answer ?? "",
        selectedOptionIds: body.selectedOptionIds ?? body.answers ?? [],
        markedForReview: body.markedForReview ?? body.isMarkedForReview ?? false
      });
      const data = await saveCbtAnswer(input, request.auth!.userId);
      return response.json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return response.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The answer input is invalid.",
            details: error.flatten()
          }
        });
      }
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "ANSWER_SAVE_FAILED",
          message: error instanceof Error ? error.message : "Could not save answer."
        }
      });
    }
  };
  app.post("/api/v1/student/cbt-answers", authenticateRequest, forbidJudgeRequest, studentSaveCbtAnswerHandler);
  app.post(
    "/api/v1/student/cbt/attempts/:attemptId/answers",
    authenticateRequest,
    forbidJudgeRequest,
    studentSaveCbtAnswerHandler
  );

  const studentSubmitCbtAttemptHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for submitting CBT attempts."
        }
      });
    }

    try {
      const input = parseSubmitAttemptInput({ attemptId: String(request.params.attemptId) });
      const data = await submitCbtAttempt(input, request.auth!.userId);
      return response.json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return response.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The submit input is invalid.",
            details: error.flatten()
          }
        });
      }
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "ATTEMPT_SUBMIT_FAILED",
          message: error instanceof Error ? error.message : "Could not submit attempt."
        }
      });
    }
  };
  app.post(
    "/api/v1/student/cbt-attempts/:attemptId/submit",
    authenticateRequest,
    forbidJudgeRequest,
    studentSubmitCbtAttemptHandler
  );
  app.post(
    "/api/v1/student/cbt/attempts/:attemptId/submit",
    authenticateRequest,
    forbidJudgeRequest,
    studentSubmitCbtAttemptHandler
  );

  const studentCbtResultsHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for student CBT results."
        }
      });
    }

    try {
      const data = await getStudentCbtResults(request.auth!.userId);
      return response.json({ success: true, data });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "STUDENT_RESULTS_FAILED",
          message: "Could not get student CBT results."
        }
      });
    }
  };
  app.get("/api/v1/student/cbt-results", authenticateRequest, forbidJudgeRequest, studentCbtResultsHandler);
  app.get("/api/v1/student/cbt/results", authenticateRequest, forbidJudgeRequest, studentCbtResultsHandler);

  const studentCbtAttemptResultHandler = async (request: AuthenticatedRequest, response: Response) => {
    if (!useDatabase) {
      return response.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is required for CBT attempt results."
        }
      });
    }

    try {
      const data = await getCbtAttemptResult(String(request.params.attemptId), request.auth!.userId);
      if (!data) {
        return response.status(404).json({
          success: false,
          error: {
            code: "ATTEMPT_NOT_FOUND",
            message: "CBT attempt not found."
          }
        });
      }
      return response.json({ success: true, data });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: {
          code: "ATTEMPT_RESULT_FAILED",
          message: "Could not get attempt result."
        }
      });
    }
  };
  app.get(
    "/api/v1/student/cbt-attempts/:attemptId/result",
    authenticateRequest,
    forbidJudgeRequest,
    studentCbtAttemptResultHandler
  );
  app.get(
    "/api/v1/student/cbt/attempts/:attemptId/result",
    authenticateRequest,
    forbidJudgeRequest,
    studentCbtAttemptResultHandler
  );

  app.get(
    ["/api/v1/library/bar-final-exams-nls-mcq/subjects", "/api/v1/library/bar-final-exams-mls-mcq/subjects"],
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bar final exam subjects."
          }
        });
      }

      try {
        const query = parseStudentBarFinalExamSubjectsQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await listStudentBarFinalExamSubjects(query);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bar final exam subjects query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_SUBJECTS_FAILED",
            message: "Could not load bar final exam subjects."
          }
        });
      }
    }
  );

  app.get(
    ["/api/v1/library/bar-final-exams-nls-mcq/questions", "/api/v1/library/bar-final-exams-mls-mcq/questions"],
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bar final exam questions."
          }
        });
      }

      try {
        const query = parseStudentBarFinalExamQuestionsQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await listStudentBarFinalExamQuestions(query);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bar final exam question query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_QUESTIONS_FAILED",
            message: "Could not load bar final exam questions."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/bar-final-exams-mcq/subjects",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bar final exam MCQ subjects."
          }
        });
      }

      try {
        const query = parseStudentBarFinalExamSubjectsQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await listStudentBarFinalExamMcqSubjects(query);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bar final exam MCQ subjects query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_MCQ_SUBJECTS_FAILED",
            message: "Could not load bar final exam MCQ subjects."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/bar-final-exams-mcq/questions",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bar final exam MCQ questions."
          }
        });
      }

      try {
        const query = parseStudentBarFinalExamMcqQuestionsQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await listStudentBarFinalExamMcqQuestions(query);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bar final exam MCQ questions query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_MCQ_QUESTIONS_FAILED",
            message: "Could not load bar final exam MCQ questions."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/library/bar-final-exams-mcq/questions/:questionId/attempt",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bar final exam MCQ attempts."
          }
        });
      }

      try {
        const payload = parseStudentBarFinalExamMcqAttemptInput(request.body);
        const data = await submitStudentBarFinalExamMcqAttempt(
          request.auth!.userId,
          String(request.params.questionId),
          payload
        );

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "BAR_FINAL_EXAMS_MCQ_NOT_FOUND",
              message: "The requested bar final exam MCQ question could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bar final exam MCQ attempt payload is invalid.",
              details: error.flatten()
            }
          });
        }

        if (error instanceof Error && error.message === "INVALID_OPTION") {
          return response.status(400).json({
            success: false,
            error: {
              code: "INVALID_OPTION",
              message: "The selected answer option is invalid."
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "BAR_FINAL_EXAMS_MCQ_ATTEMPT_FAILED",
            message: "Could not submit the MCQ attempt."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/law-reports/:materialId",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the law report reader."
          }
        });
      }

      try {
        const data = await getLibraryMaterial("law-reports", String(request.params.materialId), request.auth!.userId);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "LIBRARY_MATERIAL_NOT_FOUND",
              message: "The requested law report could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "LIBRARY_MATERIAL_FETCH_FAILED",
            message: "Could not load the law report."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/helarpedia/:materialId",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the Helarpedia reader."
          }
        });
      }

      try {
        const data = await getLibraryMaterial("helarpedia", String(request.params.materialId), request.auth!.userId);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "LIBRARY_MATERIAL_NOT_FOUND",
              message: "The requested Helarpedia entry could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "LIBRARY_MATERIAL_FETCH_FAILED",
            message: "Could not load the Helarpedia entry."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/library/law-reports/:materialId/reading-sessions",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for reading analytics."
          }
        });
      }

      try {
        const session = await createLawReportReadingSession(String(request.params.materialId), request.auth!.userId);

        return response.status(201).json({
          success: true,
          data: session
        });
      } catch (error) {
        if (error instanceof Error && error.message === "LIBRARY_MATERIAL_NOT_FOUND") {
          return response.status(404).json({
            success: false,
            error: {
              code: "LIBRARY_MATERIAL_NOT_FOUND",
              message: "The requested law report could not be found."
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "READING_SESSION_CREATE_FAILED",
            message: "Could not start the law report reading session."
          }
        });
      }
    }
  );

  app.patch(
    "/api/v1/library/law-reports/reading-sessions/:sessionId",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for reading analytics."
          }
        });
      }

      try {
        const payload = lawReportReadingSessionUpdateSchema.parse(request.body ?? {});
        const session = await updateLawReportReadingSession(String(request.params.sessionId), request.auth!.userId, payload);

        if (!session) {
          return response.status(404).json({
            success: false,
            error: {
              code: "READING_SESSION_NOT_FOUND",
              message: "The reading session could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data: session
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The reading session update is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "READING_SESSION_UPDATE_FAILED",
            message: "Could not update the law report reading session."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/subject-summary-module/subjects",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subject summaries."
          }
        });
      }

      try {
        const query = parseStudentSubjectSummarySubjectsQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await listStudentSubjectSummarySubjects(request.auth!.userId, query.search, query.moduleType);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summary subject query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_MODULE_SUBJECTS_FAILED",
            message: "Could not load subject summaries."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/subject-summary-module/topics",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subject summaries."
          }
        });
      }

      try {
        const query = parseStudentSubjectSummaryTopicsQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await listStudentSubjectSummaryTopics(request.auth!.userId, query);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summary topics query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_MODULE_TOPICS_FAILED",
            message: "Could not load subject summary topics."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/subject-summary-module/entries",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subject summary entries."
          }
        });
      }

      try {
        const query = parseStudentSubjectSummaryEntriesQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await getStudentSubjectSummaryRevisionView(request.auth!.userId, query);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "SUBJECT_NOT_FOUND",
              message: "The requested subject could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The subject summary revision query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_MODULE_ENTRIES_FAILED",
            message: "Could not load the subject summary revision guide."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/subject-summaries/hierarchy",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the subject summaries workspace."
          }
        });
      }

      try {
        const query = parseSubjectSummaryHierarchyQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await getPublishedSubjectSummaryHierarchy(query);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The published subject summaries hierarchy query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_HIERARCHY_FAILED",
            message: "Could not load the published subject summary hierarchy."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/subject-summaries/hierarchy/type/:caseType",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the subject summaries workspace."
          }
        });
      }

      try {
        const query = parseSubjectSummaryHierarchyQuery({
          ...(request.query as Record<string, string | string[] | undefined>),
          caseType: String(request.params.caseType)
        });
        const data = await getPublishedSubjectSummaryHierarchy(query);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The published subject summaries hierarchy query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_HIERARCHY_FAILED",
            message: "Could not load the published subject summary hierarchy."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/subject-summaries/hierarchy/subjects/:subjectId/topics",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for published subject summary topics."
          }
        });
      }

      try {
        const query = parseSubjectSummaryHierarchyQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await getPublishedSubjectSummaryHierarchyTopics(String(request.params.subjectId), query);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The published subject summary topic query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_TOPIC_FETCH_FAILED",
            message: "Could not load published subject summary topics."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/subject-summaries/hierarchy/subjects/:subjectId/topics/type/:caseType",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for published subject summary topics."
          }
        });
      }

      try {
        const query = parseSubjectSummaryHierarchyQuery({
          ...(request.query as Record<string, string | string[] | undefined>),
          caseType: String(request.params.caseType)
        });
        const data = await getPublishedSubjectSummaryHierarchyTopics(String(request.params.subjectId), query);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The published subject summary topic query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_TOPIC_FETCH_FAILED",
            message: "Could not load published subject summary topics."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/subject-summaries/hierarchy/topics/:topicId/cases",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for published subject summary cases."
          }
        });
      }

      try {
        const query = parseSubjectSummaryHierarchyQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await getPublishedSubjectSummaryHierarchyCases(String(request.params.topicId), query);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The published subject summary case query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_CASE_FETCH_FAILED",
            message: "Could not load published subject summary cases."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/subject-summaries/hierarchy/topics/:topicId/cases/type/:caseType",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for published subject summary cases."
          }
        });
      }

      try {
        const query = parseSubjectSummaryHierarchyQuery({
          ...(request.query as Record<string, string | string[] | undefined>),
          caseType: String(request.params.caseType)
        });
        const data = await getPublishedSubjectSummaryHierarchyCases(String(request.params.topicId), query);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The published subject summary case query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_CASE_FETCH_FAILED",
            message: "Could not load published subject summary cases."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/subject-summaries/cases",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for published subject summary cases."
          }
        });
      }

      try {
        const filters = parsePublishedSubjectSummaryCaseFilters(request.query as Record<string, string | string[] | undefined>);
        const data = await listPublishedSubjectSummaryCases(filters);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The published subject summary case list query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_CASE_LIST_FAILED",
            message: "Could not load published subject summary cases."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/subject-summaries/cases/type/:caseType",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for published subject summary cases."
          }
        });
      }

      try {
        const filters = parsePublishedSubjectSummaryCaseFilters({
          ...(request.query as Record<string, string | string[] | undefined>),
          caseType: String(request.params.caseType)
        });
        const data = await listPublishedSubjectSummaryCases(filters);

        response.set("Cache-Control", "no-store");
        response.set("Vary", "Authorization");
        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The published subject summary case list query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_CASE_LIST_FAILED",
            message: "Could not load published subject summary cases."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/subject-summaries/autocomplete",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for subject summary search."
          }
        });
      }

      try {
        const query = parseSubjectSummaryAutocompleteQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await autocompletePublishedSubjectSummaries(query);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The published subject summary autocomplete query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_AUTOCOMPLETE_FAILED",
            message: "Could not search published subject summaries."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/subject-summaries/cases/:caseId",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for case details."
          }
        });
      }

      try {
        const caseId = String(request.params.caseId);
        const data = await getPublishedSubjectSummaryCaseDetail(caseId, request.auth!.userId);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "CASE_NOT_FOUND",
              message: "The requested published case could not be found."
            }
          });
        }

        await recordSubjectSummaryCaseView(caseId, request.auth!.userId);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_CASE_FETCH_FAILED",
            message: "Could not load the published case."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/subject-summaries/cases/:caseId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for case details."
          }
        });
      }

      try {
        const caseId = String(request.params.caseId);
        const data = await getSubjectSummaryCaseDetail(caseId);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "CASE_NOT_FOUND",
              message: "The requested case could not be found."
            }
          });
        }

        await recordSubjectSummaryCaseView(caseId, request.auth!.userId);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_CASE_FETCH_FAILED",
            message: "Could not load the requested case."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/subject-summaries/cases",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to create cases."
          }
        });
      }

      try {
        const payload = parseSubjectSummaryCaseInput(request.body);
        const data = await createSubjectSummaryCase(payload, request.auth!.userId, request.auth!.roleCodes);

        return response.status(201).json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The case payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_CASE_CREATE_FAILED",
            message: "Could not create the case."
          }
        });
      }
    }
  );

  app.patch(
    "/api/v1/admin/subject-summaries/cases/:caseId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to update cases."
          }
        });
      }

      try {
        const payload = parseSubjectSummaryCaseInput(request.body);
        const data = await updateSubjectSummaryCase(
          String(request.params.caseId),
          payload,
          request.auth!.userId,
          request.auth!.roleCodes
        );

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "CASE_NOT_FOUND",
              message: "The requested case could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The case payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_CASE_UPDATE_FAILED",
            message: "Could not update the case."
          }
        });
      }
    }
  );

  app.delete(
    "/api/v1/admin/subject-summaries/cases/:caseId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to delete cases."
          }
        });
      }

      try {
        const data = await deleteSubjectSummaryCase(String(request.params.caseId), request.auth!.userId);

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "CASE_NOT_FOUND",
              message: "The requested case could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_CASE_DELETE_FAILED",
            message: "Could not delete the case."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/subject-summaries/cases/bulk",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for bulk case actions."
          }
        });
      }

      try {
        const action = parseSubjectSummaryCaseBulkAction(request.body);
        const data = await bulkUpdateSubjectSummaryCases(action, request.auth!.userId, request.auth!.roleCodes);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The bulk case action is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "SUBJECT_SUMMARY_CASE_BULK_FAILED",
            message: "Could not process the bulk case action."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/portal/search",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for portal search."
          }
        });
      }

      try {
        const parsedQuery = parseStudentPortalSearchQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await searchStudentPortal(request.auth!.userId, parsedQuery);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The portal search query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "PORTAL_SEARCH_FAILED",
            message: "Could not search the portal."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/library/search",
    authenticateRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for library search."
          }
        });
      }

      try {
        const parsedQuery = parseAdminLibrarySearchQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await searchLibraryMaterialsForStudents(parsedQuery);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The library search query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "LIBRARY_SEARCH_FAILED",
            message: "Could not search the library."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/library/search",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for library search."
          }
        });
      }

      try {
        const parsedQuery = parseAdminLibrarySearchQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await searchAdminLibraryMaterials(parsedQuery);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The library search query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_LIBRARY_SEARCH_FAILED",
            message: "Could not search the library right now."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/search",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for workspace search."
          }
        });
      }

      try {
        const parsedQuery = parseAdminPortalSearchQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await searchAdminPortal(parsedQuery);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The workspace search query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_SEARCH_FAILED",
            message: "Could not search the workspace right now."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/library/:section/materials",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the admin library workspace."
          }
        });
      }

      try {
        const section = parseAdminLibrarySection(String(request.params.section));
        const filters = parseAdminLibraryFilters(request.query as Record<string, string | string[] | undefined>);
        const data = await listAdminLibraryMaterials(section, filters);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The admin library query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_LIBRARY_FETCH_FAILED",
            message: "Could not load the admin library workspace."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/library/:section/materials/:materialId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the law report reader."
          }
        });
      }

      try {
        const section = parseAdminLibrarySection(String(request.params.section));
        const data = await getAdminLibraryMaterial(section, String(request.params.materialId));

        if (!data) {
          return response.status(404).json({
            success: false,
            error: {
              code: "LIBRARY_MATERIAL_NOT_FOUND",
              message: "The requested library material could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The requested library material route is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_LIBRARY_FETCH_FAILED",
            message: "Could not load the requested library material."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/library/:section/materials",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to create library materials."
          }
        });
      }

      try {
        const section = parseAdminLibrarySection(String(request.params.section));
        // #region debug-point admin-library-create-parse-start
        try {
          void fetch("http://127.0.0.1:7777/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "law-reports-save-failing",
              runId: "pre",
              hypothesisIds: ["H1", "H3", "H6"],
              timestamp: new Date().toISOString(),
              level: "info",
              message: "admin library create route parsing input",
              data: {
                section,
                userId: request.auth?.userId ?? null,
                roleCodes: request.auth?.roleCodes ?? null,
                keys: typeof request.body === "object" && request.body ? Object.keys(request.body).sort() : null,
                bodyIsObject: typeof request.body === "object" && request.body,
                title: typeof request.body === "object" && request.body && "title" in request.body ? String((request.body as { title?: unknown }).title ?? "").slice(0, 80) : null,
                reportNumber: typeof request.body === "object" && request.body && "reportNumber" in request.body ? (request.body as { reportNumber?: unknown }).reportNumber ?? null : null,
                estimatedMins: typeof request.body === "object" && request.body && "estimatedMins" in request.body ? (request.body as { estimatedMins?: unknown }).estimatedMins ?? null : null,
                storageUrlLen: typeof request.body === "object" && request.body && "storageUrl" in request.body ? String((request.body as { storageUrl?: unknown }).storageUrl ?? "").length : null,
                bodyLen: typeof request.body === "object" && request.body && "body" in request.body ? String((request.body as { body?: unknown }).body ?? "").length : null,
                summaryLen: typeof request.body === "object" && request.body && "summary" in request.body ? String((request.body as { summary?: unknown }).summary ?? "").length : null,
                hasBodyChunkToken: typeof request.body === "object" && request.body && "bodyChunkToken" in request.body ? "PRESENT" : "ABSENT",
                hasSummaryChunkToken: typeof request.body === "object" && request.body && "summaryChunkToken" in request.body ? "PRESENT" : "ABSENT",
                bodyChunkTokenValue: typeof request.body === "object" && request.body && "bodyChunkToken" in request.body ? String((request.body as { bodyChunkToken?: unknown }).bodyChunkToken ?? "NULL") : null,
                summaryChunkTokenValue: typeof request.body === "object" && request.body && "summaryChunkToken" in request.body ? String((request.body as { summaryChunkToken?: unknown }).summaryChunkToken ?? "NULL") : null,
                contentLength: request.headers["content-length"] ?? null
              }
            })
          }).catch(() => {});
        } catch {
          /* debug-only */
        }
        console.debug("[debug-law-reports-save-failing][H1|H3|H6] admin library create route parsing input", {
          section,
          userId: request.auth?.userId ?? null,
          roleCodes: request.auth?.roleCodes ?? null,
          keys: typeof request.body === "object" && request.body ? Object.keys(request.body).sort() : null,
          bodyIsObject: typeof request.body === "object" && request.body,
          title: typeof request.body === "object" && request.body && "title" in request.body ? String((request.body as { title?: unknown }).title ?? "").slice(0, 80) : null,
          reportNumber: typeof request.body === "object" && request.body && "reportNumber" in request.body ? (request.body as { reportNumber?: unknown }).reportNumber ?? null : null,
          estimatedMins: typeof request.body === "object" && request.body && "estimatedMins" in request.body ? (request.body as { estimatedMins?: unknown }).estimatedMins ?? null : null,
          storageUrlLen: typeof request.body === "object" && request.body && "storageUrl" in request.body ? String((request.body as { storageUrl?: unknown }).storageUrl ?? "").length : null,
          bodyLen: typeof request.body === "object" && request.body && "body" in request.body ? String((request.body as { body?: unknown }).body ?? "").length : null,
          summaryLen: typeof request.body === "object" && request.body && "summary" in request.body ? String((request.body as { summary?: unknown }).summary ?? "").length : null,
          hasBodyChunkToken: typeof request.body === "object" && request.body && "bodyChunkToken" in request.body ? "PRESENT" : "ABSENT",
          hasSummaryChunkToken: typeof request.body === "object" && request.body && "summaryChunkToken" in request.body ? "PRESENT" : "ABSENT",
          bodyChunkTokenValue: typeof request.body === "object" && request.body && "bodyChunkToken" in request.body ? String((request.body as { bodyChunkToken?: unknown }).bodyChunkToken ?? "NULL") : null,
          summaryChunkTokenValue: typeof request.body === "object" && request.body && "summaryChunkToken" in request.body ? String((request.body as { summaryChunkToken?: unknown }).summaryChunkToken ?? "NULL") : null,
          contentLength: request.headers["content-length"] ?? null
        });
        // #endregion debug-point admin-library-create-parse-start
        const parsed = parseAdminLibraryMaterialInput(request.body);
        const material = await createAdminLibraryMaterial(section, parsed, request.auth!.userId, request.auth!.roleCodes);

        return response.status(201).json({
          success: true,
          data: material
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          // If the frontend submits fields the strict Zod schema doesn't know
          // about, the default "payload invalid" message is useless for admins.
          // Instead, serialize the actual flattened list of field problems so
          // the toast surfaces a hint the admin can act on (e.g.
          // "Unrecognized key: 'outlineItems' — expected one of body, title, …").
          const flattened = error.flatten();
          // #region debug-point admin-library-create-zod-error
          try {
            void fetch("http://127.0.0.1:7777/event", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "law-reports-save-failing",
                runId: "pre",
                hypothesisIds: ["H1", "H3"],
                timestamp: new Date().toISOString(),
                level: "error",
                message: "admin library create zod validation error",
                data: {
                  fieldErrors: flattened.fieldErrors,
                  formErrors: flattened.formErrors,
                  rawKeys: typeof request.body === "object" && request.body ? Object.keys(request.body).sort() : null
                }
              })
            }).catch(() => {});
          } catch {
            /* debug-only */
          }
          console.debug("[debug-law-reports-save-failing][H1|H3] admin library create zod validation error", {
            fieldErrors: flattened.fieldErrors,
            formErrors: flattened.formErrors,
            rawKeys: typeof request.body === "object" && request.body ? Object.keys(request.body).sort() : null
          });
          // #endregion debug-point admin-library-create-zod-error
          const fieldLines = Object.entries(flattened.fieldErrors)
            .map(([field, errors]) => `${field}: ${(errors ?? []).join(", ")}`)
            .concat(flattened.formErrors ?? []);
          const humanMessage =
            fieldLines.length > 0
              ? `The library material payload is invalid: ${fieldLines.join("; ")}`
              : "The library material payload is invalid.";

          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: humanMessage,
              details: flattened
            }
          });
        }

        const classification = classifyAdminLibraryWriteError(error);
        const failure = buildAdminLibraryFailureResponse(
          classification,
          error,
          "Could not create the library material."
        );

        console.error("[admin-library:create] write failed", {
          classification,
          code: failure.code,
          name: error instanceof Error ? error.constructor.name : typeof error,
          message: error instanceof Error ? error.message : String(error)
        });

        return response.status(failure.status).json({
          success: false,
          error: {
            code: failure.code,
            message: failure.message
          }
        });
      }
    }
  );

  app.patch(
    "/api/v1/admin/library/:section/materials/:materialId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to update library materials."
          }
        });
      }

      try {
        const section = parseAdminLibrarySection(String(request.params.section));
        const parsed = parseAdminLibraryMaterialInput(request.body);
        const material = await updateAdminLibraryMaterial(
          section,
          String(request.params.materialId),
          parsed,
          request.auth!.userId,
          request.auth!.roleCodes
        );

        if (!material) {
          return response.status(404).json({
            success: false,
            error: {
              code: "LIBRARY_MATERIAL_NOT_FOUND",
              message: "The requested library material could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data: material
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          const flattened = error.flatten();
          const fieldLines = Object.entries(flattened.fieldErrors)
            .map(([field, errors]) => `${field}: ${(errors ?? []).join(", ")}`)
            .concat(flattened.formErrors ?? []);
          const humanMessage =
            fieldLines.length > 0
              ? `The library material payload is invalid: ${fieldLines.join("; ")}`
              : "The library material payload is invalid.";

          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: humanMessage,
              details: flattened
            }
          });
        }

        const classification = classifyAdminLibraryWriteError(error);
        const failure = buildAdminLibraryFailureResponse(
          classification,
          error,
          "Could not update the library material."
        );

        console.error("[admin-library:update] write failed", {
          classification,
          code: failure.code,
          name: error instanceof Error ? error.constructor.name : typeof error,
          message: error instanceof Error ? error.message : String(error)
        });

        return response.status(failure.status).json({
          success: false,
          error: {
            code: failure.code,
            message: failure.message
          }
        });
      }
    }
  );

  app.delete(
    "/api/v1/admin/library/:section/materials/:materialId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to delete library materials."
          }
        });
      }

      try {
        const section = parseAdminLibrarySection(String(request.params.section));
        const result = await deleteAdminLibraryMaterial(section, String(request.params.materialId), request.auth!.userId);

        if (!result) {
          return response.status(404).json({
            success: false,
            error: {
              code: "LIBRARY_MATERIAL_NOT_FOUND",
              message: "The requested library material could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data: result
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The library request is invalid.",
              details: error.flatten()
            }
          });
        }

        const classification = classifyAdminLibraryWriteError(error);
        const failure = buildAdminLibraryFailureResponse(
          classification,
          error,
          "Could not remove the library material."
        );

        console.error("[admin-library:delete] write failed", {
          classification,
          code: failure.code,
          name: error instanceof Error ? error.constructor.name : typeof error,
          message: error instanceof Error ? error.message : String(error)
        });

        return response.status(failure.status).json({
          success: false,
          error: {
            code: failure.code,
            message: failure.message
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/users/analytics/monthly-registrations",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for user registration analytics."
          }
        });
      }

      try {
        const query = parseAdminUserMonthlyRegistrationsQuery(request.query as Record<string, string | string[] | undefined>);
        const data = await getAdminUserMonthlyRegistrations(query.year);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The registration analytics query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_USER_ANALYTICS_FETCH_FAILED",
            message: "Could not load user registration analytics."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/users",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for the admin users workspace."
          }
        });
      }

      try {
        const filters = parseAdminUserFilters(request.query as Record<string, string | string[] | undefined>);
        const data = await listAdminUsers(filters, request.auth?.roleCodes ?? []);

        return response.json({
          success: true,
          data
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The admin users query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_USERS_FETCH_FAILED",
            message: "Could not load the admin users workspace."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/users",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to create users from the admin workspace."
          }
        });
      }

      if (!request.auth || !(request.auth.roleCodes.includes("super_admin") || request.auth.roleCodes.includes("content_admin"))) {
        return response.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Only super admins and content admins can create users from this workspace."
          }
        });
      }

      try {
        const parsed = parseAdminCreateUserInput(request.body);
        const createdUser = await createAdminUser(parsed, request.auth.userId, request.auth.roleCodes);

        return response.status(201).json({
          success: true,
          data: createdUser
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The create-user payload is invalid.",
              details: error.flatten()
            }
          });
        }

        if (error instanceof Error && error.message === "EMAIL_IN_USE") {
          return response.status(409).json({
            success: false,
            error: {
              code: "EMAIL_IN_USE",
              message: "Another user is already using that email address."
            }
          });
        }

        if (error instanceof Error && error.message.startsWith("UNKNOWN_ROLE_CODES:")) {
          return response.status(400).json({
            success: false,
            error: {
              code: "UNKNOWN_ROLE_CODES",
              message: "One or more selected roles cannot be assigned from the admin workspace.",
              details: error.message.slice("UNKNOWN_ROLE_CODES:".length).split(",").filter(Boolean)
            }
          });
        }

        if (error instanceof Error && error.message === "ROLE_REQUIRED") {
          return response.status(400).json({
            success: false,
            error: {
              code: "ROLE_REQUIRED",
              message: "Select at least one role before creating a user."
            }
          });
        }

        if (error instanceof Error && error.message === "ROLE_ASSIGNMENT_FORBIDDEN") {
          return response.status(403).json({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "You do not have permission to assign roles from this workspace."
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_USER_CREATE_FAILED",
            message: "Could not create the user right now."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/users/export",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to export users."
          }
        });
      }

      try {
        const filters = parseAdminUserFilters(request.query as Record<string, string | string[] | undefined>);
        const csv = await exportAdminUsersCsv(filters);

        response.setHeader("Content-Type", "text/csv; charset=utf-8");
        response.setHeader("Content-Disposition", `attachment; filename="helar-users-${new Date().toISOString().slice(0, 10)}.csv"`);

        return response.send(csv);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The export query is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_USERS_EXPORT_FAILED",
            message: "Could not export the user list."
          }
        });
      }
    }
  );

  app.get(
    "/api/v1/admin/users/:userId",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required for user details."
          }
        });
      }

      try {
        const user = await getAdminUserDetail(String(request.params.userId));

        if (!user) {
          return response.status(404).json({
            success: false,
            error: {
              code: "USER_NOT_FOUND",
              message: "The requested user could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data: user
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_USER_DETAIL_FAILED",
            message: "Could not load the user record."
          }
        });
      }
    }
  );

  app.patch(
    "/api/v1/admin/users/:userId/profile",
    authenticateRequest,
    requireAdminRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to update user profiles."
          }
        });
      }

      try {
        const parsed = parseAdminUserProfileInput(request.body);
        const updatedUser = await updateAdminUserProfile(String(request.params.userId), parsed, request.auth!.userId);

        if (!updatedUser) {
          return response.status(404).json({
            success: false,
            error: {
              code: "USER_NOT_FOUND",
              message: "The requested user could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data: updatedUser
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The user profile payload is invalid.",
              details: error.flatten()
            }
          });
        }

        if (error instanceof Error && error.message === "EMAIL_IN_USE") {
          return response.status(409).json({
            success: false,
            error: {
              code: "EMAIL_IN_USE",
              message: "Another user is already using that email address."
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_USER_PROFILE_UPDATE_FAILED",
            message: "Could not update the user profile."
          }
        });
      }
    }
  );

  app.patch(
    "/api/v1/admin/users/:userId/status",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to update user status."
          }
        });
      }

      try {
        const parsed = parseAdminUserStatusInput(request.body);
        const updatedUser = await updateAdminUserStatus(String(request.params.userId), parsed.status, request.auth!.userId);

        if (!updatedUser) {
          return response.status(404).json({
            success: false,
            error: {
              code: "USER_NOT_FOUND",
              message: "The requested user could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data: updatedUser
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The status update payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_USER_STATUS_UPDATE_FAILED",
            message: "Could not update the user status."
          }
        });
      }
    }
  );

  app.patch(
    "/api/v1/admin/users/:userId/roles",
    authenticateRequest,
    requireAdminRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to update user roles."
          }
        });
      }

      try {
        const parsed = parseAdminUserRolesInput(request.body);
        const updatedUser = await updateAdminUserRoles(String(request.params.userId), parsed.roleCodes, request.auth!.userId);

        if (!updatedUser) {
          return response.status(404).json({
            success: false,
            error: {
              code: "USER_NOT_FOUND",
              message: "The requested user could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data: updatedUser
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The roles update payload is invalid.",
              details: error.flatten()
            }
          });
        }

        if (error instanceof Error && (error.message.startsWith("Unknown role codes:") || error.message === "At least one role code is required.")) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_USER_ROLE_UPDATE_FAILED",
            message: "Could not update the user roles."
          }
        });
      }
    }
  );

  app.patch(
    "/api/v1/admin/users/:userId/password",
    authenticateRequest,
    requireAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to update user passwords."
          }
        });
      }

      try {
        const parsed = parseAdminUserPasswordInput(request.body);
        const updatedUser = await updateAdminUserPassword(
          String(request.params.userId),
          parsed,
          request.auth!.userId,
          request.auth!.roleCodes
        );

        if (!updatedUser) {
          return response.status(404).json({
            success: false,
            error: {
              code: "USER_NOT_FOUND",
              message: "The requested user could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data: updatedUser
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The password update payload is invalid.",
              details: error.flatten()
            }
          });
        }

        if (error instanceof Error && error.message === "PASSWORD_UPDATE_FORBIDDEN") {
          return response.status(403).json({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "You do not have permission to update the password for this user."
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_USER_PASSWORD_UPDATE_FAILED",
            message: "Could not update the user password right now."
          }
        });
      }
    }
  );

  app.post(
    "/api/v1/admin/users/:userId/devices/reset",
    authenticateRequest,
    requireAdminRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to reset user devices."
          }
        });
      }

      try {
        const updatedUser = await resetAdminUserDevices(String(request.params.userId), request.auth!.userId);

        if (!updatedUser) {
          return response.status(404).json({
            success: false,
            error: {
              code: "USER_NOT_FOUND",
              message: "The requested user could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data: updatedUser
        });
      } catch (error) {
        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_USER_DEVICES_RESET_FAILED",
            message: "Could not reset the user devices right now."
          }
        });
      }
    }
  );

  app.patch(
    "/api/v1/admin/users/:userId/device-limit",
    authenticateRequest,
    requireAdminRequest,
    requireSuperAdminRequest,
    async (request: AuthenticatedRequest, response: Response) => {
      if (!useDatabase) {
        return response.status(503).json({
          success: false,
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "The database is required to update device limits."
          }
        });
      }

      try {
        const parsed = parseAdminUserDeviceLimitInput(request.body);
        const updatedUser = await updateAdminUserDeviceLimitOverride(
          String(request.params.userId),
          parsed,
          request.auth!.userId
        );

        if (!updatedUser) {
          return response.status(404).json({
            success: false,
            error: {
              code: "USER_NOT_FOUND",
              message: "The requested user could not be found."
            }
          });
        }

        return response.json({
          success: true,
          data: updatedUser
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The device limit payload is invalid.",
              details: error.flatten()
            }
          });
        }

        console.error(error);
        return response.status(500).json({
          success: false,
          error: {
            code: "ADMIN_USER_DEVICE_LIMIT_UPDATE_FAILED",
            message: "Could not update the device limit right now."
          }
        });
      }
    }
  );

  // Global JSON-safe error handler. Catches SyntaxError from express.json() when a
  // request exceeds the 200mb JSON payload cap and surfaces it as our structured
  // error envelope (instead of Express's default HTML payload). Without this, the
  // admin library create/update routes below would never be reached on huge payloads
  // and the frontend toast would be a generic "Network Error".
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((error: unknown, request: Request, response: Response, _next: (err?: unknown) => void) => {
    const msg = error instanceof Error ? error.message : String(error);

    if (/request entity too large|payload too large|entity.too.large/i.test(msg)) {
      const code = request.path.startsWith("/api/v1/admin/library/")
        ? "LIBRARY_PAYLOAD_TOO_LARGE"
        : "PAYLOAD_TOO_LARGE";
      const message = request.path.startsWith("/api/v1/admin/library/")
        ? "The report you tried to upload is too large for a single request. Please reduce embedded images, remove base64 attachments, or split the report into smaller records, then try again."
        : "Your request was too large. Please reduce the payload size and try again.";

      console.error("[app:payload-too-large]", {
        path: request.path,
        method: request.method,
        code
      });

      return response.status(413).json({
        success: false,
        error: {
          code,
          message
        }
      });
    }

    if (error instanceof SyntaxError) {
      console.error("[app:syntax-error]", {
        path: request.path,
        method: request.method,
        message: msg
      });

      return response.status(400).json({
        success: false,
        error: {
          code: "INVALID_JSON_BODY",
          message: "The request contained invalid JSON."
        }
      });
    }

    const statusCode =
      error instanceof Error && "status" in error && typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 500;
    console.error("[app:unhandled]", {
      path: request.path,
      method: request.method,
      name: error instanceof Error ? error.name : typeof error,
      message: msg
    });
    return response.status(statusCode).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: statusCode === 500 ? "An unexpected error occurred." : msg
      }
    });
  });

  return app;
}
