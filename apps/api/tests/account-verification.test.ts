import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  role: { upsert: vi.fn() },
  session: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  device: { findFirst: vi.fn(), create: vi.fn() }
}));
const verificationMail = vi.hoisted(() => vi.fn());
const welcomeMail = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/prisma.js", () => ({ prisma: db }));
vi.mock("../src/lib/transactions.js", () => ({ runInTransaction: (operation: (tx: unknown) => unknown) => operation(db) }));
vi.mock("../src/lib/email.js", () => ({ sendRegistrationVerificationEmails: verificationMail, sendWelcomeEmail: welcomeMail }));
vi.mock("bcryptjs", () => ({ default: {
  hash: vi.fn(async () => "hashed"),
  compare: vi.fn(async (password: string) => ["Helar123!", "secret"].includes(password))
} }));
import { createApp } from "../src/app.js";

function makeUser() {
  return {
    id: "64b000000000000000000002", email: "member@example.com", fullName: "Member", passwordHash: "hashed",
    status: "ACTIVE", deletedAt: null as Date | null, emailVerifiedAt: null as Date | null,
    roles: [{ role: { code: "student" } }], student: null, twoFactorEnabled: false,
    sessionsRevokedAt: null
  };
}
let account: ReturnType<typeof makeUser> | null;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("JWT_SECRET", "test-verification-secret");
  vi.stubEnv("API_PUBLIC_BASE_URL", "https://api.example.com");
  vi.stubEnv("APP_PUBLIC_BASE_URL", "https://example.com");
  account = makeUser();
  db.user.findUnique.mockImplementation(async () => account);
  db.user.create.mockImplementation(async ({ data }) => { account = { ...makeUser(), ...data, roles: makeUser().roles }; return account; });
  db.user.update.mockImplementation(async ({ data }) => { if (account) Object.assign(account, data); return account; });
  db.role.upsert.mockResolvedValue({ id: "role" });
  db.session.create.mockResolvedValue({ id: "64b000000000000000000009" });
  db.session.findMany.mockResolvedValue([]);
  db.session.update.mockResolvedValue({});
  verificationMail.mockResolvedValue({ skipped: false, userAccepted: [account.email] });
  welcomeMail.mockResolvedValue({ skipped: false });
});
afterEach(() => vi.unstubAllEnvs());
const credentials = { email: "member@example.com", password: "Helar123!" };
function verificationToken(overrides = {}, expiresIn = 86400) {
  return jwt.sign({ sub: makeUser().id, email: makeUser().email, purpose: "email_verification", ...overrides }, process.env.JWT_SECRET!, { expiresIn });
}
function accessToken() {
  return jwt.sign({ sub: makeUser().id, email: makeUser().email, roleCodes: ["student"] }, process.env.JWT_SECRET!, { expiresIn: "15m" });
}

describe("existing account verification flow", () => {
  it("sends the existing verification email on registration without creating a login session", async () => {
    account = null;
    const response = await request(createApp()).post("/api/v1/auth/register")
      .send({ ...credentials, fullName: "New Member", confirmPassword: credentials.password, registrationRole: "student", deviceName: "browser" });
    expect(response.status).toBe(201);
    expect(response.body.data.requiresVerification).toBe(true);
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(db.session.create).not.toHaveBeenCalled();
    expect(db.device.create).not.toHaveBeenCalled();
    expect(response.body.meta.verificationEmailStatus).toBe("sent");
    const input = verificationMail.mock.calls[0][0];
    expect(input.email).toBe(credentials.email);
    const token = new URL(input.verificationUrl).searchParams.get("token")!;
    expect(jwt.verify(token, process.env.JWT_SECRET!)).toMatchObject({ purpose: "email_verification", email: credentials.email });
  });
  it("keeps registration pending if the mail transport accepts no subscriber recipient", async () => {
    account = null;
    verificationMail.mockResolvedValue({ skipped: false, userAccepted: [] });
    const response = await request(createApp()).post("/api/v1/auth/register")
      .send({ ...credentials, fullName: "New Member", confirmPassword: credentials.password });
    expect(response.status).toBe(201);
    expect(response.body.meta.verificationEmailStatus).toBe("failed");
    expect(response.body.data.accessToken).toBeUndefined();
  });
  it.each(["student", "lawyer", "super_admin"])("blocks existing unverified %s accounts before session creation", async (role) => {
    account!.roles = [{ role: { code: role } }];
    const response = await request(createApp()).post("/api/v1/auth/demo-sign-in").send(credentials);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(db.session.create).not.toHaveBeenCalled();
  });
  it("does not disclose verification status to someone with an incorrect password", async () => {
    const response = await request(createApp()).post("/api/v1/auth/demo-sign-in").send({ ...credentials, password: "wrong-password" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });
  it("retains completed verification and signs a verified user in normally", async () => {
    account!.emailVerifiedAt = new Date("2026-09-01T00:00:00Z");
    const response = await request(createApp()).post("/api/v1/auth/demo-sign-in").send(credentials);
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.user.emailVerifiedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("allows users to resend to the registered email before login", async () => {
    const response = await request(createApp()).post("/api/v1/auth/resend-verification").send({ email: "MEMBER@example.com" });
    expect(response.status).toBe(200);
    expect(db.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: credentials.email } }));
    expect(verificationMail).toHaveBeenCalledWith(expect.objectContaining({ email: credentials.email, notifyAdmin: false }));
  });
  it("preserves resend compatibility for old signed-in clients without granting portal access", async () => {
    const response = await request(createApp()).post("/api/v1/auth/resend-verification").set("Authorization", `Bearer ${accessToken()}`).send({});
    expect(response.status).toBe(200);
    expect(verificationMail).toHaveBeenCalledTimes(1);
  });
  it("returns the same public resend response for already verified and unknown emails", async () => {
    account!.emailVerifiedAt = new Date();
    const verified = await request(createApp()).post("/api/v1/auth/resend-verification").send({ email: credentials.email });
    account = null;
    const unknown = await request(createApp()).post("/api/v1/auth/resend-verification").send({ email: "unknown@example.com" });
    expect(unknown.body).toEqual(verified.body);
    expect(verificationMail).not.toHaveBeenCalled();
  });
  it("offers retry on a resend delivery failure without allowing login", async () => {
    verificationMail.mockResolvedValue({ skipped: false, userAccepted: [] });
    const app = createApp();
    const resend = await request(app).post("/api/v1/auth/resend-verification").send({ email: credentials.email });
    expect(resend.status).toBe(503);
    const login = await request(app).post("/api/v1/auth/demo-sign-in").send(credentials);
    expect(login.status).toBe(403);
  });
  it("rate limits public resend requests", async () => {
    const app = createApp();
    for (let i = 0; i < 3; i++) expect((await request(app).post("/api/v1/auth/resend-verification").send({ email: credentials.email })).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/resend-verification").send({ email: credentials.email })).status).toBe(429);
  });
  it("rejects an invalid resend email", async () => {
    expect((await request(createApp()).post("/api/v1/auth/resend-verification").send({ email: "invalid" })).status).toBe(400);
    expect(verificationMail).not.toHaveBeenCalled();
  });
  it("verifies the email and then permits login", async () => {
    const app = createApp();
    const verified = await request(app).get("/api/v1/auth/verify-email").query({ token: verificationToken() });
    expect(verified.status).toBe(200);
    expect(verified.text).toContain("You can now sign in");
    expect(account!.emailVerifiedAt).toBeInstanceOf(Date);
    expect((await request(app).post("/api/v1/auth/demo-sign-in").send(credentials)).status).toBe(200);
  });
  it("does not verify a changed email using a link for the old address", async () => {
    account!.email = "new-address@example.com";
    const response = await request(createApp()).get("/api/v1/auth/verify-email").query({ token: verificationToken() });
    expect(response.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("shows how to request another link when a link has expired", async () => {
    const response = await request(createApp()).get("/api/v1/auth/verify-email").query({ token: verificationToken({}, -1) });
    expect(response.status).toBe(400);
    expect(response.text).toContain("sign-in page");
    expect(response.text).toContain("https://example.com/auth/sign-in");
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("does not verify deleted accounts", async () => {
    account!.deletedAt = new Date();
    const response = await request(createApp()).get("/api/v1/auth/verify-email").query({ token: verificationToken() });
    expect(response.status).toBe(404);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("blocks old unverified access tokens on protected and optionally authenticated routes", async () => {
    const app = createApp();
    const response = await request(app).patch("/api/v1/users/me").set("Authorization", `Bearer ${accessToken()}`).send({ fullName: 123 });
    expect(response.status).toBe(403);
    const optional = await request(app).get("/api/v1/connect/questions").set("Authorization", `Bearer ${accessToken()}`);
    expect(optional.status).toBe(403);
  });
  it("does not accept an email verification token as a portal access token", async () => {
    account!.emailVerifiedAt = new Date();
    const response = await request(createApp()).patch("/api/v1/users/me").set("Authorization", `Bearer ${verificationToken()}`).send({});
    expect(response.status).toBe(401);
  });
  it("allows verified access tokens through the authentication gate", async () => {
    account!.emailVerifiedAt = new Date();
    const response = await request(createApp()).patch("/api/v1/users/me").set("Authorization", `Bearer ${accessToken()}`).send({ fullName: 123 });
    expect(response.status).toBe(400); // Reaches the existing profile validator.
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
  it("keeps existing role restrictions for verified users", async () => {
    account!.emailVerifiedAt = new Date();
    const response = await request(createApp()).get("/api/v1/admin/users").set("Authorization", `Bearer ${accessToken()}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
  it("blocks refresh tokens for unverified users", async () => {
    db.session.findUnique.mockResolvedValue({ id: "session", userId: account!.id, refreshHash: "hash", deletedAt: null, expiresAt: new Date(Date.now() + 100000), createdAt: new Date(), user: account });
    const response = await request(createApp()).post("/api/v1/auth/refresh").send({ refreshToken: "64b000000000000000000009.secret" });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(db.session.create).not.toHaveBeenCalled();
  });
  it("does not issue fallback sessions when the database is unavailable", async () => {
    const app = createApp({ useDatabase: false, allowAuthFallback: true });
    expect((await request(app).post("/api/v1/auth/demo-sign-in").send(credentials)).status).toBe(503);
    expect((await request(app).post("/api/v1/auth/register").send({ ...credentials, fullName: "Member", confirmPassword: credentials.password })).status).toBe(503);
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: "demo-refresh-token:member@example.com" })).status).toBe(503);
    expect(db.session.create).not.toHaveBeenCalled();
  });
});
