import { randomUUID } from "node:crypto";

import nodemailer from "nodemailer";

const DEFAULT_GOOGLE_OAUTH_CLIENT_ID =
  "1074455817346-qdikf9j010j2tn4smne4g7jhjt9635do.apps.googleusercontent.com";

type AdminUserProvisioningEmailInput = {
  email: string;
  fullName: string;
  password: string;
  roleCodes: string[];
};

type RegistrationVerificationEmailInput = {
  email: string;
  fullName: string;
  roleCodes: string[];
  verificationUrl: string;
};

type PasswordResetEmailInput = {
  email: string;
  fullName: string;
  resetUrl: string;
};

type ContactEmailInput = {
  email: string;
  fullName: string;
  subject: string;
  message: string;
};

type GoogleMailConfig = {
  adminNotificationEmail?: string;
  appPassword?: string;
  clientId: string;
  clientSecret: string;
  fromEmail: string;
  fromName: string;
  refreshToken: string;
  replyTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure: boolean;
};

type TransactionalMailInput = {
  config: GoogleMailConfig;
  html: string;
  subject: string;
  text: string;
  to: string;
};

type SubscriptionActivationEmailInput = {
  amountMinor: number;
  currency: string;
  email: string;
  fullName: string;
  planName: string;
  reference: string;
  startsAt: string;
  endsAt: string | null;
};

let hasLoggedMissingEmailConfig = false;

type EmailTransportRecipient = string | { address?: string | null };

type EmailTransportResult = {
  accepted?: EmailTransportRecipient[] | undefined;
  rejected?: EmailTransportRecipient[] | undefined;
  response?: string | undefined;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmailDetails(
  details: Array<{
    label: string;
    value: string;
  }>
) {
  return details
    .map(
      (detail) => `
        <tr>
          <td style="padding: 0 0 14px; vertical-align: top;">
            <div style="font-size: 12px; line-height: 18px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em;">
              ${escapeHtml(detail.label)}
            </div>
            <div style="font-size: 15px; line-height: 22px; color: #0f172a; font-weight: 600;">
              ${escapeHtml(detail.value)}
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderEmailLayout(input: {
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  body: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  details?: Array<{
    label: string;
    value: string;
  }>;
  footerNote: string;
}) {
  const detailsSection =
    input.details && input.details.length > 0
      ? `
        <tr>
          <td style="padding: 0 32px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 18px; padding: 20px 22px;">
              ${renderEmailDetails(input.details)}
            </table>
          </td>
        </tr>
      `
      : "";

  const ctaSection =
    input.ctaLabel && input.ctaUrl
      ? `
        <tr>
          <td style="padding: 0 32px 24px;">
            <a
              href="${escapeHtml(input.ctaUrl)}"
              style="display: inline-block; padding: 14px 24px; border-radius: 999px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; font-size: 15px; line-height: 20px; font-weight: 700;"
            >
              ${escapeHtml(input.ctaLabel)}
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 32px 24px;">
            <div style="font-size: 13px; line-height: 20px; color: #64748b;">
              If the button does not work, copy and paste this link into your browser:
            </div>
            <div style="margin-top: 8px; font-size: 13px; line-height: 20px; word-break: break-all;">
              <a href="${escapeHtml(input.ctaUrl)}" style="color: #2563eb; text-decoration: none;">
                ${escapeHtml(input.ctaUrl)}
              </a>
            </div>
          </td>
        </tr>
      `
      : "";

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(input.title)}</title>
      </head>
      <body style="margin: 0; padding: 0; background: #f1f5f9; font-family: Arial, Helvetica, sans-serif; color: #0f172a;">
        <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
          ${escapeHtml(input.preheader)}
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #f1f5f9; padding: 32px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 640px; background: #ffffff; border-radius: 28px; overflow: hidden; border: 1px solid #e2e8f0;">
                <tr>
                  <td style="padding: 32px 32px 20px; background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);">
                    <div style="font-size: 12px; line-height: 18px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #2563eb;">
                      ${escapeHtml(input.eyebrow)}
                    </div>
                    <h1 style="margin: 12px 0 12px; font-size: 28px; line-height: 34px; color: #0f172a;">
                      ${escapeHtml(input.title)}
                    </h1>
                    <p style="margin: 0; font-size: 16px; line-height: 26px; color: #334155;">
                      ${escapeHtml(input.intro)}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 32px 24px;">
                    ${input.body
                      .map(
                        (paragraph) => `
                          <p style="margin: 0 0 16px; font-size: 15px; line-height: 25px; color: #334155;">
                            ${escapeHtml(paragraph)}
                          </p>
                        `
                      )
                      .join("")}
                  </td>
                </tr>
                ${detailsSection}
                ${ctaSection}
                <tr>
                  <td style="padding: 0 32px 32px;">
                    <div style="padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 13px; line-height: 22px; color: #64748b;">
                      ${escapeHtml(input.footerNote)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `.trim();
}

function normalizeRecipients(recipients?: EmailTransportRecipient[]) {
  return (recipients ?? [])
    .map((recipient) => (typeof recipient === "string" ? recipient : recipient.address ?? ""))
    .filter(Boolean);
}

function getRejectedRecipients(info: EmailTransportResult) {
  return normalizeRecipients(info.rejected);
}

function assertEmailAccepted(
  info: EmailTransportResult,
  recipient: string,
  label: string
) {
  const acceptedRecipients = normalizeRecipients(info.accepted);
  const rejectedRecipients = getRejectedRecipients(info);

  if (rejectedRecipients.includes(recipient) || acceptedRecipients.length === 0) {
    throw new Error(
      `${label} email was not accepted by the mail transport. Accepted: ${
        acceptedRecipients.join(", ") || "none"
      }. Rejected: ${rejectedRecipients.join(", ") || "none"}. Response: ${info.response ?? "n/a"}`
    );
  }
}

function prettifyRoleCode(roleCode: string) {
  return roleCode
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getGoogleMailConfig(): GoogleMailConfig | null {
  const fromEmail =
    process.env.MAIL_FROM_EMAIL?.trim() ??
    process.env.GOOGLE_OAUTH_SENDER_EMAIL?.trim() ??
    "";
  const appPassword =
    process.env.MAIL_APP_PASSWORD?.replace(/\s+/g, "") ??
    process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "") ??
    "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "";
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() ?? "";
  const smtpHost = process.env.MAIL_HOST?.trim() ?? "";
  const smtpPortRaw = process.env.MAIL_PORT?.trim() ?? "";
  const smtpPortParsed = Number.parseInt(smtpPortRaw, 10);
  const smtpPort = Number.isFinite(smtpPortParsed) ? smtpPortParsed : smtpHost ? 587 : NaN;
  const smtpSecureRaw = process.env.MAIL_SECURE?.trim().toLowerCase();
  const smtpSecure =
    smtpSecureRaw === "true" ? true : smtpSecureRaw === "false" ? false : smtpPort === 465;

  const hasSmtpConfig = Boolean(fromEmail && smtpHost && appPassword);
  const hasGmailOAuthConfig = Boolean(fromEmail && clientSecret && refreshToken);
  const hasGmailAppPasswordConfig = Boolean(fromEmail && appPassword);

  if (!hasSmtpConfig && !hasGmailOAuthConfig && !hasGmailAppPasswordConfig) {
    return null;
  }

  return {
    adminNotificationEmail:
      process.env.MAIL_ADMIN_NOTIFICATION_EMAIL?.trim() ||
      process.env.SUBSCRIPTION_NOTIFICATION_EMAIL?.trim() ||
      fromEmail,
    appPassword: appPassword || undefined,
    fromEmail,
    fromName: process.env.MAIL_FROM_NAME?.trim() || "Helar",
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || DEFAULT_GOOGLE_OAUTH_CLIENT_ID,
    clientSecret,
    refreshToken,
    replyTo: process.env.MAIL_REPLY_TO?.trim() || undefined,
    smtpHost: smtpHost || undefined,
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : undefined,
    smtpSecure
  };
}

function getMessageIdDomain(fromEmail: string) {
  return fromEmail.split("@")[1]?.trim() || "localhost";
}

function buildTransactionalMailOptions(input: TransactionalMailInput) {
  const messageIdDomain = getMessageIdDomain(input.config.fromEmail);
  const messageId = `<${randomUUID()}@${messageIdDomain}>`;

  return {
    from: `${input.config.fromName} <${input.config.fromEmail}>`,
    to: input.to,
    sender: input.config.fromEmail,
    replyTo: input.config.replyTo ?? input.config.fromEmail,
    envelope: {
      from: input.config.fromEmail,
      to: input.to
    },
    subject: input.subject,
    text: input.text,
    html: input.html,
    date: new Date(),
    messageId,
    headers: {
      "X-Auto-Response-Suppress": "OOF, AutoReply",
      "X-Entity-Ref-ID": messageId,
      "Auto-Submitted": "auto-generated"
    }
  };
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(amountMinor / 100);
}

function formatDateTime(value: string | null) {
  if (!value) return "Not available";

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function buildProvisioningEmailText(input: AdminUserProvisioningEmailInput) {
  const roleSummary = input.roleCodes.map(prettifyRoleCode).join(", ") || "User";

  return [
    `Hello ${input.fullName},`,
    "",
    "Your Helar account has been created.",
    "",
    `Email: ${input.email}`,
    `Temporary password: ${input.password}`,
    `Assigned roles: ${roleSummary}`,
    "",
    "Please sign in and change your password as soon as possible.",
    "",
    "Regards,",
    "Helar"
  ].join("\n");
}

function buildProvisioningEmailHtml(input: AdminUserProvisioningEmailInput) {
  const roleSummary = input.roleCodes.map(prettifyRoleCode).join(", ") || "User";

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #0f172a;">
      <p>Hello ${input.fullName},</p>
      <p>Your Helar account has been created.</p>
      <p>
        <strong>Email:</strong> ${input.email}<br />
        <strong>Temporary password:</strong> ${input.password}<br />
        <strong>Assigned roles:</strong> ${roleSummary}
      </p>
      <p>Please sign in and change your password as soon as possible.</p>
      <p>Regards,<br />Helar</p>
    </div>
  `.trim();
}

function buildRegistrationVerificationText(input: RegistrationVerificationEmailInput) {
  const roleSummary = input.roleCodes.map(prettifyRoleCode).join(", ") || "User";

  return [
    `Hello ${input.fullName},`,
    "",
    "Welcome to Helar.",
    "",
    "Your account has been created successfully. To activate it, please verify your email address using the secure link below:",
    input.verificationUrl,
    "",
    `Account type: ${roleSummary}`,
    "",
    "This verification link expires in 24 hours.",
    "",
    "If you did not create this account, you can safely ignore this email.",
    "",
    "Regards,",
    "Helar"
  ].join("\n");
}

function buildRegistrationVerificationHtml(input: RegistrationVerificationEmailInput) {
  const roleSummary = input.roleCodes.map(prettifyRoleCode).join(", ") || "User";

  return renderEmailLayout({
    preheader: "Verify your Helar account to complete your registration.",
    eyebrow: "Account Verification",
    title: "Verify your Helar account",
    intro: `Hello ${input.fullName}, welcome to Helar.`,
    body: [
      "Your account has been created successfully and is almost ready to use.",
      "Please confirm your email address to activate your account and continue securely."
    ],
    ctaLabel: "Verify Email Address",
    ctaUrl: input.verificationUrl,
    details: [
      { label: "Registered email", value: input.email },
      { label: "Account type", value: roleSummary },
      { label: "Verification window", value: "24 hours" }
    ],
    footerNote: "If you did not create this account, no action is required and you can ignore this message."
  });
}

function buildAdminRegistrationNotificationText(input: RegistrationVerificationEmailInput) {
  const roleSummary = input.roleCodes.map(prettifyRoleCode).join(", ") || "User";

  return [
    "A new Helar user has registered.",
    "",
    `Full name: ${input.fullName}`,
    `Email: ${input.email}`,
    `Account type: ${roleSummary}`,
    "Status: Pending email verification",
    `Verification link: ${input.verificationUrl}`
  ].join("\n");
}

function buildAdminRegistrationNotificationHtml(input: RegistrationVerificationEmailInput) {
  const roleSummary = input.roleCodes.map(prettifyRoleCode).join(", ") || "User";

  return renderEmailLayout({
    preheader: "A new user registration needs visibility in Helar.",
    eyebrow: "Registration Alert",
    title: "New user registration",
    intro: "A new user has just registered on Helar.",
    body: [
      "The account has been created and is currently waiting for email verification.",
      "Use the summary below for quick reference."
    ],
    ctaLabel: "Open Verification Link",
    ctaUrl: input.verificationUrl,
    details: [
      { label: "Full name", value: input.fullName },
      { label: "Email address", value: input.email },
      { label: "Account type", value: roleSummary },
      { label: "Account status", value: "Pending email verification" }
    ],
    footerNote: "This notification was sent automatically by Helar to keep the operations inbox up to date."
  });
}

function buildPasswordResetText(input: PasswordResetEmailInput) {
  return [
    `Hello ${input.fullName},`,
    "",
    "We received a request to reset your Helar password.",
    "",
    "Use the secure link below to set a new password:",
    input.resetUrl,
    "",
    "This password reset link expires in 1 hour.",
    "",
    "If you did not request this change, you can ignore this email.",
    "",
    "Regards,",
    "Helar"
  ].join("\n");
}

function buildPasswordResetHtml(input: PasswordResetEmailInput) {
  return renderEmailLayout({
    preheader: "Reset your Helar password securely.",
    eyebrow: "Password Reset",
    title: "Set a new Helar password",
    intro: `Hello ${input.fullName}, we received a request to reset your password.`,
    body: [
      "Use the secure button below to choose a new password for your Helar account.",
      "For your security, this password reset link will expire after 1 hour."
    ],
    ctaLabel: "Reset Password",
    ctaUrl: input.resetUrl,
    details: [
      { label: "Registered email", value: input.email },
      { label: "Reset window", value: "1 hour" }
    ],
    footerNote: "If you did not request this password reset, no action is required and you can ignore this message."
  });
}

function buildContactEmailText(input: ContactEmailInput) {
  return [
    "New Helar website contact message.",
    "",
    `Name: ${input.fullName}`,
    `Email: ${input.email}`,
    `Subject: ${input.subject}`,
    "",
    input.message
  ].join("\n");
}

function buildContactEmailHtml(input: ContactEmailInput) {
  const messageParagraphs = input.message
    .split(/\n{2,}/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return renderEmailLayout({
    preheader: `New message from ${input.fullName}.`,
    eyebrow: "Contact Form",
    title: "New Helar contact message",
    intro: "A visitor submitted a message from the Helar website contact page.",
    body: messageParagraphs.length ? messageParagraphs : [input.message],
    details: [
      { label: "Name", value: input.fullName },
      { label: "Email", value: input.email },
      { label: "Subject", value: input.subject }
    ],
    footerNote: "This message was submitted via the Helar contact page."
  });
}

function buildSubscriberSubscriptionText(input: SubscriptionActivationEmailInput) {
  return [
    `Hello ${input.fullName},`,
    "",
    "Your Helar subscription payment was successful.",
    "",
    `Plan: ${input.planName}`,
    `Amount: ${formatMoney(input.amountMinor, input.currency)}`,
    `Reference: ${input.reference}`,
    `Starts at: ${formatDateTime(input.startsAt)}`,
    `Ends at: ${formatDateTime(input.endsAt)}`,
    "",
    "Thank you for subscribing to Helar.",
    "",
    "Regards,",
    "Helar"
  ].join("\n");
}

function buildSubscriberSubscriptionHtml(input: SubscriptionActivationEmailInput) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #0f172a;">
      <p>Hello ${input.fullName},</p>
      <p>Your Helar subscription payment was successful.</p>
      <p>
        <strong>Plan:</strong> ${input.planName}<br />
        <strong>Amount:</strong> ${formatMoney(input.amountMinor, input.currency)}<br />
        <strong>Reference:</strong> ${input.reference}<br />
        <strong>Starts at:</strong> ${formatDateTime(input.startsAt)}<br />
        <strong>Ends at:</strong> ${formatDateTime(input.endsAt)}
      </p>
      <p>Thank you for subscribing to Helar.</p>
      <p>Regards,<br />Helar</p>
    </div>
  `.trim();
}

function buildAdminSubscriptionText(input: SubscriptionActivationEmailInput) {
  return [
    "A Helar subscription has been activated.",
    "",
    `Subscriber: ${input.fullName}`,
    `Subscriber email: ${input.email}`,
    `Plan: ${input.planName}`,
    `Amount: ${formatMoney(input.amountMinor, input.currency)}`,
    `Reference: ${input.reference}`,
    `Starts at: ${formatDateTime(input.startsAt)}`,
    `Ends at: ${formatDateTime(input.endsAt)}`
  ].join("\n");
}

function buildAdminSubscriptionHtml(input: SubscriptionActivationEmailInput) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #0f172a;">
      <p>A Helar subscription has been activated.</p>
      <p>
        <strong>Subscriber:</strong> ${input.fullName}<br />
        <strong>Subscriber email:</strong> ${input.email}<br />
        <strong>Plan:</strong> ${input.planName}<br />
        <strong>Amount:</strong> ${formatMoney(input.amountMinor, input.currency)}<br />
        <strong>Reference:</strong> ${input.reference}<br />
        <strong>Starts at:</strong> ${formatDateTime(input.startsAt)}<br />
        <strong>Ends at:</strong> ${formatDateTime(input.endsAt)}
      </p>
    </div>
  `.trim();
}

function createGoogleTransport(config: GoogleMailConfig) {
  if (config.smtpHost && config.smtpPort && config.appPassword) {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.fromEmail,
        pass: config.appPassword
      }
    });
  }

  if (config.appPassword) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: config.fromEmail,
        pass: config.appPassword
      }
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: config.fromEmail,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken
    }
  });
}

export function isGoogleOAuthEmailConfigured() {
  return getGoogleMailConfig() !== null;
}

export async function sendAdminUserProvisioningEmail(input: AdminUserProvisioningEmailInput) {
  const config = getGoogleMailConfig();

  if (!config) {
    if (!hasLoggedMissingEmailConfig) {
      hasLoggedMissingEmailConfig = true;
      console.warn(
        "Email sending is not fully configured. Set MAIL_FROM_EMAIL, MAIL_HOST, MAIL_PORT, and MAIL_APP_PASSWORD for SMTP auth, or configure the Gmail OAuth fallback variables."
      );
    }

    return { skipped: true as const };
  }

  const transporter = createGoogleTransport(config);

  await transporter.sendMail(
    buildTransactionalMailOptions({
      config,
      to: input.email,
      subject: "Your Helar account has been created",
      text: buildProvisioningEmailText(input),
      html: buildProvisioningEmailHtml(input)
    })
  );

  return { skipped: false as const };
}

export async function sendRegistrationVerificationEmails(input: RegistrationVerificationEmailInput) {
  const config = getGoogleMailConfig();

  if (!config) {
    if (!hasLoggedMissingEmailConfig) {
      hasLoggedMissingEmailConfig = true;
      console.warn(
        "Email sending is not fully configured. Set MAIL_FROM_EMAIL, MAIL_HOST, MAIL_PORT, and MAIL_APP_PASSWORD for SMTP auth, or configure the Gmail OAuth fallback variables."
      );
    }

    return { skipped: true as const };
  }

  const transporter = createGoogleTransport(config);
  const userEmailResult = await transporter.sendMail(
    buildTransactionalMailOptions({
      config,
      to: input.email,
      subject: "Verify your Helar account",
      text: buildRegistrationVerificationText(input),
      html: buildRegistrationVerificationHtml(input)
    })
  );

  assertEmailAccepted(userEmailResult, input.email, "User verification");

  let adminEmailResult:
    | EmailTransportResult
    | undefined;

  if (config.adminNotificationEmail) {
    adminEmailResult = await transporter.sendMail(
      buildTransactionalMailOptions({
        config,
        to: config.adminNotificationEmail,
        subject: "New Helar user registration",
        text: buildAdminRegistrationNotificationText(input),
        html: buildAdminRegistrationNotificationHtml(input)
      })
    );

    assertEmailAccepted(adminEmailResult, config.adminNotificationEmail, "Admin registration notification");
  }

  return {
    skipped: false as const,
    adminAccepted: normalizeRecipients(adminEmailResult?.accepted),
    userAccepted: normalizeRecipients(userEmailResult.accepted)
  };
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput) {
  const config = getGoogleMailConfig();

  if (!config) {
    if (!hasLoggedMissingEmailConfig) {
      hasLoggedMissingEmailConfig = true;
      console.warn(
        "Email sending is not fully configured. Set MAIL_FROM_EMAIL, MAIL_HOST, MAIL_PORT, and MAIL_APP_PASSWORD for SMTP auth, or configure the Gmail OAuth fallback variables."
      );
    }

    return { skipped: true as const };
  }

  const transporter = createGoogleTransport(config);
  const userEmailResult = await transporter.sendMail(
    buildTransactionalMailOptions({
      config,
      to: input.email,
      subject: "Reset your Helar password",
      text: buildPasswordResetText(input),
      html: buildPasswordResetHtml(input)
    })
  );

  assertEmailAccepted(userEmailResult, input.email, "Password reset");

  return {
    skipped: false as const,
    userAccepted: normalizeRecipients(userEmailResult.accepted)
  };
}

export async function sendContactEmail(input: ContactEmailInput) {
  const config = getGoogleMailConfig();

  if (!config) {
    if (!hasLoggedMissingEmailConfig) {
      hasLoggedMissingEmailConfig = true;
      console.warn(
        "Email sending is not fully configured. Set MAIL_FROM_EMAIL, MAIL_HOST, MAIL_PORT, and MAIL_APP_PASSWORD for SMTP auth, or configure the Gmail OAuth fallback variables."
      );
    }

    return { skipped: true as const };
  }

  const recipient = process.env.CONTACT_TO_EMAIL?.trim() || "info@helar.law";
  const transporter = createGoogleTransport(config);
  const mail = buildTransactionalMailOptions({
    config,
    to: recipient,
    subject: `Helar contact: ${input.subject}`,
    text: buildContactEmailText(input),
    html: buildContactEmailHtml(input)
  });
  const result = await transporter.sendMail({
    ...mail,
    replyTo: input.email
  });

  assertEmailAccepted(result, recipient, "Contact form");

  return {
    skipped: false as const,
    accepted: normalizeRecipients(result.accepted)
  };
}

export async function sendSubscriptionActivationEmails(input: SubscriptionActivationEmailInput) {
  const config = getGoogleMailConfig();

  if (!config) {
    if (!hasLoggedMissingEmailConfig) {
      hasLoggedMissingEmailConfig = true;
      console.warn(
        "Email sending is not fully configured. Set MAIL_FROM_EMAIL, MAIL_HOST, MAIL_PORT, and MAIL_APP_PASSWORD for SMTP auth, or configure the Gmail OAuth fallback variables."
      );
    }

    return { skipped: true as const };
  }

  const transporter = createGoogleTransport(config);
  const sendTasks = [
    transporter.sendMail(
      buildTransactionalMailOptions({
        config,
        to: input.email,
        subject: "Your Helar subscription is active",
        text: buildSubscriberSubscriptionText(input),
        html: buildSubscriberSubscriptionHtml(input)
      })
    )
  ];

  if (config.adminNotificationEmail) {
    sendTasks.push(
      transporter.sendMail(
        buildTransactionalMailOptions({
          config,
          to: config.adminNotificationEmail,
          subject: `New Helar subscription: ${input.planName}`,
          text: buildAdminSubscriptionText(input),
          html: buildAdminSubscriptionHtml(input)
        })
      )
    );
  }

  await Promise.all(sendTasks);

  return { skipped: false as const };
}
