import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sendMail = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));
import { sendRegistrationVerificationEmails } from "../src/lib/email.js";
const input = {
  email: "member@example.com", fullName: "Member", roleCodes: ["student"],
  verificationUrl: "https://api.example.com/api/v1/auth/verify-email?token=test-verification-token"
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MAIL_FROM_EMAIL", "support@example.com");
  vi.stubEnv("MAIL_HOST", "smtp.example.com");
  vi.stubEnv("MAIL_APP_PASSWORD", "test-password");
  vi.stubEnv("MAIL_ADMIN_NOTIFICATION_EMAIL", "admin@example.com");
  sendMail.mockImplementation(async ({ to }) => ({ accepted: [to], rejected: [] }));
});
afterEach(() => vi.unstubAllEnvs());
describe("existing registration verification emails", () => {
  it("sends the verification link to the user but keeps it out of admin notifications", async () => {
    const result = await sendRegistrationVerificationEmails(input);
    expect(result).toMatchObject({ skipped: false, userAccepted: [input.email] });
    const userMessage = sendMail.mock.calls[0][0];
    expect(userMessage.to).toBe(input.email);
    expect(userMessage.text).toContain(input.verificationUrl);
    expect(userMessage.html).toContain("Verify Email Address");
    const adminMessage = sendMail.mock.calls[1][0];
    expect(adminMessage.to).toBe("admin@example.com");
    expect(adminMessage.text).not.toContain(input.verificationUrl);
    expect(adminMessage.html).not.toContain("test-verification-token");
  });
  it("resends only to the account owner without sending another admin registration notice", async () => {
    await sendRegistrationVerificationEmails({ ...input, notifyAdmin: false });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe(input.email);
  });
});
