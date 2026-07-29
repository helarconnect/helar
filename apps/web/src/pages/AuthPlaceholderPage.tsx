import { AxiosError } from "axios";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { signInDemo, signUpDemo } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

const baseAuthSchema = z.object({
  fullName: z.string().trim().max(80, "Full name is too long.").optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password is too long."),
  confirmPassword: z.string().optional(),
  registrationRole: z.enum(["student", "lawyer"]).optional(),
}).strict();

const signInSchema = baseAuthSchema;

const signUpSchema = baseAuthSchema.superRefine((values, context) => {
  if (!values.fullName || values.fullName.trim().length < 2) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter your full name.",
      path: ["fullName"],
    });
  }

  if (!values.confirmPassword) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Confirm your password.",
      path: ["confirmPassword"],
    });
  }

  if (values.confirmPassword && values.password !== values.confirmPassword) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Passwords do not match.",
      path: ["confirmPassword"],
    });
  }
});

type AuthFormValues = z.infer<typeof baseAuthSchema>;

type AuthPlaceholderPageProps = {
  mode: "sign-in" | "sign-up";
};

const authHighlights = [
  "Strict input validation protects sign-in and registration payloads.",
  "Rate-limited auth requests make brute-force abuse much harder.",
  "Structured account creation keeps profile and session data cleaner."
];

export function AuthPlaceholderPage({ mode }: AuthPlaceholderPageProps) {
  const isSignIn = mode === "sign-in";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setSession = useAuthStore((state) => state.setSession);

  const form = useForm<AuthFormValues>({
    resolver: zodResolver(isSignIn ? signInSchema : signUpSchema),
    defaultValues: isSignIn
      ? {
          email: "",
          password: "",
          fullName: "",
          confirmPassword: ""
        }
      : {
          email: "",
          password: "",
          fullName: "",
          confirmPassword: "",
          registrationRole: "student"
        }
  });

  const authMutation = useMutation({
    mutationFn: async (values: AuthFormValues) => {
      if (isSignIn) {
        return signInDemo({
          email: values.email,
          password: values.password
        });
      }

      return signUpDemo({
        fullName: values.fullName ?? "",
        email: values.email,
        password: values.password,
        confirmPassword: values.confirmPassword ?? "",
        registrationRole: values.registrationRole ?? "student"
      });
    },
    onSuccess: (response) => {
      const redirectTarget = searchParams.get("redirect");
      const intent = searchParams.get("intent");
      const safeRedirectTarget = redirectTarget?.startsWith("/") ? redirectTarget : "/app/dashboard";
      const shouldAppendIntent = intent && safeRedirectTarget.startsWith("/connect") && !safeRedirectTarget.includes("intent=");
      const destination =
        shouldAppendIntent
          ? `${safeRedirectTarget}${safeRedirectTarget.includes("?") ? "&" : "?"}intent=${encodeURIComponent(intent)}`
          : safeRedirectTarget;

      setSession(response.data);
      navigate(destination, { replace: true });
    }
  });

  const title = isSignIn ? "Enter the Helar workspace" : "Create your Helar account";
  const subtitle = isSignIn
    ? "A more secure sign-in flow for serious legal learning."
    : "Register with a stronger account structure and validated credentials.";
  const visibleHighlights = isSignIn ? authHighlights.slice(0, 2) : authHighlights;

  function handleAuthSubmit(values: AuthFormValues) {
    authMutation.mutate(values);
  }

  const selectedRegistrationRole = form.watch("registrationRole") ?? "student";

  const authErrorMessage =
    authMutation.error instanceof AxiosError
      ? authMutation.error.response?.data?.error?.message ?? "We could not complete this request right now."
      : "We could not complete this request right now.";

  return (
    <div className="auth-cosmos">
      <div className="auth-orb auth-orb-primary" />
      <div className="auth-orb auth-orb-secondary" />
      <div className="auth-grid" />

      <div className="auth-shell">
        <section className={isSignIn ? "auth-panel auth-panel-compact" : "auth-panel"}>
          <div className="auth-copy">
            <span className="auth-pill">
              <Sparkles className="h-4 w-4" />
              {isSignIn ? "Secure access" : "Protected registration"}
            </span>

            <h1>{title}</h1>
            <p className="auth-lead">{subtitle}</p>

            {isSignIn ? null : (
              <div className="auth-kpis">
                <article className="auth-kpi-card">
                  <p className="auth-kpi-value">2</p>
                  <p className="auth-kpi-label">account types</p>
                </article>
                <article className="auth-kpi-card">
                  <p className="auth-kpi-value">Zod</p>
                  <p className="auth-kpi-label">validated request schemas</p>
                </article>
                <article className="auth-kpi-card">
                  <p className="auth-kpi-value">60s</p>
                  <p className="auth-kpi-label">windowed auth throttling</p>
                </article>
              </div>
            )}

            <div className="auth-feature-list">
              {visibleHighlights.map((item) => (
                <div className="auth-feature-row" key={item}>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="auth-trust-strip">
              <div className="auth-trust-item">
                <ShieldCheck className="h-4 w-4" />
                <span>Encrypted sessions</span>
              </div>
              {isSignIn ? null : (
                <div className="auth-trust-item">
                  <LockKeyhole className="h-4 w-4" />
                  <span>Password confirmation required</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className={isSignIn ? "auth-card auth-card-compact" : "auth-card"}>
          <div className="auth-card-header">
            <div>
              <p className="auth-card-eyebrow">{isSignIn ? "Sign in" : "Create account"}</p>
              <h2>{isSignIn ? "Welcome back" : "Start securely"}</h2>
            </div>
            <Link className="auth-inline-link" to="/">
              Back to home
            </Link>
          </div>

          <form className="auth-form" onSubmit={form.handleSubmit(handleAuthSubmit)}>
            {!isSignIn ? (
              <div className="auth-field">
                <label htmlFor="fullName">Full name</label>
                <input className="auth-input" id="fullName" type="text" {...form.register("fullName")} />
                <p className="auth-error">{form.formState.errors.fullName?.message}</p>
              </div>
            ) : null}

            {!isSignIn ? (
              <div className="auth-field">
                <label>I am registering as</label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      description: "Best for legal learners using Helar for study and exam preparation.",
                      label: "Student",
                      value: "student"
                    },
                    {
                      description: "Best for practicing lawyers using Helar for professional reading and revision.",
                      label: "Lawyer",
                      value: "lawyer"
                    }
                  ].map((option) => (
                    <label
                      className={`cursor-pointer rounded-[24px] border px-4 py-4 transition ${
                        selectedRegistrationRole === option.value
                          ? "border-[rgba(255,109,77,0.85)] bg-[rgba(255,109,77,0.14)] text-white shadow-[0_16px_36px_rgba(255,109,77,0.18)]"
                          : "border-white/10 bg-white/[0.03] text-slate-200 hover:border-white/20 hover:bg-white/[0.05]"
                      }`}
                      key={option.value}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        value={option.value}
                        {...form.register("registrationRole")}
                      />
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="mt-2 block text-xs leading-6 text-slate-300">{option.description}</span>
                    </label>
                  ))}
                </div>
                <p className="auth-error">{form.formState.errors.registrationRole?.message}</p>
              </div>
            ) : null}

            <div className="auth-field">
              <label htmlFor="email">Email</label>
              <input className="auth-input" id="email" type="email" {...form.register("email")} />
              <p className="auth-error">{form.formState.errors.email?.message}</p>
            </div>

            <div className="auth-field">
              <div className="auth-label-row">
                <label htmlFor="password">Password</label>
                {isSignIn ? (
                  <Link className="auth-inline-link" to="/auth/forgot-password">
                    Forgot password?
                  </Link>
                ) : (
                  <span className="text-xs text-slate-400">Use at least 8 characters</span>
                )}
              </div>
              <input className="auth-input" id="password" type="password" {...form.register("password")} />
              <p className="auth-error">{form.formState.errors.password?.message}</p>
            </div>

            {!isSignIn ? (
              <div className="auth-field">
                <label htmlFor="confirmPassword">Confirm password</label>
                <input className="auth-input" id="confirmPassword" type="password" {...form.register("confirmPassword")} />
                <p className="auth-error">{form.formState.errors.confirmPassword?.message}</p>
              </div>
            ) : null}

            <button className="auth-primary-button" disabled={authMutation.isPending} type="submit">
              {authMutation.isPending
                ? isSignIn
                  ? "Signing in..."
                  : "Creating account..."
                : isSignIn
                  ? "Sign in to workspace"
                  : "Create secure account"}
              <ArrowRight className="h-4 w-4" />
            </button>

            {authMutation.isError ? (
              <div className="auth-status-card">
                <p>{authErrorMessage}</p>
              </div>
            ) : null}

            {authMutation.isSuccess ? (
              <div className="auth-status-card">
                <p>{isSignIn ? "Signed in successfully. Redirecting you now." : "Account created successfully. Redirecting you now."}</p>
              </div>
            ) : null}

            <p className="auth-switch-copy">
              {isSignIn ? "New to Helar?" : "Already have an account?"}{" "}
              <Link className="auth-inline-link" to={isSignIn ? "/auth/sign-up" : "/auth/sign-in"}>
                {isSignIn ? "Create an account" : "Sign in here"}
              </Link>
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
