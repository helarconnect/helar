import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sendMail = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));
import { sendSubscriptionActivationEmails } from "../src/lib/email.js";
const input = { amountMinor: 200000, currency: "NGN", email: "subscriber@example.com", fullName: "Subscriber", planName: "Monthly Subscription", reference: "helar.monthly.test123", startsAt: "2026-10-09T12:00:00Z", endsAt: "2026-11-09T12:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MAIL_FROM_EMAIL", "support@example.com");
  vi.stubEnv("MAIL_HOST", "smtp.example.com");
  vi.stubEnv("MAIL_APP_PASSWORD", "test-password");
  sendMail.mockResolvedValue({ accepted: [input.email], rejected: [] });
});
afterEach(() => vi.unstubAllEnvs());
describe("subscription confirmation mail", () => {
  it("states renewal in the subject, plain text and HTML, including expiry details", async () => {
    expect(await sendSubscriptionActivationEmails({ ...input, isRenewal: true })).toMatchObject({ subscriberSent: true });
    const options = sendMail.mock.calls[0][0];
    expect(options.to).toBe(input.email);
    expect(options.subject).toBe("Your Helar subscription has been renewed");
    expect(options.text).toContain("Your Helar subscription has been renewed successfully.");
    expect(options.text).toContain("Ends at:");
    expect(options.html).toContain("Your subscription has been renewed");
    expect(options.html).toContain("Ends on");
  });
  it("retains activation wording for first-time subscribers", async () => {
    await sendSubscriptionActivationEmails(input);
    expect(sendMail.mock.calls[0][0].subject).toBe("Your Helar subscription is active — thank you");
  });
  it("does not report subscriber delivery when SMTP rejects the message", async () => {
    sendMail.mockRejectedValueOnce(new Error("SMTP unavailable"));
    expect(await sendSubscriptionActivationEmails({ ...input, isRenewal: true })).toMatchObject({ subscriberSent: false });
  });
});
