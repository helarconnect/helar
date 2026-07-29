import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { AxiosError } from "axios";

import {
  fetchSubscriptionPlans,
  fetchSubscriptionSnapshot,
  initializeSubscriptionCheckout,
  type SubscriptionPlan,
  verifySubscriptionPayment
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";

type ToastTone = "error" | "success";

function getPlanDurationSuffix(plan: SubscriptionPlan) {
  if (plan.code === "annual") {
    return "/1 year";
  }

  if (plan.code === "six_months") {
    return "/6 months";
  }

  return "/month";
}

function getPlanCheckoutLabel(plan: SubscriptionPlan) {
  if (plan.code === "annual") {
    return "One Year";
  }

  if (plan.code === "six_months") {
    return "6 Months";
  }

  return "Monthly";
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatExpiryCountdown(daysUntilExpiry: number | null) {
  if (daysUntilExpiry === null) {
    return "No active countdown";
  }

  if (daysUntilExpiry <= 0) {
    return "Expires today";
  }

  if (daysUntilExpiry === 1) {
    return "1 day left";
  }

  return `${daysUntilExpiry} days left`;
}

function ToastViewport({
  isDark,
  onDismiss,
  toasts
}: {
  isDark: boolean;
  onDismiss: (id: number) => void;
  toasts: Array<{ id: number; message: string; tone: ToastTone }>;
}) {
  if (!toasts.length || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[999] flex justify-end px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          <div
            className={cn(
              "pointer-events-auto rounded-[22px] border px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)]",
              toast.tone === "success"
                ? isDark
                  ? "border-emerald-500/30 bg-slate-950/95 text-emerald-100"
                  : "border-emerald-200 bg-white text-emerald-800"
                : isDark
                  ? "border-rose-500/30 bg-slate-950/95 text-rose-100"
                  : "border-rose-200 bg-white text-rose-800"
            )}
            key={toast.id}
            role="status"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium leading-6">{toast.message}</p>
              <button
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
                  isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"
                )}
                onClick={() => onDismiss(toast.id)}
                type="button"
              >
                <span className="sr-only">Dismiss</span>
                <AlertCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}

function SubscriptionPlanCard({
  busy,
  isDark,
  isSelected,
  onSelect,
  plan
}: {
  busy: boolean;
  isDark: boolean;
  isSelected: boolean;
  onSelect: (plan: SubscriptionPlan) => void;
  plan: SubscriptionPlan;
}) {
  return (
    <article
      className={cn(
        "rounded-[28px] border p-6 shadow-[0_18px_48px_rgba(17,16,13,0.1)] transition",
        isSelected
          ? isDark
            ? "border-amber-400/60 bg-slate-900"
            : "border-[rgba(182,140,71,0.5)] bg-[rgba(255,253,247,0.98)]"
          : isDark
            ? "border-slate-800 bg-slate-950"
            : "border-[rgba(182,140,71,0.18)] bg-[rgba(255,253,247,0.92)]"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-[color:var(--color-accent)]">{plan.name}</p>
          <div className="mt-3 flex items-end gap-2">
            <span className={cn("font-heading text-4xl leading-none", isDark ? "text-white" : "text-slate-950")}>
              {plan.formattedPrice}
            </span>
            <span className={cn("pb-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{getPlanDurationSuffix(plan)}</span>
          </div>
        </div>
        {plan.label ? (
          <span className="rounded-full border border-[rgba(182,140,71,0.26)] bg-[rgba(182,140,71,0.12)] px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)]">
            {plan.label}
          </span>
        ) : null}
      </div>

      <p className={cn("mt-4 text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>{plan.description}</p>

      <ul className={cn("mt-6 space-y-3 text-sm", isDark ? "text-slate-200" : "text-slate-700")}>
        {plan.featureHighlights.map((feature) => (
          <li className="flex items-start gap-3" key={feature}>
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        className={cn(
          "mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
          busy
            ? "cursor-wait bg-slate-300 text-slate-500"
            : isSelected
              ? "bg-[color:var(--color-accent)] text-[#16120d] hover:brightness-95"
              : isDark
                ? "bg-slate-800 text-white hover:bg-slate-700"
                : "bg-slate-900 text-white hover:bg-slate-800"
        )}
        disabled={busy}
        onClick={() => onSelect(plan)}
        type="button"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        {busy ? "Redirecting to Paystack..." : `Pay with Paystack - ${getPlanCheckoutLabel(plan)}`}
      </button>
    </article>
  );
}

export function SubscriptionPage() {
  const { isDark } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: ToastTone }>>([]);
  const verificationStartedRef = useRef<string | null>(null);

  const plansQuery = useQuery({
    queryKey: queryKeys.subscriptionPlans,
    queryFn: fetchSubscriptionPlans
  });

  const snapshotQuery = useQuery({
    queryKey: queryKeys.subscriptionSnapshot,
    queryFn: fetchSubscriptionSnapshot
  });

  const selectedPlanParam = searchParams.get("plan");
  const selectedPlanCode =
    selectedPlanParam === "annual" || selectedPlanParam === "six_months" || selectedPlanParam === "monthly"
      ? selectedPlanParam
      : "monthly";
  const reference = searchParams.get("reference") ?? searchParams.get("trxref") ?? "";

  const selectedPlan = useMemo(
    () => plansQuery.data?.find((plan) => plan.code === selectedPlanCode) ?? plansQuery.data?.[0] ?? null,
    [plansQuery.data, selectedPlanCode]
  );

  function showToast(message: string, tone: ToastTone) {
    const id = Date.now() + Math.floor(Math.random() * 1000);

    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, tone === "success" ? 6000 : 8000);
  }

  const checkoutMutation = useMutation({
    mutationFn: (planCode: "monthly" | "six_months" | "annual") =>
      initializeSubscriptionCheckout({
        planCode,
        returnUrl: `${window.location.origin}/app/subscription?plan=${planCode}`
      }),
    onSuccess: (data) => {
      window.location.assign(data.authorizationUrl);
    },
    onError: (error) => {
      const message =
        error instanceof AxiosError
          ? error.response?.data?.error?.message ?? "Could not start the Paystack checkout right now."
          : "Could not start the Paystack checkout right now.";

      showToast(message, "error");
    }
  });

  const verifyMutation = useMutation({
    mutationFn: (nextReference: string) => verifySubscriptionPayment(nextReference),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.subscriptionPlans }),
        queryClient.invalidateQueries({ queryKey: queryKeys.subscriptionSnapshot })
      ]);

      showToast(
        `Payment verified successfully. Your ${data.subscription.plan.name.toLowerCase()} is now active.`,
        "success"
      );

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("reference");
      nextParams.delete("trxref");
      setSearchParams(nextParams, { replace: true });
    },
    onError: (error) => {
      const message =
        error instanceof AxiosError
          ? error.response?.data?.error?.message ?? "Could not verify the Paystack payment right now."
          : "Could not verify the Paystack payment right now.";

      showToast(message, "error");
    }
  });

  useEffect(() => {
    if (!reference || verificationStartedRef.current === reference) {
      return;
    }

    // Guard against React Strict Mode double-invoking the verification call.
    verificationStartedRef.current = reference;
    verifyMutation.mutate(reference);
  }, [reference, verifyMutation]);

  const activePlanLabel = snapshotQuery.data?.activeSubscription?.plan.name ?? "No active subscription yet";
  const activeSubscription = snapshotQuery.data?.activeSubscription ?? null;

  return (
    <div className="section-shell space-y-8 pb-16 pt-8">
      <ToastViewport isDark={isDark} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} toasts={toasts} />

      <section
        className={cn(
          "rounded-[32px] border p-8 shadow-[0_30px_90px_rgba(15,23,42,0.08)]",
          isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <p className={cn("text-xs uppercase tracking-[0.24em]", isDark ? "text-slate-500" : "text-slate-400")}>
              Paystack subscription billing
            </p>
            <h1 className={cn("mt-3 font-heading text-4xl leading-tight", isDark ? "text-white" : "text-slate-950")}>
              Activate monthly, 6-month, or 1-year premium access.
            </h1>
            <p className={cn("mt-4 max-w-2xl text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>
              Pay securely with Paystack in naira. Choose NGN 2,000 monthly, NGN 11,000 for 6 months, or NGN 22,000 for 1 year, with access on up to 3 devices.
            </p>
          </div>

          <div
            className={cn(
              "min-w-[260px] rounded-[24px] border p-5",
              isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"
            )}
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className={cn("h-10 w-10", isDark ? "text-emerald-300" : "text-emerald-600")} />
              <div>
                <p className={cn("text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>
                  Current plan
                </p>
                <p className={cn("mt-2 text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>{activePlanLabel}</p>
              </div>
            </div>
            <p className={cn("mt-4 text-sm", isDark ? "text-slate-300" : "text-slate-600")}>
              {activeSubscription
                ? `Access ends ${formatDate(activeSubscription.endsAt)}`
                : "Choose a plan below to start premium access."}
            </p>
            {activeSubscription ? (
              <p className={cn("mt-2 text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>
                {formatExpiryCountdown(activeSubscription.daysUntilExpiry)}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {activeSubscription?.shouldShowExpiryReminder ? (
        <section
          className={cn(
            "rounded-[28px] border px-6 py-5 shadow-[0_18px_48px_rgba(17,16,13,0.08)]",
            isDark ? "border-amber-500/25 bg-amber-500/10" : "border-amber-200 bg-amber-50"
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <AlertCircle className={cn("h-5 w-5", isDark ? "text-amber-200" : "text-amber-700")} />
                <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-amber-100/80" : "text-amber-700")}>
                  Renewal reminder
                </p>
              </div>
              <h2 className={cn("mt-3 text-xl font-semibold", isDark ? "text-white" : "text-slate-950")}>
                {activeSubscription.expiryReminderMessage}
              </h2>
              <p className={cn("mt-2 text-sm", isDark ? "text-slate-200" : "text-slate-700")}>
                Your {activeSubscription.plan.name.toLowerCase()} is already counting down from the day payment is verified.
              </p>
            </div>
            <div className={cn("rounded-2xl border px-4 py-3 text-sm font-semibold", isDark ? "border-amber-400/20 bg-slate-950/40 text-amber-100" : "border-amber-200 bg-white text-amber-800")}>
              {formatExpiryCountdown(activeSubscription.daysUntilExpiry)}
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        {plansQuery.data?.map((plan) => (
          <SubscriptionPlanCard
            busy={checkoutMutation.isPending && checkoutMutation.variables === plan.code}
            isDark={isDark}
            isSelected={selectedPlan?.code === plan.code}
            key={plan.code}
            onSelect={(nextPlan) => {
              const nextParams = new URLSearchParams(searchParams);
              nextParams.set("plan", nextPlan.code);
              setSearchParams(nextParams, { replace: true });
              checkoutMutation.mutate(nextPlan.code);
            }}
            plan={plan}
          />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <article
          className={cn(
            "rounded-[28px] border p-6 shadow-[0_18px_48px_rgba(17,16,13,0.08)]",
            isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
          )}
        >
          <div className="flex items-center gap-3">
            <CreditCard className={cn("h-5 w-5", isDark ? "text-slate-300" : "text-slate-700")} />
            <h2 className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>Recent payments</h2>
          </div>

          <div className="mt-6 space-y-3">
            {snapshotQuery.isLoading ? (
              <div className={cn("rounded-2xl border px-4 py-4 text-sm", isDark ? "border-slate-800 text-slate-300" : "border-slate-200 text-slate-600")}>
                Loading your subscription history...
              </div>
            ) : snapshotQuery.data?.recentPayments.length ? (
              snapshotQuery.data.recentPayments.map((payment) => (
                <div
                  className={cn(
                    "rounded-[22px] border px-4 py-4",
                    isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"
                  )}
                  key={payment.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>
                        {payment.plan?.name ?? "Subscription payment"}
                      </p>
                      <p className={cn("mt-1 text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>
                        {payment.provider} • {payment.status}
                      </p>
                    </div>
                    <p className={cn("text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{payment.formattedAmount}</p>
                  </div>
                  <p className={cn("mt-3 text-sm", isDark ? "text-slate-300" : "text-slate-600")}>
                    Paid or attempted on {formatDate(payment.createdAt)}
                  </p>
                  {payment.reference ? (
                    <p className={cn("mt-1 break-all text-xs", isDark ? "text-slate-500" : "text-slate-400")}>
                      Reference: {payment.reference}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <div className={cn("rounded-2xl border px-4 py-4 text-sm", isDark ? "border-slate-800 text-slate-300" : "border-slate-200 text-slate-600")}>
                No subscription payments have been recorded for this account yet.
              </div>
            )}
          </div>
        </article>

        <article
          className={cn(
            "rounded-[28px] border p-6 shadow-[0_18px_48px_rgba(17,16,13,0.08)]",
            isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
          )}
        >
          <h2 className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-950")}>Billing notes</h2>
          <div className={cn("mt-5 space-y-4 text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>
            <p>The monthly package is billed at <strong>NGN 2,000</strong>.</p>
            <p>The 6-month package is billed at <strong>NGN 11,000</strong>, reflecting a <strong>NGN 1,000 discount</strong>.</p>
            <p>The 1-year package is billed at <strong>NGN 22,000</strong>, reflecting a <strong>NGN 2,000 discount</strong>.</p>
            <p>Each subscription can be used on a maximum of <strong>3 devices</strong>.</p>
            <p>After a successful Paystack payment, Helar verifies the transaction on the server before activating your subscription.</p>
            <p>
              Need to compare options first?{" "}
              <Link className="font-medium text-[color:var(--color-accent)] underline-offset-4 hover:underline" to="/pricing">
                Return to pricing
              </Link>
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}
