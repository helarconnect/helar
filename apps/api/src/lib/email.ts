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
  smtpUser?: string;
  smtpPort?: number;
  smtpSecure: boolean;
  tlsRejectUnauthorized: boolean;
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

export type WelcomeEmailInput = {
  email: string;
  fullName: string;
  roleCodes: string[];
  signInUrl: string;
  pricingUrl: string;
  isAlreadyVerified: boolean;
};

export type SubscriptionExpiringSoonEmailInput = {
  email: string;
  fullName: string;
  planName: string;
  endsAt: string;
  daysRemaining: 7 | 3 | 1 | 0;
  renewUrl: string;
};

export type SubscriptionExpiredEmailInput = {
  email: string;
  fullName: string;
  planName: string;
  endedAt: string;
  renewUrl: string;
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

function logSendResult(input: {
  emailType: string;
  to: string | string[];
  subject: string;
  accepted: string[];
  rejected: string[];
  skipped?: boolean;
  error?: string;
}) {
  const toRecipients = Array.isArray(input.to) ? input.to : [input.to];
  console.info(
    JSON.stringify({
      event: "email_send_result",
      emailType: input.emailType,
      to: toRecipients,
      subject: input.subject,
      accepted: input.accepted,
      rejected: input.rejected,
      skipped: input.skipped ?? false,
      error: input.error ?? null,
      timestamp: new Date().toISOString()
    })
  );
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
  const smtpUser = process.env.MAIL_SMTP_USER?.trim() ?? "";
  const smtpPortRaw = process.env.MAIL_PORT?.trim() ?? "";
  const smtpPortParsed = Number.parseInt(smtpPortRaw, 10);
  const smtpPort = Number.isFinite(smtpPortParsed) ? smtpPortParsed : smtpHost ? 587 : NaN;
  const smtpSecureRaw = process.env.MAIL_SECURE?.trim().toLowerCase();
  const smtpSecure =
    smtpSecureRaw === "true" ? true : smtpSecureRaw === "false" ? false : smtpPort === 465;
  const tlsRejectUnauthorizedRaw = process.env.MAIL_TLS_REJECT_UNAUTHORIZED?.trim().toLowerCase();
  const tlsRejectUnauthorized = tlsRejectUnauthorizedRaw === "false" ? false : true;

  const hasSmtpConfig = Boolean(
    fromEmail && smtpHost && Number.isFinite(smtpPort) && appPassword
  );
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
    fromName: process.env.MAIL_FROM_NAME?.trim() || "Helar Support",
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || DEFAULT_GOOGLE_OAUTH_CLIENT_ID,
    clientSecret,
    refreshToken,
    replyTo: process.env.MAIL_REPLY_TO?.trim() || fromEmail,
    smtpHost: smtpHost || undefined,
    smtpUser: smtpUser || undefined,
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : undefined,
    smtpSecure,
    tlsRejectUnauthorized
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
      <p>Hello ${escapeHtml(input.fullName)},</p>
      <p>Your Helar account has been created.</p>
      <p>
        <strong>Email:</strong> ${escapeHtml(input.email)}<br />
        <strong>Temporary password:</strong> ${escapeHtml(input.password)}<br />
        <strong>Assigned roles:</strong> ${escapeHtml(roleSummary)}
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
  return renderEmailLayout({
    preheader: "Your Helar subscription payment was successful. Here are the details.",
    eyebrow: "Subscription Active",
    title: "Your subscription is active",
    intro: `Hello ${input.fullName}, your Helar subscription payment was successful.`,
    body: [
      "Thank you for subscribing to Helar. Your subscription has been activated and you now have full access to all the features included in your plan.",
      "You can review your subscription details, manage your plan, and update your billing information at any time from your account settings."
    ],
    details: [
      { label: "Plan", value: input.planName },
      { label: "Amount paid", value: formatMoney(input.amountMinor, input.currency) },
      { label: "Payment reference", value: input.reference },
      { label: "Starts on", value: formatDateTime(input.startsAt) },
      { label: "Ends on", value: formatDateTime(input.endsAt) }
    ],
    footerNote: "Thank you for choosing Helar. Reply to this email if you need any assistance from our support team."
  });
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
  return renderEmailLayout({
    preheader: `New subscription activated for ${input.fullName}.`,
    eyebrow: "Subscription Alert",
    title: "New subscription activated",
    intro: "A Helar subscription has been successfully activated.",
    body: [
      "A new subscriber has completed payment and their subscription is now active.",
      "Use the summary below for quick reference and follow up if needed."
    ],
    details: [
      { label: "Subscriber name", value: input.fullName },
      { label: "Subscriber email", value: input.email },
      { label: "Plan", value: input.planName },
      { label: "Amount", value: formatMoney(input.amountMinor, input.currency) },
      { label: "Payment reference", value: input.reference },
      { label: "Starts on", value: formatDateTime(input.startsAt) },
      { label: "Ends on", value: formatDateTime(input.endsAt) }
    ],
    footerNote: "This notification was sent automatically by Helar to keep the operations inbox up to date."
  });
}

function buildWelcomeEmailText(input: WelcomeEmailInput) {
  const roleSummary = input.roleCodes.map(prettifyRoleCode).join(", ") || "User";
  const lines = [
    `Hello ${input.fullName},`,
    "",
    "Welcome to Helar — we're excited to have you on board.",
    "",
    "Helar is the modern study and reference workspace built for law students and lawyers in Nigeria.",
    "",
    "What you get with Helar:",
    "  • Structured Law Reports & Cases — read the most important judgments with clear context",
    "  • Subject Summaries (Cases & Ratios) — concise, exam-ready review for every subject",
    "  • Bar Final past papers — MCQ and Theory with model answers",
    "  • Helar Connect community — ask questions, share answers, and learn together",
    "",
    `Your account type: ${roleSummary}`,
    ""
  ];

  if (!input.isAlreadyVerified) {
    lines.push("Next steps:");
    lines.push("  1. Check your inbox for the separate email verification link and click it to activate your account.");
    lines.push("  2. Sign in and explore the Library to start reading.");
    lines.push(`  3. Review the pricing page (${input.pricingUrl}) to unlock the full premium experience.`);
  } else {
    lines.push("Next steps:");
    lines.push("  1. Sign in and explore the Library to start reading.");
    lines.push(`  2. Review the pricing page (${input.pricingUrl}) to unlock the full premium experience.`);
    lines.push("  3. Join a discussion on Helar Connect or introduce yourself to the community.");
  }

  lines.push("");
  lines.push(`Sign in to Helar: ${input.signInUrl}`);
  lines.push("");
  lines.push("If you have any questions, reply to this email or contact support@helar.law — we're happy to help.");
  lines.push("");
  lines.push("Regards,");
  lines.push("The Helar Team");

  return lines.join("\n");
}

function buildWelcomeEmailHtml(input: WelcomeEmailInput) {
  const roleSummary = input.roleCodes.map(prettifyRoleCode).join(", ") || "User";
  const firstName = input.fullName.trim().split(/\s+/)[0] ?? input.fullName.trim();

  const nextStepsBody = input.isAlreadyVerified
    ? [
        "Your account is active and ready. Here's how to get the most out of Helar:",
        "Sign in below and explore the Library to start reading structured Law Reports. If you'd like to unlock the full premium library, Subject Summaries, Bar Final past papers with model answers, and CBT practice, visit the Pricing page."
      ]
    : [
        "Good news: we've also sent a separate email verification link to your inbox. Click the link in that email to fully activate your account.",
        "Once your email is verified, sign in below to explore the Library, browse Subject Summaries, and join the Helar Connect community. To unlock the full premium library, Bar Final past papers, CBT practice tools, and more, visit Pricing."
      ];

  return renderEmailLayout({
    preheader: "Your Helar legal learning workspace is ready. Welcome aboard.",
    eyebrow: "Welcome aboard",
    title: `Welcome to Helar, ${firstName} 👋`,
    intro: `Hello ${input.fullName}, we're excited to have you as part of the Helar community.`,
    body: nextStepsBody,
    ctaLabel: "Sign in to Helar",
    ctaUrl: input.signInUrl,
    details: [
      { label: "Registered email", value: input.email },
      { label: "Account type", value: roleSummary },
      { label: "Next step", value: input.isAlreadyVerified ? "Sign in and explore the Library" : "Verify your email, then sign in" },
      { label: "Pricing & plans", value: input.pricingUrl }
    ],
    footerNote: "Need help getting started? Reply to this email or reach out to support@helar.law — we usually reply within one business day."
  });
}

function getExpiringSoonSubject(daysRemaining: 7 | 3 | 1 | 0) {
  if (daysRemaining === 7) {
    return "Your Helar subscription expires in 7 days — renew early";
  }
  if (daysRemaining === 3) {
    return "Heads up: your Helar subscription ends in 3 days";
  }
  if (daysRemaining === 1) {
    return "Reminder: your Helar subscription expires tomorrow";
  }
  return "Last chance: your Helar subscription expires today";
}

function getExpiredSubject() {
  return "Your Helar subscription has expired — renew to restore access";
}

function buildSubscriptionExpiringSoonText(input: SubscriptionExpiringSoonEmailInput) {
  const lines = [
    `Hello ${input.fullName},`,
    "",
    `Your Helar ${input.planName} subscription is expiring soon.`,
    ""
  ];

  if (input.daysRemaining <= 0) {
    lines.push("Your subscription ends today.");
  } else if (input.daysRemaining === 1) {
    lines.push("Your subscription ends tomorrow.");
  } else {
    lines.push(`Your subscription ends in ${input.daysRemaining} days.`);
  }

  lines.push("");
  lines.push(`Plan: ${input.planName}`);
  lines.push(`Ends on: ${formatDateTime(input.endsAt)}`);
  lines.push("");
  lines.push(`Renew now to keep your access: ${input.renewUrl}`);
  lines.push("");
  lines.push("If you have any questions, reply to this email and our support team will help.");
  lines.push("");
  lines.push("Regards,");
  lines.push("Helar Support");

  return lines.join("\n");
}

function buildSubscriptionExpiringSoonHtml(input: SubscriptionExpiringSoonEmailInput) {
  const urgencyNote =
    input.daysRemaining <= 0
      ? "Your subscription ends today — renew now to avoid losing premium access to the library, Bar materials, and CBT tools."
      : input.daysRemaining === 1
      ? "Your subscription ends tomorrow — renew now to avoid interruption."
      : `Your subscription ends in ${input.daysRemaining} days — renew early to keep your premium access uninterrupted.`;

  const subjectLine = getExpiringSoonSubject(input.daysRemaining);

  return renderEmailLayout({
    preheader: subjectLine,
    eyebrow: "Subscription Reminder",
    title: subjectLine,
    intro: `Hello ${input.fullName}, a quick heads-up about your Helar subscription.`,
    body: [
      urgencyNote,
      "On expiry your access to premium Law Reports, Subject Summaries, Bar Final past papers, and premium Helar Connect tools will be restricted."
    ],
    ctaLabel: "Renew subscription now",
    ctaUrl: input.renewUrl,
    details: [
      { label: "Plan", value: input.planName },
      { label: "Expiry date", value: formatDateTime(input.endsAt) }
    ],
    footerNote: "Need help with your renewal? Reply to this email or contact support@helar.law."
  });
}

function buildSubscriptionExpiredText(input: SubscriptionExpiredEmailInput) {
  const lines = [
    `Hello ${input.fullName},`,
    "",
    `Your Helar ${input.planName} subscription has ended.`,
    "",
    `Plan: ${input.planName}`,
    `Ended on: ${formatDateTime(input.endedAt)}`,
    "",
    "Access to premium features including the full Law Reports library, Subject Summaries, Bar Final past papers, CBT practice, and premium Helar Connect tools is currently restricted.",
    "",
    `Renew now to restore full access: ${input.renewUrl}`,
    "",
    "If you have any questions, reply to this email and our support team will help.",
    "",
    "Regards,",
    "Helar Support"
  ];

  return lines.join("\n");
}

function buildSubscriptionExpiredHtml(input: SubscriptionExpiredEmailInput) {
  const subjectLine = getExpiredSubject();

  return renderEmailLayout({
    preheader: subjectLine,
    eyebrow: "Subscription Ended",
    title: "Your subscription has expired",
    intro: `Hello ${input.fullName}, your Helar ${input.planName} subscription has ended.`,
    body: [
      "Your access to premium features is currently restricted. This includes the full Law Reports library, Subject Summaries (Cases & Ratios), Bar Final past papers with model answers, CBT practice tools, and premium Helar Connect perks.",
      "Renewing your subscription will immediately restore full access so you can pick up right where you left off."
    ],
    ctaLabel: "Renew subscription",
    ctaUrl: input.renewUrl,
    details: [
      { label: "Plan", value: input.planName },
      { label: "Expired on", value: formatDateTime(input.endedAt) }
    ],
    footerNote: "Need a custom plan or have questions about renewal? Reply to this email or contact support@helar.law."
  });
}

function createGoogleTransport(config: GoogleMailConfig) {
  if (config.smtpHost && config.smtpPort && config.appPassword) {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser ?? config.fromEmail,
        pass: config.appPassword
      },
      tls: {
        rejectUnauthorized: config.tlsRejectUnauthorized
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
  const subject = "Your Helar account has been created";
  const emailType = "admin_user_provisioning";

  if (!config) {
    if (!hasLoggedMissingEmailConfig) {
      hasLoggedMissingEmailConfig = true;
      console.warn(
        "Email sending is not fully configured. Set MAIL_FROM_EMAIL, MAIL_HOST, MAIL_PORT, and MAIL_APP_PASSWORD for SMTP auth, or configure the Gmail OAuth fallback variables."
      );
    }

    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: [],
      rejected: [],
      skipped: true
    });

    return { skipped: true as const };
  }

  const transporter = createGoogleTransport(config);
  try {
    const result = await transporter.sendMail(
      buildTransactionalMailOptions({
        config,
        to: input.email,
        subject,
        text: buildProvisioningEmailText(input),
        html: buildProvisioningEmailHtml(input)
      })
    );

    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: normalizeRecipients(result.accepted),
      rejected: getRejectedRecipients(result)
    });

    return { skipped: false as const };
  } catch (error) {
    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: [],
      rejected: [],
      error: error instanceof Error ? error.message : String(error)
    });
    return { skipped: false as const, error: true as const };
  }
}

export async function sendRegistrationVerificationEmails(input: RegistrationVerificationEmailInput) {
  const config = getGoogleMailConfig();
  const userSubject = "Verify your Helar account";
  const adminSubject = "New Helar user registration";
  const userEmailType = "registration_verification_user";
  const adminEmailType = "registration_verification_admin";

  if (!config) {
    if (!hasLoggedMissingEmailConfig) {
      hasLoggedMissingEmailConfig = true;
      console.warn(
        "Email sending is not fully configured. Set MAIL_FROM_EMAIL, MAIL_HOST, MAIL_PORT, and MAIL_APP_PASSWORD for SMTP auth, or configure the Gmail OAuth fallback variables."
      );
    }

    logSendResult({
      emailType: userEmailType,
      to: input.email,
      subject: userSubject,
      accepted: [],
      rejected: [],
      skipped: true
    });

    return { skipped: true as const };
  }

  const transporter = createGoogleTransport(config);
  let userAccepted: string[] = [];
  try {
    const userEmailResult = await transporter.sendMail(
      buildTransactionalMailOptions({
        config,
        to: input.email,
        subject: userSubject,
        text: buildRegistrationVerificationText(input),
        html: buildRegistrationVerificationHtml(input)
      })
    );

    assertEmailAccepted(userEmailResult, input.email, "User verification");

    logSendResult({
      emailType: userEmailType,
      to: input.email,
      subject: userSubject,
      accepted: normalizeRecipients(userEmailResult.accepted),
      rejected: getRejectedRecipients(userEmailResult)
    });
    userAccepted = normalizeRecipients(userEmailResult.accepted);
  } catch (error) {
    logSendResult({
      emailType: userEmailType,
      to: input.email,
      subject: userSubject,
      accepted: [],
      rejected: [],
      error: error instanceof Error ? error.message : String(error)
    });
  }

  let adminAccepted: string[] = [];

  if (config.adminNotificationEmail) {
    try {
      const adminEmailResult = await transporter.sendMail(
        buildTransactionalMailOptions({
          config,
          to: config.adminNotificationEmail,
          subject: adminSubject,
          text: buildAdminRegistrationNotificationText(input),
          html: buildAdminRegistrationNotificationHtml(input)
        })
      );

      assertEmailAccepted(adminEmailResult, config.adminNotificationEmail, "Admin registration notification");

      logSendResult({
        emailType: adminEmailType,
        to: config.adminNotificationEmail,
        subject: adminSubject,
        accepted: normalizeRecipients(adminEmailResult.accepted),
        rejected: getRejectedRecipients(adminEmailResult)
      });
      adminAccepted = normalizeRecipients(adminEmailResult.accepted);
    } catch (error) {
      logSendResult({
        emailType: adminEmailType,
        to: config.adminNotificationEmail,
        subject: adminSubject,
        accepted: [],
        rejected: [],
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    skipped: false as const,
    adminAccepted,
    userAccepted
  };
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput) {
  const config = getGoogleMailConfig();
  const subject = "Reset your Helar password";
  const emailType = "password_reset";

  if (!config) {
    if (!hasLoggedMissingEmailConfig) {
      hasLoggedMissingEmailConfig = true;
      console.warn(
        "Email sending is not fully configured. Set MAIL_FROM_EMAIL, MAIL_HOST, MAIL_PORT, and MAIL_APP_PASSWORD for SMTP auth, or configure the Gmail OAuth fallback variables."
      );
    }

    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: [],
      rejected: [],
      skipped: true
    });

    return { skipped: true as const };
  }

  const transporter = createGoogleTransport(config);
  try {
    const userEmailResult = await transporter.sendMail(
      buildTransactionalMailOptions({
        config,
        to: input.email,
        subject,
        text: buildPasswordResetText(input),
        html: buildPasswordResetHtml(input)
      })
    );

    assertEmailAccepted(userEmailResult, input.email, "Password reset");

    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: normalizeRecipients(userEmailResult.accepted),
      rejected: getRejectedRecipients(userEmailResult)
    });

    return {
      skipped: false as const,
      userAccepted: normalizeRecipients(userEmailResult.accepted)
    };
  } catch (error) {
    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: [],
      rejected: [],
      error: error instanceof Error ? error.message : String(error)
    });
    return { skipped: false as const, error: true as const, userAccepted: [] };
  }
}

export async function sendContactEmail(input: ContactEmailInput) {
  const config = getGoogleMailConfig();
  const subject = `Helar contact: ${input.subject}`;
  const emailType = "contact_form";
  const recipient = process.env.CONTACT_TO_EMAIL?.trim() || "info@helar.law";

  if (!config) {
    if (!hasLoggedMissingEmailConfig) {
      hasLoggedMissingEmailConfig = true;
      console.warn(
        "Email sending is not fully configured. Set MAIL_FROM_EMAIL, MAIL_HOST, MAIL_PORT, and MAIL_APP_PASSWORD for SMTP auth, or configure the Gmail OAuth fallback variables."
      );
    }

    logSendResult({
      emailType,
      to: recipient,
      subject,
      accepted: [],
      rejected: [],
      skipped: true
    });

    return { skipped: true as const };
  }

  const transporter = createGoogleTransport(config);
  try {
    const mail = buildTransactionalMailOptions({
      config,
      to: recipient,
      subject,
      text: buildContactEmailText(input),
      html: buildContactEmailHtml(input)
    });
    const result = await transporter.sendMail({
      ...mail,
      replyTo: input.email
    });

    assertEmailAccepted(result, recipient, "Contact form");

    logSendResult({
      emailType,
      to: recipient,
      subject,
      accepted: normalizeRecipients(result.accepted),
      rejected: getRejectedRecipients(result)
    });

    return {
      skipped: false as const,
      accepted: normalizeRecipients(result.accepted)
    };
  } catch (error) {
    logSendResult({
      emailType,
      to: recipient,
      subject,
      accepted: [],
      rejected: [],
      error: error instanceof Error ? error.message : String(error)
    });
    return { skipped: false as const, error: true as const, accepted: [] };
  }
}

export async function sendSubscriptionActivationEmails(input: SubscriptionActivationEmailInput) {
  const config = getGoogleMailConfig();
  const subscriberSubject = "Your Helar subscription is active — thank you";
  const adminSubject = `New Helar subscription: ${input.planName} (${input.email})`;
  const subscriberEmailType = "subscription_activation_subscriber";
  const adminEmailType = "subscription_activation_admin";

  if (!config) {
    if (!hasLoggedMissingEmailConfig) {
      hasLoggedMissingEmailConfig = true;
      console.warn(
        "Email sending is not fully configured. Set MAIL_FROM_EMAIL, MAIL_HOST, MAIL_PORT, and MAIL_APP_PASSWORD for SMTP auth, or configure the Gmail OAuth fallback variables."
      );
    }

    logSendResult({
      emailType: subscriberEmailType,
      to: input.email,
      subject: subscriberSubject,
      accepted: [],
      rejected: [],
      skipped: true
    });

    return { skipped: true as const };
  }

  const transporter = createGoogleTransport(config);
  try {
    const subscriberResult = await transporter.sendMail(
      buildTransactionalMailOptions({
        config,
        to: input.email,
        subject: subscriberSubject,
        text: buildSubscriberSubscriptionText(input),
        html: buildSubscriberSubscriptionHtml(input)
      })
    );

    logSendResult({
      emailType: subscriberEmailType,
      to: input.email,
      subject: subscriberSubject,
      accepted: normalizeRecipients(subscriberResult.accepted),
      rejected: getRejectedRecipients(subscriberResult)
    });
  } catch (error) {
    logSendResult({
      emailType: subscriberEmailType,
      to: input.email,
      subject: subscriberSubject,
      accepted: [],
      rejected: [],
      error: error instanceof Error ? error.message : String(error)
    });
  }

  if (config.adminNotificationEmail) {
    try {
      const adminResult = await transporter.sendMail(
        buildTransactionalMailOptions({
          config,
          to: config.adminNotificationEmail,
          subject: adminSubject,
          text: buildAdminSubscriptionText(input),
          html: buildAdminSubscriptionHtml(input)
        })
      );

      logSendResult({
        emailType: adminEmailType,
        to: config.adminNotificationEmail,
        subject: adminSubject,
        accepted: normalizeRecipients(adminResult.accepted),
        rejected: getRejectedRecipients(adminResult)
      });
    } catch (error) {
      logSendResult({
        emailType: adminEmailType,
        to: config.adminNotificationEmail,
        subject: adminSubject,
        accepted: [],
        rejected: [],
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { skipped: false as const };
}

export async function sendWelcomeEmail(input: WelcomeEmailInput) {
  const config = getGoogleMailConfig();
  const firstName = input.fullName.trim().split(/\s+/)[0] ?? input.fullName.trim();
  const subject = `Welcome to Helar, ${firstName} 👋`;
  const emailType = "welcome";

  if (!config) {
    if (!hasLoggedMissingEmailConfig) {
      hasLoggedMissingEmailConfig = true;
      console.warn(
        "Email sending is not fully configured. Set MAIL_FROM_EMAIL, MAIL_HOST, MAIL_PORT, and MAIL_APP_PASSWORD for SMTP auth, or configure the Gmail OAuth fallback variables."
      );
    }

    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: [],
      rejected: [],
      skipped: true
    });

    return { skipped: true as const };
  }

  const transporter = createGoogleTransport(config);
  try {
    const result = await transporter.sendMail(
      buildTransactionalMailOptions({
        config,
        to: input.email,
        subject,
        text: buildWelcomeEmailText(input),
        html: buildWelcomeEmailHtml(input)
      })
    );

    assertEmailAccepted(result, input.email, "Welcome");

    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: normalizeRecipients(result.accepted),
      rejected: getRejectedRecipients(result)
    });

    return {
      skipped: false as const,
      userAccepted: normalizeRecipients(result.accepted)
    };
  } catch (error) {
    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: [],
      rejected: [],
      error: error instanceof Error ? error.message : String(error)
    });
    return { skipped: false as const, error: true as const, userAccepted: [] };
  }
}

export async function sendSubscriptionExpiringSoonEmail(input: SubscriptionExpiringSoonEmailInput) {
  const config = getGoogleMailConfig();
  const subject = getExpiringSoonSubject(input.daysRemaining);
  const emailType = "subscription_expiring_soon";

  if (!config) {
    if (!hasLoggedMissingEmailConfig) {
      hasLoggedMissingEmailConfig = true;
      console.warn(
        "Email sending is not fully configured. Set MAIL_FROM_EMAIL, MAIL_HOST, MAIL_PORT, and MAIL_APP_PASSWORD for SMTP auth, or configure the Gmail OAuth fallback variables."
      );
    }

    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: [],
      rejected: [],
      skipped: true
    });

    return { skipped: true as const };
  }

  const transporter = createGoogleTransport(config);
  try {
    const result = await transporter.sendMail(
      buildTransactionalMailOptions({
        config,
        to: input.email,
        subject,
        text: buildSubscriptionExpiringSoonText(input),
        html: buildSubscriptionExpiringSoonHtml(input)
      })
    );

    assertEmailAccepted(result, input.email, "Subscription expiring soon");

    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: normalizeRecipients(result.accepted),
      rejected: getRejectedRecipients(result)
    });

    return {
      skipped: false as const,
      userAccepted: normalizeRecipients(result.accepted)
    };
  } catch (error) {
    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: [],
      rejected: [],
      error: error instanceof Error ? error.message : String(error)
    });
    return { skipped: false as const, error: true as const, userAccepted: [] };
  }
}

export async function sendSubscriptionExpiredEmail(input: SubscriptionExpiredEmailInput) {
  const config = getGoogleMailConfig();
  const subject = getExpiredSubject();
  const emailType = "subscription_expired";

  if (!config) {
    if (!hasLoggedMissingEmailConfig) {
      hasLoggedMissingEmailConfig = true;
      console.warn(
        "Email sending is not fully configured. Set MAIL_FROM_EMAIL, MAIL_HOST, MAIL_PORT, and MAIL_APP_PASSWORD for SMTP auth, or configure the Gmail OAuth fallback variables."
      );
    }

    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: [],
      rejected: [],
      skipped: true
    });

    return { skipped: true as const };
  }

  const transporter = createGoogleTransport(config);
  try {
    const result = await transporter.sendMail(
      buildTransactionalMailOptions({
        config,
        to: input.email,
        subject,
        text: buildSubscriptionExpiredText(input),
        html: buildSubscriptionExpiredHtml(input)
      })
    );

    assertEmailAccepted(result, input.email, "Subscription expired");

    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: normalizeRecipients(result.accepted),
      rejected: getRejectedRecipients(result)
    });

    return {
      skipped: false as const,
      userAccepted: normalizeRecipients(result.accepted)
    };
  } catch (error) {
    logSendResult({
      emailType,
      to: input.email,
      subject,
      accepted: [],
      rejected: [],
      error: error instanceof Error ? error.message : String(error)
    });
    return { skipped: false as const, error: true as const, userAccepted: [] };
  }
}
