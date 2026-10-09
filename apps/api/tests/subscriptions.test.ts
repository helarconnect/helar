import { createHmac } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  subscriptionPlan: { upsert: vi.fn(), findFirst: vi.fn() },
  transaction: { findUnique: vi.fn(), update: vi.fn() },
  payment: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  subscription: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() }
}));
const mail = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/prisma.js", () => ({ prisma: db }));
vi.mock("../src/lib/transactions.js", () => ({ runInTransaction: (operation: (tx: unknown) => unknown) => operation(db) }));
vi.mock("../src/lib/email.js", () => ({ sendSubscriptionActivationEmails: mail }));
import { processPaystackWebhook, verifySubscriptionPayment } from "../src/subscriptions.js";

const reference = "helar.monthly.test123";
const user = { id: "user", email: "subscriber@example.com", fullName: "Subscriber" };
const plan = { id: "plan", code: "monthly", interval: "MONTHLY", name: "Monthly Subscription", currency: "NGN", priceMinor: 200000, deletedAt: null };
let payment: any;
let subscription: any;
let transaction: any;
let verification: any;
let previous: any;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_subscription");
  previous = null;
  subscription = null;
  payment = { id: "payment", userId: user.id, user, provider: "paystack", amountMinor: 200000, currency: "NGN", status: "PENDING", subscriptionId: null, deletedAt: null, createdAt: new Date("2026-10-09T12:00:00Z") };
  transaction = { id: "transaction", paymentId: payment.id, reference, deletedAt: null, rawPayload: { request: { planCode: "monthly", checkoutEmail: user.email } }, payment };
  verification = { reference, amount: 200000, currency: "NGN", status: "success", paid_at: "2026-10-09T12:00:00Z", customer: { email: user.email } };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ status: true, data: verification }) })));
  db.subscriptionPlan.upsert.mockResolvedValue(plan);
  db.subscriptionPlan.findFirst.mockResolvedValue(plan);
  db.transaction.findUnique.mockImplementation(async () => ({ ...transaction, payment: { ...payment, subscription } }));
  db.transaction.update.mockImplementation(async ({ data }) => { transaction.rawPayload = data.rawPayload; return transaction; });
  db.payment.findUnique.mockImplementation(async () => payment);
  db.payment.findFirst.mockImplementation(async () => payment);
  db.payment.findMany.mockResolvedValue([]);
  db.payment.updateMany.mockImplementation(async ({ data }) => { Object.assign(payment, data); return { count: 1 }; });
  db.subscription.findFirst.mockImplementation(async ({ where }) => where.status ? (subscription ?? (previous?.status === "ACTIVE" ? previous : null)) : previous);
  db.subscription.findMany.mockResolvedValue([]);
  db.subscription.findUnique.mockImplementation(async () => subscription);
  db.subscription.create.mockImplementation(async ({ data }) => { subscription = { id: "subscription", createdAt: new Date(), ...data, user, plan }; return subscription; });
  db.subscription.update.mockImplementation(async ({ data }) => { Object.assign(subscription, data); return subscription; });
  db.subscription.updateMany.mockResolvedValue({ count: 1 });
  mail.mockResolvedValue({ skipped: false, subscriberSent: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function signedEvent(event = "charge.success", nextReference = reference) {
  const body = Buffer.from(JSON.stringify({ event, data: { reference: nextReference } }));
  return { body, signature: createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!).update(body).digest("hex") };
}

describe("subscription payment renewal", () => {
  it("activates a paid subscription and sends confirmation without a browser callback", async () => {
    const { body, signature } = signedEvent();
    await processPaystackWebhook(body, signature);
    expect(payment.status).toBe("SUCCEEDED");
    expect(subscription.status).toBe("ACTIVE");
    expect(subscription.endsAt.toISOString()).toBe("2026-11-09T12:00:00.000Z");
    expect(mail).toHaveBeenCalledWith(expect.objectContaining({ email: user.email, isRenewal: false }));
    expect(subscription.notificationFlags.activationEmailSentAt).toBeTruthy();
  });
  it.each([
    ["monthly", "MONTHLY", "2026-01-31T12:00:00Z", "2026-02-28T12:00:00.000Z"],
    ["six_months", "MONTHLY", "2026-10-09T12:00:00Z", "2027-04-09T12:00:00.000Z"],
    ["annual", "ANNUAL", "2028-02-29T12:00:00Z", "2029-02-28T12:00:00.000Z"]
  ])("calculates %s access including month-end boundaries", async (code, interval, paidAt, expected) => {
    const selectedPlan = { ...plan, code, interval };
    transaction.rawPayload.request.planCode = code;
    db.subscriptionPlan.findFirst.mockResolvedValue(selectedPlan);
    verification.paid_at = paidAt;
    await verifySubscriptionPayment(user.id, reference);
    expect(subscription.endsAt.toISOString()).toBe(expected);
  });
  it("receives a signed raw webhook through the public HTTP endpoint", async () => {
    const { body, signature } = signedEvent();
    const response = await request(createApp()).post("/api/v1/subscriptions/paystack/webhook")
      .set("Content-Type", "application/json").set("x-paystack-signature", signature).send(body.toString());
    expect(response.status).toBe(200);
    expect(payment.status).toBe("SUCCEEDED");
  });
  it("rejects an unsigned HTTP notification", async () => {
    const response = await request(createApp()).post("/api/v1/subscriptions/paystack/webhook")
      .send({ event: "charge.success", data: { reference } });
    expect(response.status).toBe(401);
    expect(db.subscription.create).not.toHaveBeenCalled();
  });
  it("recovers an earlier failed payment when Paystack subsequently confirms success", async () => {
    payment.status = "FAILED";
    await verifySubscriptionPayment(user.id, reference);
    expect(db.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: ["PENDING", "FAILED"] } }) }));
    expect(payment.status).toBe("SUCCEEDED");
  });
  it("can finalize MongoDB payments with a missing subscriptionId field", async () => {
    delete payment.subscriptionId;
    await verifySubscriptionPayment(user.id, reference);
    expect(db.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([
        { OR: [{ subscriptionId: null }, { subscriptionId: { isSet: false } }] }
      ]) })
    }));
    expect(payment.status).toBe("SUCCEEDED");
  });
  it("does not mark an ongoing payment as failed", async () => {
    verification.status = "ongoing";
    await expect(verifySubscriptionPayment(user.id, reference)).rejects.toThrow("not completed");
    expect(db.payment.updateMany).not.toHaveBeenCalled();
    expect(db.subscription.create).not.toHaveBeenCalled();
  });
  it("preserves remaining time and sends renewal wording for an existing subscriber", async () => {
    previous = { status: "ACTIVE", endsAt: new Date("2026-10-25T12:00:00Z") };
    await verifySubscriptionPayment(user.id, reference);
    expect(subscription.endsAt.toISOString()).toBe("2026-11-25T12:00:00.000Z");
    expect(mail).toHaveBeenCalledWith(expect.objectContaining({ isRenewal: true }));
  });
  it("starts an expired subscriber's renewal at the successful payment date", async () => {
    previous = { status: "EXPIRED", endsAt: new Date("2026-09-25T12:00:00Z") };
    await verifySubscriptionPayment(user.id, reference);
    expect(subscription.endsAt.toISOString()).toBe("2026-11-09T12:00:00.000Z");
    expect(mail).toHaveBeenCalledWith(expect.objectContaining({ isRenewal: true }));
  });
  it("does not grant access for a mismatched amount or another user's reference", async () => {
    await expect(verifySubscriptionPayment("other-user", reference)).rejects.toThrow("another user's");
    verification.amount = 100;
    await expect(verifySubscriptionPayment(user.id, reference)).rejects.toThrow("amount did not match");
    expect(db.subscription.create).not.toHaveBeenCalled();
  });
  it("ignores repeated successful webhook and browser confirmations after delivery", async () => {
    const { body, signature } = signedEvent();
    await processPaystackWebhook(body, signature);
    await processPaystackWebhook(body, signature);
    await verifySubscriptionPayment(user.id, reference);
    expect(db.subscription.create).toHaveBeenCalledTimes(1);
    expect(mail).toHaveBeenCalledTimes(1);
  });
  it("retries a failed confirmation email without extending access again", async () => {
    mail.mockResolvedValueOnce({ skipped: false, subscriberSent: false });
    const { body, signature } = signedEvent();
    await expect(processPaystackWebhook(body, signature)).rejects.toMatchObject({ statusCode: 503 });
    expect(payment.status).toBe("SUCCEEDED");
    expect(subscription.notificationFlags.activationEmailSentAt).toBeUndefined();
    await processPaystackWebhook(body, signature);
    expect(db.subscription.create).toHaveBeenCalledTimes(1);
    expect(mail).toHaveBeenCalledTimes(2);
    expect(subscription.notificationFlags.activationEmailSentAt).toBeTruthy();
  });
  it("rejects forged notifications before looking up payments", async () => {
    const { body } = signedEvent();
    await expect(processPaystackWebhook(body, "0".repeat(128))).rejects.toMatchObject({ statusCode: 401 });
    await expect(processPaystackWebhook(body, undefined)).rejects.toMatchObject({ statusCode: 401 });
    expect(db.transaction.findUnique).not.toHaveBeenCalled();
  });
  it("ignores other event types and unknown payment references", async () => {
    let event = signedEvent("subscription.disable");
    await processPaystackWebhook(event.body, event.signature);
    expect(db.transaction.findUnique).not.toHaveBeenCalled();
    db.transaction.findUnique.mockResolvedValue(null);
    event = signedEvent();
    await processPaystackWebhook(event.body, event.signature);
    expect(db.subscription.create).not.toHaveBeenCalled();
  });
});
