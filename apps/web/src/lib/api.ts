import { authenticatedHttp, publicHttp } from "@/lib/http";

export type PlatformMetric = {
  label: string;
  value: string;
  trend: string;
};

export type FeaturedCourse = {
  id: string;
  title: string;
  category: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  duration: string;
  learners: number;
};

export type PlatformOverview = {
  product: string;
  headline: string;
  highlights: string[];
  metrics: PlatformMetric[];
  featuredCourses: FeaturedCourse[];
};

export type DemoSignInResponse = {
  success: true;
  data: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: {
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
  };
  meta?: {
    verificationEmailStatus?: "sent" | "skipped" | "failed";
  };
};

export type DemoAuthPayload = {
  email: string;
  password: string;
};

export type DemoSignUpPayload = DemoAuthPayload & {
  fullName: string;
  confirmPassword: string;
  registrationRole: "student" | "lawyer";
};

export type ForgotPasswordResponse = {
  success: true;
  data: {
    message: string;
  };
};

export type DemoProfilePayload = {
  fullName: string;
  phoneNumber?: string;
  avatarUrl?: string;
  sex?: "MALE" | "FEMALE" | "";
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  institutionState?: string;
  institutionName?: string;
  institutionOtherName?: string;
  postalCode?: string;
  country?: string;
};

export type DemoProfileResponse = {
  success: true;
  data: {
    user: Partial<DemoSignInResponse["data"]["user"]> & DemoProfilePayload;
  };
};

export type ActionMessageResponse = {
  success: true;
  data: {
    message: string;
  };
};

export type SubscriptionPlan = {
  code: "monthly" | "six_months" | "annual";
  currency: string;
  description: string;
  featureHighlights: string[];
  formattedPrice: string;
  interval: "MONTHLY" | "ANNUAL";
  label: string | null;
  name: string;
  priceMinor: number;
};

export type SubscriptionPaymentSummary = {
  amountMinor: number;
  createdAt: string;
  currency: string;
  formattedAmount: string;
  id: string;
  plan: SubscriptionPlan | null;
  provider: string;
  reference: string | null;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
};

export type ActiveSubscriptionSummary = {
  autoRenew: boolean;
  createdAt: string;
  daysUntilExpiry: number | null;
  endsAt: string | null;
  expiryReminderMessage: string | null;
  id: string;
  isExpired: boolean;
  isExpiringSoon: boolean;
  plan: SubscriptionPlan;
  shouldShowExpiryReminder: boolean;
  startsAt: string;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
};

export type SubscriptionSnapshot = {
  activeSubscription: ActiveSubscriptionSummary | null;
  recentPayments: SubscriptionPaymentSummary[];
};

export type SubscriptionCheckoutResponse = {
  authorizationUrl: string;
  plan: SubscriptionPlan;
  reference: string;
};

export type SubscriptionVerificationResponse = {
  payment: SubscriptionPaymentSummary;
  snapshot: SubscriptionSnapshot;
  subscription: ActiveSubscriptionSummary;
};

const DEVICE_ID_STORAGE_KEY = "helar-device-id";

function getBrowserLabel(userAgent: string) {
  if (/edg/i.test(userAgent)) {
    return "Edge";
  }

  if (/chrome|crios/i.test(userAgent)) {
    return "Chrome";
  }

  if (/firefox|fxios/i.test(userAgent)) {
    return "Firefox";
  }

  if (/safari/i.test(userAgent) && !/chrome|crios|edg/i.test(userAgent)) {
    return "Safari";
  }

  return "Browser";
}

function getPlatformLabel(userAgent: string) {
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return "iPhone";
  }

  if (/android/i.test(userAgent)) {
    return "Android";
  }

  if (/mac os x|macintosh/i.test(userAgent)) {
    return "Mac";
  }

  if (/windows/i.test(userAgent)) {
    return "Windows";
  }

  if (/linux/i.test(userAgent)) {
    return "Linux";
  }

  return "Device";
}

function getStableDeviceName() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const userAgent = window.navigator.userAgent ?? "";
  const browserLabel = getBrowserLabel(userAgent);
  const platformLabel = getPlatformLabel(userAgent);

  // Keep one identifier per browser install so returning users reuse the same device slot.
  let deviceId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);

  if (!deviceId) {
    deviceId =
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  }

  return `${browserLabel} on ${platformLabel} • ${deviceId.slice(0, 8)}`.slice(0, 120);
}

const fallbackOverview: PlatformOverview = {
  product: "Helar",
  headline: "A premium legal learning platform built for institutions and modern practitioners.",
  highlights: [
    "Deliver legal education with enterprise-grade subscriptions, analytics, and governance.",
    "Combine digital reading, courses, assignments, community, and CBT assessment in one workspace.",
    "Scale across web and mobile with shared infrastructure and role-aware user journeys."
  ],
  metrics: [
    { label: "Practice areas", value: "12", trend: "+3 this quarter" },
    { label: "Live cohorts", value: "48", trend: "+11%" },
    { label: "Average score", value: "84%", trend: "+6.2%" },
    { label: "Certificates issued", value: "9.4k", trend: "+21.7%" }
  ],
  featuredCourses: [
    {
      id: "criminal-law-101",
      title: "Criminal Litigation Strategy",
      category: "Criminal Law",
      level: "Advanced",
      duration: "8 weeks",
      learners: 2480
    },
    {
      id: "corporate-law-201",
      title: "Corporate Governance for Counsel",
      category: "Corporate Law",
      level: "Intermediate",
      duration: "6 weeks",
      learners: 1934
    },
    {
      id: "drafting-101",
      title: "Legal Drafting and Opinion Writing",
      category: "Legal Drafting",
      level: "Beginner",
      duration: "5 weeks",
      learners: 3122
    }
  ]
};

export async function fetchPlatformOverview(): Promise<PlatformOverview> {
  try {
    const response = await publicHttp.get<{ success: true; data: PlatformOverview }>(
      "/api/v1/catalog/overview"
    );

    return response.data.data;
  } catch {
    return fallbackOverview;
  }
}

export async function signInDemo(payload: {
  email: string;
  password: string;
  deviceName?: string;
}): Promise<DemoSignInResponse> {
  const response = await publicHttp.post<DemoSignInResponse>("/api/v1/auth/demo-sign-in", {
    ...payload,
    deviceName: payload.deviceName ?? getStableDeviceName()
  });
  return response.data;
}

export async function signUpDemo(payload: DemoSignUpPayload): Promise<DemoSignInResponse> {
  const response = await publicHttp.post<DemoSignInResponse>("/api/v1/auth/register", {
    ...payload,
    deviceName: getStableDeviceName()
  });
  return response.data;
}

export async function requestPasswordReset(payload: { email: string }): Promise<ForgotPasswordResponse> {
  const response = await publicHttp.post<ForgotPasswordResponse>("/api/v1/auth/forgot-password", payload);
  return response.data;
}

export async function resetPassword(payload: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<ForgotPasswordResponse> {
  const response = await publicHttp.post<ForgotPasswordResponse>("/api/v1/auth/reset-password", payload);
  return response.data;
}

export type ContactMessagePayload = {
  fullName: string;
  email: string;
  subject: string;
  message: string;
};

export async function submitContactMessage(payload: ContactMessagePayload): Promise<ActionMessageResponse> {
  const response = await publicHttp.post<ActionMessageResponse>("/api/v1/contact", payload);
  return response.data;
}

export async function updateProfileDemo(payload: DemoProfilePayload): Promise<DemoProfileResponse> {
  const response = await authenticatedHttp.patch<DemoProfileResponse>("/api/v1/users/me", payload);
  return response.data;
}

export async function updateMyPassword(payload: {
  currentPassword: string;
  password: string;
  confirmPassword: string;
}): Promise<ActionMessageResponse> {
  const response = await authenticatedHttp.patch<ActionMessageResponse>("/api/v1/users/me/password", payload);
  return response.data;
}

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const response = await publicHttp.get<{ success: true; data: SubscriptionPlan[] }>("/api/v1/subscription/plans");
  return response.data.data;
}

export async function fetchSubscriptionSnapshot(): Promise<SubscriptionSnapshot> {
  const response = await authenticatedHttp.get<{ success: true; data: SubscriptionSnapshot }>("/api/v1/subscriptions/me");
  return response.data.data;
}

export async function initializeSubscriptionCheckout(payload: {
  planCode: "monthly" | "six_months" | "annual";
  returnUrl: string;
}): Promise<SubscriptionCheckoutResponse> {
  const response = await authenticatedHttp.post<{ success: true; data: SubscriptionCheckoutResponse }>(
    "/api/v1/subscriptions/checkout",
    payload
  );

  return response.data.data;
}

export async function verifySubscriptionPayment(reference: string): Promise<SubscriptionVerificationResponse> {
  const response = await authenticatedHttp.post<{ success: true; data: SubscriptionVerificationResponse }>(
    "/api/v1/subscriptions/verify",
    { reference }
  );

  return response.data.data;
}
