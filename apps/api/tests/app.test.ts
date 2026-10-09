import {
  ContentPublicationStatus,
  MaterialType,
  SubjectSummaryCaseStatus,
  SubjectSummaryDifficulty,
  SubjectSummaryStatus,
  SubscriptionInterval,
  SubscriptionStatus
} from "@prisma/client";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

describe("LexLearn API", () => {
  it("returns the platform overview payload", async () => {
    const response = await request(createApp({ useDatabase: false })).get("/api/v1/catalog/overview");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.product).toBe("LexLearn");
    expect(response.body.data.featuredCourses).toHaveLength(3);
  });

  it("rejects malformed sign-in payloads", async () => {
    const response = await request(createApp({ useDatabase: false }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "not-an-email", password: "short" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects incorrect credentials when database-backed auth is enabled", async () => {
    const response = await request(createApp({ useDatabase: false }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "Helar123!" });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  }, 45_000);

  it("returns an admin demo user for admin sign-in emails", async () => {
    const response = await request(createApp({ useDatabase: false, allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "Helar123!" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.fullName).toBe("Helar Administrator");
    expect(response.body.data.user.roleCodes).toContain("administrator");
  });

  it("registers a new learner with validated credentials", async () => {
    const response = await request(createApp({ useDatabase: false, allowAuthFallback: true }))
      .post("/api/v1/auth/register")
      .send({
        fullName: "Adaeze Okonkwo",
        email: "adaeze@helar.test",
        password: "Helar123!",
        confirmPassword: "Helar123!"
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.fullName).toBe("Adaeze Okonkwo");
    expect(response.body.data.user.roleCodes).toContain("student");
  });

  it("refreshes a fallback session when a valid refresh token is provided", async () => {
    const signInResponse = await request(createApp({ useDatabase: false, allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "Helar123!" });

    const response = await request(createApp({ useDatabase: false, allowAuthFallback: true }))
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: signInResponse.body.data.refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe("admin@helar.test");
    expect(response.body.data.accessToken).toBeTypeOf("string");
  });

  it("rejects malformed refresh payloads", async () => {
    const response = await request(createApp({ useDatabase: false }))
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("updates a profile with validated address fields", async () => {
    const signInResponse = await request(createApp({ useDatabase: false, allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "student@helar.test", password: "Helar123!" });

    const response = await request(createApp({ useDatabase: false, allowAuthFallback: true }))
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${signInResponse.body.data.accessToken}`)
      .send({
        fullName: "Adaeze Okonkwo",
        phoneNumber: "+234 803 000 0000",
        addressLine1: "12 Marina Street",
        addressLine2: "Suite 4B",
        city: "Lagos",
        state: "Lagos",
        postalCode: "100001",
        country: "Nigeria",
        avatarUrl: "data:image/png;base64,demo"
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.state).toBe("Lagos");
    expect(response.body.data.user.addressLine1).toBe("12 Marina Street");
  });

  it("initializes and verifies a Paystack subscription checkout for monthly billing", async () => {
    const signInResponse = await request(createApp())
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "student@helar.test", password: "Helar123!" });

    expect(signInResponse.status).toBe(200);

    const accessToken = signInResponse.body.data.accessToken as string;
    const originalFetch = global.fetch;
    const originalSecretKey = process.env.PAYSTACK_SECRET_KEY;
    const fetchMock = vi.fn<typeof fetch>();
    let initializedCheckoutEmail = "";

    process.env.PAYSTACK_SECRET_KEY = "sk_test_subscription";

    fetchMock.mockImplementationOnce(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { amount: string; currency: string; email: string; reference: string };

      expect(body.amount).toBe("200000");
      expect(body.currency).toBe("NGN");
      expect(body.email).toMatch(/^paystack-test\+[a-z0-9]+@example\.com$/);
      initializedCheckoutEmail = body.email;

      return {
        ok: true,
        json: async () => ({
          status: true,
          message: "Authorization URL created",
          data: {
            authorization_url: "https://checkout.paystack.com/test-subscription",
            access_code: "test_access_code",
            reference: body.reference
          }
        })
      } as Response;
    });

    global.fetch = fetchMock;

    try {
      const checkoutResponse = await request(createApp())
        .post("/api/v1/subscriptions/checkout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          planCode: "monthly",
          returnUrl: "http://localhost:5173/app/subscription?plan=monthly"
        });

      expect(checkoutResponse.status).toBe(201);
      expect(checkoutResponse.body.success).toBe(true);
      expect(checkoutResponse.body.data.plan.code).toBe("monthly");
      expect(checkoutResponse.body.data.plan.priceMinor).toBe(200000);

      fetchMock.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          status: true,
          message: "Verification successful",
          data: {
            id: 4099260516,
            status: "success",
            reference: checkoutResponse.body.data.reference,
            amount: 200000,
            currency: "NGN",
            paid_at: new Date().toISOString(),
            channel: "card",
            customer: {
              email: initializedCheckoutEmail
            }
          }
        })
      }) as Response);

      const verifyResponse = await request(createApp())
        .post("/api/v1/subscriptions/verify")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          reference: checkoutResponse.body.data.reference
        });

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.success).toBe(true);
      expect(verifyResponse.body.data.payment.status).toBe("SUCCEEDED");
      expect(verifyResponse.body.data.subscription.plan.code).toBe("monthly");
      expect(verifyResponse.body.data.snapshot.activeSubscription.plan.code).toBe("monthly");
    } finally {
      global.fetch = originalFetch;

      if (originalSecretKey) {
        process.env.PAYSTACK_SECRET_KEY = originalSecretKey;
      } else {
        delete process.env.PAYSTACK_SECRET_KEY;
      }
    }
  }, 60_000);

  it("returns a one-week expiry reminder in the subscription snapshot", async () => {
    const signInResponse = await request(createApp())
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "student@helar.test", password: "Helar123!" });

    expect(signInResponse.status).toBe(200);

    const accessToken = signInResponse.body.data.accessToken as string;
    const originalFetch = global.fetch;
    const originalSecretKey = process.env.PAYSTACK_SECRET_KEY;
    const fetchMock = vi.fn<typeof fetch>();
    let initializedCheckoutEmail = "";

    process.env.PAYSTACK_SECRET_KEY = "sk_test_subscription";

    fetchMock.mockImplementationOnce(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { email: string; reference: string };
      initializedCheckoutEmail = body.email;

      return {
        ok: true,
        json: async () => ({
          status: true,
          message: "Authorization URL created",
          data: {
            authorization_url: "https://checkout.paystack.com/test-subscription",
            access_code: "test_access_code",
            reference: body.reference
          }
        })
      } as Response;
    });

    global.fetch = fetchMock;

    try {
      const checkoutResponse = await request(createApp())
        .post("/api/v1/subscriptions/checkout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          planCode: "monthly",
          returnUrl: "http://localhost:5173/app/subscription?plan=monthly"
        });

      expect(checkoutResponse.status).toBe(201);

      fetchMock.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          status: true,
          message: "Verification successful",
          data: {
            id: 4099260517,
            status: "success",
            reference: checkoutResponse.body.data.reference,
            amount: 200000,
            currency: "NGN",
            paid_at: new Date().toISOString(),
            channel: "card",
            customer: {
              email: initializedCheckoutEmail
            }
          }
        })
      }) as Response);

      const verifyResponse = await request(createApp())
        .post("/api/v1/subscriptions/verify")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          reference: checkoutResponse.body.data.reference
        });

      expect(verifyResponse.status).toBe(200);

      await prisma.subscription.update({
        where: {
          id: verifyResponse.body.data.subscription.id as string
        },
        data: {
          endsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)
        }
      });

      const snapshotResponse = await request(createApp())
        .get("/api/v1/subscriptions/me")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(snapshotResponse.status).toBe(200);
      expect(snapshotResponse.body.success).toBe(true);
      expect(snapshotResponse.body.data.activeSubscription.daysUntilExpiry).toBe(6);
      expect(snapshotResponse.body.data.activeSubscription.isExpiringSoon).toBe(true);
      expect(snapshotResponse.body.data.activeSubscription.shouldShowExpiryReminder).toBe(true);
      expect(snapshotResponse.body.data.activeSubscription.expiryReminderMessage).toContain("expires in 6 days");
    } finally {
      global.fetch = originalFetch;

      if (originalSecretKey) {
        process.env.PAYSTACK_SECRET_KEY = originalSecretKey;
      } else {
        delete process.env.PAYSTACK_SECRET_KEY;
      }
    }
  }, 60_000);

  it("limits premium content to previews without an active subscription and restores full access when subscription is active", async () => {
    const previewWordCount = 150;
    const repeatedWords = Array.from({ length: 220 }, (_, index) => `premiumword${index + 1}`).join(" ");
    const uniqueSuffix = Date.now().toString(36);
    const studentSignInResponse = await request(createApp())
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "student@helar.test", password: "Helar123!" });

    expect(studentSignInResponse.status).toBe(200);

    const accessToken = studentSignInResponse.body.data.accessToken as string;
    const studentUserId = studentSignInResponse.body.data.user.id as string;

    await prisma.subscription.updateMany({
      where: {
        deletedAt: null,
        userId: studentUserId
      },
      data: {
        endsAt: new Date(Date.now() - 60_000),
        status: SubscriptionStatus.EXPIRED
      }
    });

    const category = await prisma.category.upsert({
      where: {
        slug: "law-reports"
      },
      update: {
        deletedAt: null,
        name: "Law Reports"
      },
      create: {
        deletedAt: null,
        name: "Law Reports",
        slug: "law-reports"
      }
    });

    const [material, subject] = await Promise.all([
      prisma.studyMaterial.create({
        data: {
          body: `<p>${repeatedWords}</p>`,
          categoryId: category.id,
          deletedAt: null,
          downloadable: true,
          estimatedMins: 12,
          materialType: MaterialType.SUPREME_COURT,
          publicationStatus: ContentPublicationStatus.PUBLISHED,
          reportNumber: `TEST-REPORT-${uniqueSuffix}`,
          storageUrl: `SC/${uniqueSuffix}`,
          summary: `<p>${repeatedWords}</p>`,
          title: `Premium gated report ${uniqueSuffix}`
        }
      }),
      prisma.subjectSummarySubject.create({
        data: {
          deletedAt: null,
          description: "Premium subject access test",
          displayOrder: 1,
          name: `Premium Subject ${uniqueSuffix}`,
          status: SubjectSummaryStatus.ACTIVE
        }
      })
    ]);

    const topic = await prisma.subjectSummaryTopic.create({
      data: {
        deletedAt: null,
        description: "Premium topic access test",
        displayOrder: 1,
        name: `Premium Topic ${uniqueSuffix}`,
        status: SubjectSummaryStatus.ACTIVE,
        subjectId: subject.id
      }
    });

    const summaryCase = await prisma.subjectSummaryCase.create({
      data: {
        attachments: ["https://example.com/full-case.pdf"],
        caseSummary: repeatedWords,
        court: "Supreme Court",
        decisionHolding: repeatedWords,
        deletedAt: null,
        externalReferences: ["https://example.com/reference"],
        facts: repeatedWords,
        issues: repeatedWords,
        keywords: ["premium", "preview"],
        legalPrinciples: ["Principle A", "Principle B"],
        ratioDecidendi: repeatedWords,
        relatedCases: ["Case A"],
        relatedStatutes: ["Statute A"],
        status: SubjectSummaryCaseStatus.PUBLISHED,
        subjectId: subject.id,
        title: `Premium Case ${uniqueSuffix}`,
        topicId: topic.id
      }
    });

    const entry = await prisma.subjectSummaryEntry.create({
      data: {
        answer: `<p>${repeatedWords}</p>`,
        deletedAt: null,
        difficulty: SubjectSummaryDifficulty.INTERMEDIATE,
        displayOrder: 1,
        estimatedReadingTime: 4,
        examTip: repeatedWords,
        keyPrinciple: repeatedWords,
        question: `What is premium access ${uniqueSuffix}?`,
        relatedStatutes: ["Statute A"],
        status: SubjectSummaryCaseStatus.PUBLISHED,
        subjectId: subject.id,
        tags: ["premium", "subscription"]
      }
    });

    await prisma.subjectSummaryEntryCase.create({
      data: {
        caseId: summaryCase.id,
        summaryId: entry.id
      }
    });

    const [previewReportResponse, previewCaseResponse, previewEntriesResponse] = await Promise.all([
      request(createApp())
        .get(`/api/v1/library/law-reports/${material.id}`)
        .set("Authorization", `Bearer ${accessToken}`),
      request(createApp())
        .get(`/api/v1/library/subject-summaries/cases/${summaryCase.id}`)
        .set("Authorization", `Bearer ${accessToken}`),
      request(createApp())
        .get("/api/v1/library/subject-summary-module/entries")
        .query({ subjectId: subject.id })
        .set("Authorization", `Bearer ${accessToken}`)
    ]);

    expect(previewReportResponse.status).toBe(200);
    expect(previewReportResponse.body.data.access.isPreview).toBe(true);
    expect(previewReportResponse.body.data.material.body).toBe("");
    expect(previewReportResponse.body.data.material.downloadable).toBe(false);
    expect(previewReportResponse.body.data.material.summary).toContain("premiumword1");
    expect(previewReportResponse.body.data.material.summary).not.toContain("premiumword220");

    expect(previewCaseResponse.status).toBe(200);
    expect(previewCaseResponse.body.data.isPreview).toBe(true);
    expect(previewCaseResponse.body.data.caseSummary).toContain("premiumword1");
    expect(previewCaseResponse.body.data.caseSummary).not.toContain("premiumword220");
    expect(previewCaseResponse.body.data.attachments).toHaveLength(0);
    expect(previewCaseResponse.body.data.ratioDecidendi).toBe("");

    expect(previewEntriesResponse.status).toBe(200);
    expect(previewEntriesResponse.body.data.contentAccess.isPreview).toBe(true);
    expect(previewEntriesResponse.body.data.entries[0].answer).toContain("premiumword1");
    expect(previewEntriesResponse.body.data.entries[0].answer).not.toContain("premiumword220");
    expect(previewEntriesResponse.body.data.entries[0].relatedCases).toHaveLength(0);
    expect(previewEntriesResponse.body.data.entries[0].keyPrinciple).toBe("");

    const activePlan = await prisma.subscriptionPlan.upsert({
      where: {
        code: "monthly"
      },
      update: {
        currency: "NGN",
        deletedAt: null,
        interval: SubscriptionInterval.MONTHLY,
        name: "Monthly Subscription",
        priceMinor: 200_000
      },
      create: {
        code: "monthly",
        currency: "NGN",
        deletedAt: null,
        interval: SubscriptionInterval.MONTHLY,
        name: "Monthly Subscription",
        priceMinor: 200_000
      }
    });

    await prisma.subscription.create({
      data: {
        autoRenew: true,
        deletedAt: null,
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        planId: activePlan.id,
        startsAt: new Date(),
        status: SubscriptionStatus.ACTIVE,
        userId: studentUserId
      }
    });

    const fullReportResponse = await request(createApp())
      .get(`/api/v1/library/law-reports/${material.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(fullReportResponse.status).toBe(200);
    expect(fullReportResponse.body.data.access.isPreview).toBe(false);
    expect(fullReportResponse.body.data.material.body).toContain("premiumword220");
    expect(fullReportResponse.body.data.material.downloadable).toBe(true);

    expect(fullReportResponse.body.data.access.previewWordLimit).toBe(previewWordCount);
  }, 60_000);

  it("rejects unauthenticated admin user queries", async () => {
    const response = await request(createApp({ useDatabase: false })).get("/api/v1/admin/users");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unauthenticated admin registration analytics queries", async () => {
    const response = await request(createApp({ useDatabase: false })).get("/api/v1/admin/users/analytics/monthly-registrations");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects non-admin users from the admin workspace", async () => {
    const signInResponse = await request(createApp({ useDatabase: false, allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "student@helar.test", password: "Helar123!" });

    const response = await request(createApp({ useDatabase: false }))
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${signInResponse.body.data.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("requires the database for admin user operations after admin auth passes", async () => {
    const signInResponse = await request(createApp({ useDatabase: false, allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "Helar123!" });

    const response = await request(createApp({ useDatabase: false }))
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${signInResponse.body.data.accessToken}`);

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("DATABASE_UNAVAILABLE");
  });

  it("requires the database for admin user creation after admin auth passes", async () => {
    const signInResponse = await request(createApp({ useDatabase: false, allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "Helar123!" });

    const response = await request(createApp({ useDatabase: false }))
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${signInResponse.body.data.accessToken}`)
      .send({
        fullName: "Workspace Created User",
        email: "workspace-created-user@helar.test",
        password: "Helar123!",
        roleCodes: ["student"]
      });

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("DATABASE_UNAVAILABLE");
  });

  it("requires the database for admin registration analytics after admin auth passes", async () => {
    const signInResponse = await request(createApp({ useDatabase: false, allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "Helar123!" });

    const response = await request(createApp({ useDatabase: false }))
      .get("/api/v1/admin/users/analytics/monthly-registrations")
      .set("Authorization", `Bearer ${signInResponse.body.data.accessToken}`);

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("DATABASE_UNAVAILABLE");
  });

  it("rejects unauthenticated admin status updates", async () => {
    const response = await request(createApp({ useDatabase: false }))
      .patch("/api/v1/admin/users/demo-user/status")
      .send({ status: "SUSPENDED" });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects non-admin role updates", async () => {
    const signInResponse = await request(createApp({ useDatabase: false, allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "student@helar.test", password: "Helar123!" });

    const response = await request(createApp({ useDatabase: false }))
      .patch("/api/v1/admin/users/demo-user/roles")
      .set("Authorization", `Bearer ${signInResponse.body.data.accessToken}`)
      .send({ roleCodes: ["student"] });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects non-admin user creation requests", async () => {
    const signInResponse = await request(createApp({ useDatabase: false, allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "student@helar.test", password: "Helar123!" });

    const response = await request(createApp({ useDatabase: false }))
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${signInResponse.body.data.accessToken}`)
      .send({
        fullName: "Unauthorized User",
        email: "unauthorized-user@helar.test",
        password: "Helar123!",
        roleCodes: ["student"]
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("requires the database for admin status updates after admin auth passes", async () => {
    const signInResponse = await request(createApp({ useDatabase: false, allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "Helar123!" });

    const response = await request(createApp({ useDatabase: false }))
      .patch("/api/v1/admin/users/demo-user/status")
      .set("Authorization", `Bearer ${signInResponse.body.data.accessToken}`)
      .send({ status: "SUSPENDED" });

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("DATABASE_UNAVAILABLE");
  });

  it("supports Helar Connect question creation and interaction flows when the database is enabled", async () => {
    const signInResponse = await request(createApp({ allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "HelarAdmin123!" });

    expect(signInResponse.status).toBe(200);

    const accessToken = signInResponse.body.data.accessToken as string;

    const createQuestionResponse = await request(createApp())
      .post("/api/v1/connect/questions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Regression coverage question",
        body: "Verifying Helar Connect Mongo-backed interactions through the API test suite.",
        tags: ["mongodb", "regression"]
      });

    expect(createQuestionResponse.status).toBe(201);
    expect(createQuestionResponse.body.success).toBe(true);

    const questionId = createQuestionResponse.body.data.id as string;

    const voteResponse = await request(createApp())
      .post(`/api/v1/connect/questions/${questionId}/votes`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(voteResponse.status).toBe(200);
    expect(voteResponse.body.success).toBe(true);
    expect(voteResponse.body.data.viewerHasUpvoted).toBe(true);
    expect(voteResponse.body.data.voteCount).toBeGreaterThanOrEqual(1);

    const answerResponse = await request(createApp())
      .post(`/api/v1/connect/questions/${questionId}/answers`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        body: "Regression answer for Helar Connect."
      });

    expect(answerResponse.status).toBe(201);
    expect(answerResponse.body.success).toBe(true);
    expect(answerResponse.body.data.body).toBe("Regression answer for Helar Connect.");

    const commentResponse = await request(createApp())
      .post(`/api/v1/connect/questions/${questionId}/comments`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        body: "Regression comment for Helar Connect."
      });

    expect(commentResponse.status).toBe(201);
    expect(commentResponse.body.success).toBe(true);
    expect(commentResponse.body.data.body).toBe("Regression comment for Helar Connect.");

    const listResponse = await request(createApp())
      .get("/api/v1/connect/questions")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.success).toBe(true);

    const createdQuestion = listResponse.body.data.items.find((item: { id: string }) => item.id === questionId);

    expect(createdQuestion).toBeDefined();
    expect(createdQuestion.title).toBe("Regression coverage question");
    expect(createdQuestion.viewerHasUpvoted).toBe(true);
    expect(createdQuestion.voteCount).toBeGreaterThanOrEqual(1);
    expect(createdQuestion.answers.some((answer: { body: string }) => answer.body === "Regression answer for Helar Connect.")).toBe(true);
    expect(createdQuestion.comments.some((comment: { body: string }) => comment.body === "Regression comment for Helar Connect.")).toBe(true);
  }, 40_000);

  it("allows super admins to create managed roles and restricts content admins to student accounts", async () => {
    const superAdminSignInResponse = await request(createApp({ allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "HelarAdmin123!" });

    expect(superAdminSignInResponse.status).toBe(200);

    const superAdminAccessToken = superAdminSignInResponse.body.data.accessToken as string;
    const superAdminTokenPayload = jwt.decode(superAdminAccessToken) as jwt.JwtPayload | null;

    expect(typeof superAdminTokenPayload?.sub).toBe("string");

    const contentAdminAccessToken = jwt.sign(
      {
        sub: superAdminTokenPayload?.sub,
        email: "admin@helar.test",
        roleCodes: ["content_admin"]
      },
      process.env.JWT_SECRET ?? "change-me",
      { expiresIn: "15m" }
    );

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const superAdminCreatedEmail = `workspace-superadmin-${uniqueSuffix}@helar.test`;
    const contentAdminCreatedEmail = `workspace-contentadmin-${uniqueSuffix}@helar.test`;
    const password = "Helar123!";

    const superAdminCreateResponse = await request(createApp())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${superAdminAccessToken}`)
      .send({
        fullName: "Workspace Super Admin Created User",
        email: superAdminCreatedEmail,
        password,
        roleCodes: ["student"],
        country: "Nigeria",
        state: "Lagos"
      });

    expect(superAdminCreateResponse.status).toBe(201);
    expect(superAdminCreateResponse.body.success).toBe(true);
    expect(superAdminCreateResponse.body.data.email).toBe(superAdminCreatedEmail);
    expect(superAdminCreateResponse.body.data.roles.map((role: { code: string }) => role.code)).toEqual(expect.arrayContaining(["student"]));

    const superAdminCreatedUserId = superAdminCreateResponse.body.data.id as string;

    const superAdminCreatedUserDetail = await request(createApp())
      .get(`/api/v1/admin/users/${superAdminCreatedUserId}`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(superAdminCreatedUserDetail.status).toBe(200);
    expect(superAdminCreatedUserDetail.body.data.email).toBe(superAdminCreatedEmail);
    expect(superAdminCreatedUserDetail.body.data.profileType).toBe("student");

    const superAdminCreatedUserLogin = await request(createApp())
      .post("/api/v1/auth/demo-sign-in")
      .send({
        email: superAdminCreatedEmail,
        password
      });

    expect(superAdminCreatedUserLogin.status).toBe(200);
    expect(superAdminCreatedUserLogin.body.success).toBe(true);
    expect(superAdminCreatedUserLogin.body.data.user.email).toBe(superAdminCreatedEmail);

    const contentAdminForbiddenCreateResponse = await request(createApp())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${contentAdminAccessToken}`)
      .send({
        fullName: "Workspace Content Admin Created User",
        email: contentAdminCreatedEmail,
        password,
        roleCodes: ["lawyer"]
      });

    expect(contentAdminForbiddenCreateResponse.status).toBe(400);
    expect(contentAdminForbiddenCreateResponse.body.success).toBe(false);
    expect(contentAdminForbiddenCreateResponse.body.error.code).toBe("UNKNOWN_ROLE_CODES");

    const contentAdminStudentEmail = `workspace-contentadmin-student-${uniqueSuffix}@helar.test`;
    const contentAdminCreateResponse = await request(createApp())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${contentAdminAccessToken}`)
      .send({
        fullName: "Workspace Content Admin Student User",
        email: contentAdminStudentEmail,
        password,
        roleCodes: ["student"]
      });

    expect(contentAdminCreateResponse.status).toBe(201);
    expect(contentAdminCreateResponse.body.success).toBe(true);
    expect(contentAdminCreateResponse.body.data.email).toBe(contentAdminStudentEmail);
    expect(contentAdminCreateResponse.body.data.roles.map((role: { code: string }) => role.code)).toEqual(
      expect.arrayContaining(["student"])
    );

    const contentAdminCreatedUserId = contentAdminCreateResponse.body.data.id as string;
    const contentAdminCreatedUserDetail = await request(createApp())
      .get(`/api/v1/admin/users/${contentAdminCreatedUserId}`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(contentAdminCreatedUserDetail.status).toBe(200);
    expect(contentAdminCreatedUserDetail.body.data.email).toBe(contentAdminStudentEmail);
    expect(contentAdminCreatedUserDetail.body.data.roles.map((role: { code: string }) => role.code)).toEqual(
      expect.arrayContaining(["student"])
    );
  }, 75_000);

  it("allows content admins to update student passwords and limits broader password updates to super admins", async () => {
    const superAdminSignInResponse = await request(createApp({ allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "HelarAdmin123!" });

    expect(superAdminSignInResponse.status).toBe(200);

    const superAdminAccessToken = superAdminSignInResponse.body.data.accessToken as string;
    const superAdminTokenPayload = jwt.decode(superAdminAccessToken) as jwt.JwtPayload | null;

    expect(typeof superAdminTokenPayload?.sub).toBe("string");

    const contentAdminAccessToken = jwt.sign(
      {
        sub: superAdminTokenPayload?.sub,
        email: "admin@helar.test",
        roleCodes: ["content_admin"]
      },
      process.env.JWT_SECRET ?? "change-me",
      { expiresIn: "15m" }
    );

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const studentEmail = `password-student-${uniqueSuffix}@helar.test`;
    const lawyerEmail = `password-lawyer-${uniqueSuffix}@helar.test`;

    const studentCreateResponse = await request(createApp())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${superAdminAccessToken}`)
      .send({
        fullName: "Password Target Student",
        email: studentEmail,
        password: "Initial123!",
        roleCodes: ["student"]
      });

    expect(studentCreateResponse.status).toBe(201);

    const lawyerCreateResponse = await request(createApp())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${superAdminAccessToken}`)
      .send({
        fullName: "Password Target Lawyer",
        email: lawyerEmail,
        password: "Initial123!",
        roleCodes: ["lawyer"]
      });

    expect(lawyerCreateResponse.status).toBe(201);

    const studentUserId = studentCreateResponse.body.data.id as string;
    const lawyerUserId = lawyerCreateResponse.body.data.id as string;

    const contentAdminStudentPasswordResponse = await request(createApp())
      .patch(`/api/v1/admin/users/${studentUserId}/password`)
      .set("Authorization", `Bearer ${contentAdminAccessToken}`)
      .send({
        password: "StudentNew123!"
      });

    expect(contentAdminStudentPasswordResponse.status).toBe(200);
    expect(contentAdminStudentPasswordResponse.body.success).toBe(true);

    const studentLoginResponse = await request(createApp())
      .post("/api/v1/auth/demo-sign-in")
      .send({
        email: studentEmail,
        password: "StudentNew123!"
      });

    expect(studentLoginResponse.status).toBe(200);
    expect(studentLoginResponse.body.success).toBe(true);

    const contentAdminLawyerPasswordResponse = await request(createApp())
      .patch(`/api/v1/admin/users/${lawyerUserId}/password`)
      .set("Authorization", `Bearer ${contentAdminAccessToken}`)
      .send({
        password: "LawyerNew123!"
      });

    expect(contentAdminLawyerPasswordResponse.status).toBe(403);
    expect(contentAdminLawyerPasswordResponse.body.success).toBe(false);
    expect(contentAdminLawyerPasswordResponse.body.error.code).toBe("FORBIDDEN");

    const superAdminLawyerPasswordResponse = await request(createApp())
      .patch(`/api/v1/admin/users/${lawyerUserId}/password`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`)
      .send({
        password: "LawyerNew123!"
      });

    expect(superAdminLawyerPasswordResponse.status).toBe(200);
    expect(superAdminLawyerPasswordResponse.body.success).toBe(true);

    const lawyerLoginResponse = await request(createApp())
      .post("/api/v1/auth/demo-sign-in")
      .send({
        email: lawyerEmail,
        password: "LawyerNew123!"
      });

    expect(lawyerLoginResponse.status).toBe(200);
    expect(lawyerLoginResponse.body.success).toBe(true);
  }, 75_000);

  it("searches admin users case-insensitively across address and other user table fields", async () => {
    const signInResponse = await request(createApp({ allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "HelarAdmin123!" });

    expect(signInResponse.status).toBe(200);

    const accessToken = signInResponse.body.data.accessToken as string;
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdEmail = `searchable-user-${uniqueSuffix}@helar.test`;

    const createResponse = await request(createApp())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        fullName: "Searchable Workspace User",
        email: createdEmail,
        password: "Helar123!",
        roleCodes: ["student"],
        phoneNumber: "+234 803 111 2222",
        addressLine1: "12 Osborne Road",
        addressLine2: "Apartment 4B",
        city: "Ikoyi",
        state: "Lagos",
        postalCode: "101233",
        country: "Nigeria"
      });

    expect(createResponse.status).toBe(201);

    const uppercaseAddressSearchResponse = await request(createApp())
      .get("/api/v1/admin/users")
      .query({ search: "OSBORNE" })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(uppercaseAddressSearchResponse.status).toBe(200);
    expect(uppercaseAddressSearchResponse.body.success).toBe(true);
    expect(uppercaseAddressSearchResponse.body.data.users.some((user: { email: string }) => user.email === createdEmail)).toBe(true);

    const postalCodeSearchResponse = await request(createApp())
      .get("/api/v1/admin/users")
      .query({ search: "101233" })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(postalCodeSearchResponse.status).toBe(200);
    expect(postalCodeSearchResponse.body.success).toBe(true);
    expect(postalCodeSearchResponse.body.data.users.some((user: { email: string }) => user.email === createdEmail)).toBe(true);
  }, 75_000);

  it("searches users and library items from the admin workspace header search", async () => {
    const signInResponse = await request(createApp({ allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "HelarAdmin123!" });

    expect(signInResponse.status).toBe(200);

    const accessToken = signInResponse.body.data.accessToken as string;
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const searchToken = `workspace-search-${uniqueSuffix}`;
    const searchQuery = searchToken.toUpperCase();
    const createdUserEmail = `${searchToken}@helar.test`;

    const createUserResponse = await request(createApp())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        fullName: `Workspace Search ${uniqueSuffix}`,
        email: createdUserEmail,
        password: "Helar123!",
        roleCodes: ["student"]
      });

    expect(createUserResponse.status).toBe(201);

    const createMaterialResponse = await request(createApp())
      .post("/api/v1/admin/library/subject-summaries/materials")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: `Workspace Search Material ${uniqueSuffix}`,
        summary: `Library search regression summary ${searchToken}`,
        body: `<p>Workspace search body ${searchToken}</p>`,
        storageUrl: `https://example.com/${searchToken}.pdf`,
        downloadable: true,
        estimatedMins: 8,
        materialType: "PDF",
        reportDate: "",
        reportNumber: ""
      });

    expect(createMaterialResponse.status).toBe(201);

    const searchResponse = await request(createApp())
      .get(`/api/v1/admin/search?query=${encodeURIComponent(searchQuery)}&limit=5`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.success).toBe(true);

    const groups = searchResponse.body.data.groups as Array<{
      items: Array<{ id: string; kind: string; path: string; title: string }>;
      key: string;
    }>;

    const userGroup = groups.find((group) => group.key === "users");
    const libraryGroup = groups.find((group) => group.key === "library");

    expect(userGroup).toBeDefined();
    expect(libraryGroup).toBeDefined();
    expect(userGroup?.items.some((item) => item.title.includes(uniqueSuffix) && item.kind === "user")).toBe(true);
    expect(libraryGroup?.items.some((item) => item.title.includes(uniqueSuffix) && item.kind === "library_material")).toBe(true);

    const createdLibraryItem = libraryGroup?.items.find(
      (item) => item.title.includes(uniqueSuffix) && item.kind === "library_material"
    );

    expect(createdLibraryItem?.path).toContain("/app/admin/library/subject-summaries/materials");
    expect(createdLibraryItem?.path).toContain("edit=");
  }, 40_000);

  it("supports content review queue approval for pending library materials", async () => {
    const superAdminSignInResponse = await request(createApp({ allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "HelarAdmin123!" });

    expect(superAdminSignInResponse.status).toBe(200);

    const superAdminAccessToken = superAdminSignInResponse.body.data.accessToken as string;
    const superAdminTokenPayload = jwt.decode(superAdminAccessToken) as jwt.JwtPayload | null;

    expect(typeof superAdminTokenPayload?.sub).toBe("string");

    const contentAdminAccessToken = jwt.sign(
      {
        sub: superAdminTokenPayload?.sub,
        email: "admin@helar.test",
        roleCodes: ["content_admin"]
      },
      process.env.JWT_SECRET ?? "change-me",
      { expiresIn: "15m" }
    );

    const createMaterialResponse = await request(createApp())
      .post("/api/v1/admin/library/subject-summaries/materials")
      .set("Authorization", `Bearer ${contentAdminAccessToken}`)
      .send({
        title: "Pending approval regression material",
        summary: "Pending approval summary",
        body: "<p>Pending approval body</p>",
        storageUrl: "https://example.com/pending-approval-regression-material.pdf",
        downloadable: true,
        estimatedMins: 12,
        materialType: "PDF",
        reportDate: "",
        reportNumber: ""
      });

    expect(createMaterialResponse.status).toBe(201);
    expect(createMaterialResponse.body.success).toBe(true);
    expect(createMaterialResponse.body.data.publicationStatus).toBe("PENDING_APPROVAL");

    const materialId = createMaterialResponse.body.data.id as string;

    const contentReviewQueueResponse = await request(createApp())
      .get("/api/v1/admin/content-review")
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(contentReviewQueueResponse.status).toBe(200);
    expect(contentReviewQueueResponse.body.success).toBe(true);

    const pendingQueueItem = contentReviewQueueResponse.body.data.items.find(
      (item: { resourceId: string; type: string }) => item.resourceId === materialId && item.type === "library_material"
    );

    expect(pendingQueueItem).toBeDefined();

    const approveResponse = await request(createApp())
      .post(`/api/v1/admin/approvals/library-materials/${materialId}/approve`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.success).toBe(true);
    expect(approveResponse.body.data.id).toBe(materialId);

    const approvedMaterialResponse = await request(createApp())
      .get(`/api/v1/admin/library/subject-summaries/materials/${materialId}`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(approvedMaterialResponse.status).toBe(200);
    expect(approvedMaterialResponse.body.success).toBe(true);
    expect(approvedMaterialResponse.body.data.material.publicationStatus).toBe("PUBLISHED");
    expect(approvedMaterialResponse.body.data.material.approvedAt).toBeTypeOf("string");
    expect(approvedMaterialResponse.body.data.material.reviewFeedback).toBe("");

    const refreshedQueueResponse = await request(createApp())
      .get("/api/v1/admin/content-review")
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(refreshedQueueResponse.status).toBe(200);

    const stillPendingItem = refreshedQueueResponse.body.data.items.find(
      (item: { resourceId: string; type: string }) => item.resourceId === materialId && item.type === "library_material"
    );

    expect(stillPendingItem).toBeUndefined();
  }, 20_000);

  it("supports content review decline for pending library materials with persisted feedback", async () => {
    const superAdminSignInResponse = await request(createApp({ allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "HelarAdmin123!" });

    expect(superAdminSignInResponse.status).toBe(200);

    const superAdminAccessToken = superAdminSignInResponse.body.data.accessToken as string;
    const superAdminTokenPayload = jwt.decode(superAdminAccessToken) as jwt.JwtPayload | null;

    expect(typeof superAdminTokenPayload?.sub).toBe("string");

    const contentAdminAccessToken = jwt.sign(
      {
        sub: superAdminTokenPayload?.sub,
        email: "admin@helar.test",
        roleCodes: ["content_admin"]
      },
      process.env.JWT_SECRET ?? "change-me",
      { expiresIn: "15m" }
    );

    const createMaterialResponse = await request(createApp())
      .post("/api/v1/admin/library/subject-summaries/materials")
      .set("Authorization", `Bearer ${contentAdminAccessToken}`)
      .send({
        title: "Pending decline regression material",
        summary: "Pending decline summary",
        body: "<p>Pending decline body</p>",
        storageUrl: "https://example.com/pending-decline-regression-material.pdf",
        downloadable: true,
        estimatedMins: 12,
        materialType: "PDF",
        reportDate: "",
        reportNumber: ""
      });

    expect(createMaterialResponse.status).toBe(201);
    expect(createMaterialResponse.body.success).toBe(true);
    expect(createMaterialResponse.body.data.publicationStatus).toBe("PENDING_APPROVAL");

    const materialId = createMaterialResponse.body.data.id as string;
    const declineReason = "Please revise the summary structure before publication.";

    const pendingQueueResponse = await request(createApp())
      .get("/api/v1/admin/content-review")
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(pendingQueueResponse.status).toBe(200);

    const pendingQueueItem = pendingQueueResponse.body.data.items.find(
      (item: { resourceId: string; type: string }) => item.resourceId === materialId && item.type === "library_material"
    );

    expect(pendingQueueItem).toBeDefined();

    const declineResponse = await request(createApp())
      .post(`/api/v1/admin/approvals/library-materials/${materialId}/decline`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`)
      .send({
        reason: declineReason
      });

    expect(declineResponse.status).toBe(200);
    expect(declineResponse.body.success).toBe(true);
    expect(declineResponse.body.data.id).toBe(materialId);

    const declinedMaterialResponse = await request(createApp())
      .get(`/api/v1/admin/library/subject-summaries/materials/${materialId}`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(declinedMaterialResponse.status).toBe(200);
    expect(declinedMaterialResponse.body.success).toBe(true);
    expect(declinedMaterialResponse.body.data.material.publicationStatus).toBe("DRAFT");
    expect(declinedMaterialResponse.body.data.material.approvedAt).toBeNull();
    expect(declinedMaterialResponse.body.data.material.reviewFeedback).toBe(declineReason);

    const refreshedQueueResponse = await request(createApp())
      .get("/api/v1/admin/content-review")
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(refreshedQueueResponse.status).toBe(200);

    const stillPendingItem = refreshedQueueResponse.body.data.items.find(
      (item: { resourceId: string; type: string }) => item.resourceId === materialId && item.type === "library_material"
    );

    expect(stillPendingItem).toBeUndefined();
  }, 20_000);

  it("supports subject summary case approval and decline review flows", async () => {
    const superAdminSignInResponse = await request(createApp({ allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "HelarAdmin123!" });

    expect(superAdminSignInResponse.status).toBe(200);

    const superAdminAccessToken = superAdminSignInResponse.body.data.accessToken as string;
    const superAdminTokenPayload = jwt.decode(superAdminAccessToken) as jwt.JwtPayload | null;

    expect(typeof superAdminTokenPayload?.sub).toBe("string");

    const contentAdminAccessToken = jwt.sign(
      {
        sub: superAdminTokenPayload?.sub,
        email: "admin@helar.test",
        roleCodes: ["content_admin"]
      },
      process.env.JWT_SECRET ?? "change-me",
      { expiresIn: "15m" }
    );

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const createSubjectResponse = await request(createApp())
      .post("/api/v1/admin/subject-summaries/subjects")
      .set("Authorization", `Bearer ${superAdminAccessToken}`)
      .send({
        description: "Regression subject for review workflow coverage.",
        displayOrder: 100,
        name: `Mongo Review Workflow Subject ${uniqueSuffix}`,
        status: "ACTIVE"
      });

    expect(createSubjectResponse.status).toBe(201);

    const subjectId = createSubjectResponse.body.data.id as string;

    const createTopicResponse = await request(createApp())
      .post("/api/v1/admin/subject-summaries/topics")
      .set("Authorization", `Bearer ${superAdminAccessToken}`)
      .send({
        description: "Regression topic for review workflow coverage.",
        displayOrder: 100,
        name: `Mongo Review Workflow Topic ${uniqueSuffix}`,
        status: "ACTIVE",
        subjectId
      });

    expect(createTopicResponse.status).toBe(201);

    const topicId = createTopicResponse.body.data.id as string;

    const createAppInstance = createApp();

    const createPendingCase = async (title: string) =>
      request(createAppInstance)
        .post("/api/v1/admin/subject-summaries/cases")
        .set("Authorization", `Bearer ${contentAdminAccessToken}`)
        .send({
          attachments: [],
          caseSummary: "Regression case summary",
          citation: "2026 HELAR 1",
          court: "Supreme Court",
          decisionHolding: "Regression holding",
          externalReferences: [],
          facts: "Regression facts",
          issues: "Regression issues",
          judges: ["Justice Regression"],
          jurisdiction: "Nigeria",
          keywords: ["mongodb", "review"],
          legalPrinciples: ["Regression principle"],
          obiterDicta: "Regression obiter",
          ratioDecidendi: "Regression ratio",
          relatedCases: [],
          relatedStatutes: [],
          status: "PUBLISHED",
          subjectId,
          title,
          topicId,
          year: 2026
        });

    const createPendingEntry = async (question: string, relatedCaseIds: string[]) =>
      request(createAppInstance)
        .post("/api/v1/admin/subject-summary-module/entries")
        .set("Authorization", `Bearer ${contentAdminAccessToken}`)
        .send({
          answer: "Regression entry answer",
          difficulty: "EASY",
          displayOrder: 1,
          estimatedReadingTime: 3,
          examTip: "Regression exam tip",
          keyPrinciple: "Regression key principle",
          question,
          relatedCaseIds,
          relatedStatutes: ["Evidence Act"],
          status: "PUBLISHED",
          subjectId,
          tags: ["mongodb", "entry-review"]
        });

    const approvalCaseResponse = await createPendingCase("Mongo Review Approval Case");

    expect(approvalCaseResponse.status).toBe(201);
    expect(approvalCaseResponse.body.data.status).toBe("PENDING_APPROVAL");

    const approvalCaseId = approvalCaseResponse.body.data.id as string;

    const initialQueueResponse = await request(createApp())
      .get("/api/v1/admin/content-review")
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(initialQueueResponse.status).toBe(200);

    const pendingApprovalCase = initialQueueResponse.body.data.items.find(
      (item: { resourceId: string; type: string }) =>
        item.resourceId === approvalCaseId && item.type === "subject_summary_case"
    );

    expect(pendingApprovalCase).toBeDefined();

    const approveCaseResponse = await request(createApp())
      .post(`/api/v1/admin/approvals/subject-summary-cases/${approvalCaseId}/approve`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(approveCaseResponse.status).toBe(200);
    expect(approveCaseResponse.body.success).toBe(true);

    const approvedCaseDetailResponse = await request(createApp())
      .get(`/api/v1/admin/subject-summaries/cases/${approvalCaseId}`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(approvedCaseDetailResponse.status).toBe(200);
    expect(approvedCaseDetailResponse.body.data.status).toBe("PUBLISHED");
    expect(approvedCaseDetailResponse.body.data.reviewFeedback).toBe("");

    const approvalEntryResponse = await createPendingEntry("Mongo Review Approval Entry", [approvalCaseId]);

    expect(approvalEntryResponse.status).toBe(201);
    expect(approvalEntryResponse.body.data.status).toBe("PENDING_APPROVAL");

    const approvalEntryId = approvalEntryResponse.body.data.id as string;

    const approvalEntryQueueResponse = await request(createApp())
      .get("/api/v1/admin/content-review")
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(approvalEntryQueueResponse.status).toBe(200);

    const pendingApprovalEntry = approvalEntryQueueResponse.body.data.items.find(
      (item: { resourceId: string; type: string }) =>
        item.resourceId === approvalEntryId && item.type === "subject_summary_entry"
    );

    expect(pendingApprovalEntry).toBeDefined();

    const approveEntryResponse = await request(createApp())
      .post(`/api/v1/admin/approvals/subject-summary-entries/${approvalEntryId}/approve`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(approveEntryResponse.status).toBe(200);
    expect(approveEntryResponse.body.success).toBe(true);

    const approvedEntryListResponse = await request(createApp())
      .get(`/api/v1/admin/subject-summary-module/entries?subjectId=${subjectId}&status=all&page=1&pageSize=50`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(approvedEntryListResponse.status).toBe(200);

    const approvedEntry = approvedEntryListResponse.body.data.items.find((item: { id: string }) => item.id === approvalEntryId);

    expect(approvedEntry).toBeDefined();
    expect(approvedEntry.status).toBe("PUBLISHED");
    expect(approvedEntry.reviewFeedback).toBe("");

    const createDeclineCaseResponse = await createPendingCase("Mongo Review Decline Case");

    expect(createDeclineCaseResponse.status).toBe(201);
    expect(createDeclineCaseResponse.body.data.status).toBe("PENDING_APPROVAL");

    const declineCaseId = createDeclineCaseResponse.body.data.id as string;
    const declineReason = "Please tighten the ratio and issues before publication.";

    const pendingDeclineQueueResponse = await request(createApp())
      .get("/api/v1/admin/content-review")
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(pendingDeclineQueueResponse.status).toBe(200);

    const pendingDeclineCase = pendingDeclineQueueResponse.body.data.items.find(
      (item: { resourceId: string; type: string }) =>
        item.resourceId === declineCaseId && item.type === "subject_summary_case"
    );

    expect(pendingDeclineCase).toBeDefined();

    const declineCaseResponse = await request(createApp())
      .post(`/api/v1/admin/approvals/subject-summary-cases/${declineCaseId}/decline`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`)
      .send({
        reason: declineReason
      });

    expect(declineCaseResponse.status).toBe(200);
    expect(declineCaseResponse.body.success).toBe(true);

    const declinedCaseDetailResponse = await request(createApp())
      .get(`/api/v1/admin/subject-summaries/cases/${declineCaseId}`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(declinedCaseDetailResponse.status).toBe(200);
    expect(declinedCaseDetailResponse.body.data.status).toBe("DRAFT");
    expect(declinedCaseDetailResponse.body.data.reviewFeedback).toBe(declineReason);

    const createDeclineEntryResponse = await createPendingEntry("Mongo Review Decline Entry", [declineCaseId]);

    expect(createDeclineEntryResponse.status).toBe(201);
    expect(createDeclineEntryResponse.body.data.status).toBe("PENDING_APPROVAL");

    const declineEntryId = createDeclineEntryResponse.body.data.id as string;
    const declineEntryReason = "Please clarify the answer and linked authority before publishing.";

    const declineEntryQueueResponse = await request(createApp())
      .get("/api/v1/admin/content-review")
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(declineEntryQueueResponse.status).toBe(200);

    const pendingDeclineEntry = declineEntryQueueResponse.body.data.items.find(
      (item: { resourceId: string; type: string }) =>
        item.resourceId === declineEntryId && item.type === "subject_summary_entry"
    );

    expect(pendingDeclineEntry).toBeDefined();

    const declineEntryResponse = await request(createApp())
      .post(`/api/v1/admin/approvals/subject-summary-entries/${declineEntryId}/decline`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`)
      .send({
        reason: declineEntryReason
      });

    expect(declineEntryResponse.status).toBe(200);
    expect(declineEntryResponse.body.success).toBe(true);

    const declinedEntryListResponse = await request(createApp())
      .get(`/api/v1/admin/subject-summary-module/entries?subjectId=${subjectId}&status=all&page=1&pageSize=50`)
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(declinedEntryListResponse.status).toBe(200);

    const declinedEntry = declinedEntryListResponse.body.data.items.find((item: { id: string }) => item.id === declineEntryId);

    expect(declinedEntry).toBeDefined();
    expect(declinedEntry.status).toBe("DRAFT");
    expect(declinedEntry.reviewFeedback).toBe(declineEntryReason);

    const refreshedQueueResponse = await request(createApp())
      .get("/api/v1/admin/content-review")
      .set("Authorization", `Bearer ${superAdminAccessToken}`);

    expect(refreshedQueueResponse.status).toBe(200);

    const stillPendingApprovalCase = refreshedQueueResponse.body.data.items.find(
      (item: { resourceId: string; type: string }) =>
        item.resourceId === approvalCaseId && item.type === "subject_summary_case"
    );
    const stillPendingDeclineCase = refreshedQueueResponse.body.data.items.find(
      (item: { resourceId: string; type: string }) =>
        item.resourceId === declineCaseId && item.type === "subject_summary_case"
    );
    const stillPendingApprovalEntry = refreshedQueueResponse.body.data.items.find(
      (item: { resourceId: string; type: string }) =>
        item.resourceId === approvalEntryId && item.type === "subject_summary_entry"
    );
    const stillPendingDeclineEntry = refreshedQueueResponse.body.data.items.find(
      (item: { resourceId: string; type: string }) =>
        item.resourceId === declineEntryId && item.type === "subject_summary_entry"
    );

    expect(stillPendingApprovalCase).toBeUndefined();
    expect(stillPendingDeclineCase).toBeUndefined();
    expect(stillPendingApprovalEntry).toBeUndefined();
    expect(stillPendingDeclineEntry).toBeUndefined();
  }, 60_000);

  it("requires a decline reason for all super-admin decline endpoints", async () => {
    const superAdminSignInResponse = await request(createApp({ allowAuthFallback: true }))
      .post("/api/v1/auth/demo-sign-in")
      .send({ email: "admin@helar.test", password: "HelarAdmin123!" });

    expect(superAdminSignInResponse.status).toBe(200);

    const superAdminAccessToken = superAdminSignInResponse.body.data.accessToken as string;

    const routes = [
      "/api/v1/admin/approvals/library-materials/test-id/decline",
      "/api/v1/admin/approvals/subject-summary-cases/test-id/decline",
      "/api/v1/admin/approvals/subject-summary-entries/test-id/decline"
    ];

    for (const route of routes) {
      const response = await request(createApp())
        .post(route)
        .set("Authorization", `Bearer ${superAdminAccessToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.message).toBe("A decline reason is required.");
    }
  }, 20_000);
});
