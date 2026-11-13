import { AxiosError } from "axios";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { requestPasswordReset, resetPassword } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

const forgotPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address.")
  })
  .strict();

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters.").refine((value) => new TextEncoder().encode(value).length <= 72, "Password must be at most 72 bytes."),
    confirmPassword: z.string()
  })
  .strict()
  .superRefine((values, context) => {
    if (!values.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirm your password.",
        path: ["confirmPassword"]
      });
    }

    if (values.confirmPassword && values.password !== values.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"]
      });
    }
  });

type PasswordRecoveryPageProps = {
  mode: "forgot-password" | "reset-password";
};

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export function PasswordRecoveryPage({ mode }: PasswordRecoveryPageProps) {
  const clearSession = useAuthStore((state) => state.clearSession);
  const isForgotPassword = mode === "forgot-password";
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token")?.trim() ?? "";

  const forgotForm = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: ""
    }
  });

  const resetForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: ""
    }
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: requestPasswordReset
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (values: ResetPasswordFormValues) =>
      resetPassword({
        token: resetToken,
        password: values.password,
        confirmPassword: values.confirmPassword
      }),
    onSuccess: () => {
      clearSession();
      resetForm.reset();
    }
  });

  const activeError =
    (isForgotPassword ? forgotPasswordMutation.error : resetPasswordMutation.error) instanceof AxiosError
      ? ((isForgotPassword ? forgotPasswordMutation.error : resetPasswordMutation.error) as AxiosError<{ error?: { message?: string } }>).response?.data?.error?.message ??
        "We could not complete this request right now."
      : "We could not complete this request right now.";

  return (
    <div className="auth-cosmos">
      <div className="auth-orb auth-orb-primary" />
      <div className="auth-orb auth-orb-secondary" />
      <div className="auth-grid" />

      <div className="auth-shell">
        <section className="auth-panel auth-panel-compact">
          <div className="auth-copy">
            <span className="auth-pill">
              {isForgotPassword ? <Mail className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
              {isForgotPassword ? "Password recovery" : "Set new password"}
            </span>

            <h1>{isForgotPassword ? "Reset your Helar password" : "Choose a new password"}</h1>
            <p className="auth-lead">
              {isForgotPassword
                ? "Enter your email address and we will send you a secure reset link."
                : "Create a new password for your Helar account using the secure link from your email."}
            </p>

            <div className="auth-feature-list">
              {[
                isForgotPassword
                  ? "A secure reset link is sent to the registered email address."
                  : "Your reset link is time-limited for security.",
                "After a reset, existing sessions will need to sign in again when their access expires.",
                "Use at least 8 characters for your new password."
              ].map((item) => (
                <div className="auth-feature-row" key={item}>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="auth-trust-strip">
              <div className="auth-trust-item">
                <ShieldCheck className="h-4 w-4" />
                <span>Secure email workflow</span>
              </div>
            </div>
          </div>
        </section>

        <section className="auth-card auth-card-compact">
          <div className="auth-card-header">
            <div>
              <p className="auth-card-eyebrow">{isForgotPassword ? "Forgot password" : "Reset password"}</p>
              <h2>{isForgotPassword ? "Send reset link" : "Set password"}</h2>
            </div>
            <Link className="auth-inline-link" to="/auth/sign-in">
              Back to sign in
            </Link>
          </div>

          {isForgotPassword ? (
            <form
              className="auth-form"
              onSubmit={forgotForm.handleSubmit((values) =>
                forgotPasswordMutation.mutate({
                  email: values.email
                })
              )}
            >
              <div className="auth-field">
                <label htmlFor="email">Email</label>
                <input className="auth-input" id="email" type="email" autoComplete="email" {...forgotForm.register("email")} />
                <p className="auth-error">{forgotForm.formState.errors.email?.message}</p>
              </div>

              <button className="auth-primary-button" disabled={forgotPasswordMutation.isPending} type="submit">
                {forgotPasswordMutation.isPending ? "Sending reset link..." : "Send reset link"}
                <ArrowRight className="h-4 w-4" />
              </button>

              {forgotPasswordMutation.isError ? (
                <div className="auth-status-card" role="status">
                  <p>{activeError}</p>
                </div>
              ) : null}

              {forgotPasswordMutation.isSuccess ? (
                <div className="auth-status-card" role="status">
                  <p>{forgotPasswordMutation.data.data.message}</p>
                </div>
              ) : null}
            </form>
          ) : resetPasswordMutation.isSuccess ? (
            <div className="auth-status-card" role="status">
              <p>{resetPasswordMutation.data.data.message}</p>
              <Link className="auth-inline-link" to="/auth/sign-in">Return to sign in</Link>
            </div>
          ) : !resetToken || ["INVALID_RESET_TOKEN", "RESET_LINK_EXPIRED"].includes(
            (resetPasswordMutation.error as AxiosError<{ error?: { code?: string } }> | null)?.response?.data?.error?.code ?? ""
          ) ? (
            <div className="auth-status-card" role="status">
              <p>{resetToken ? activeError : "This password reset link is invalid."}</p>
              <Link className="auth-inline-link" to="/auth/forgot-password">Request a new reset link</Link>
            </div>
          ) : (
            <form className="auth-form" onSubmit={resetForm.handleSubmit((values) => resetPasswordMutation.mutate(values))}>
              <div className="auth-field">
                <label htmlFor="password">New password</label>
                <input className="auth-input" id="password" type="password" autoComplete="new-password" {...resetForm.register("password")} />
                <p className="auth-error">{resetForm.formState.errors.password?.message}</p>
              </div>

              <div className="auth-field">
                <label htmlFor="confirmPassword">Confirm new password</label>
                <input className="auth-input" id="confirmPassword" type="password" autoComplete="new-password" {...resetForm.register("confirmPassword")} />
                <p className="auth-error">{resetForm.formState.errors.confirmPassword?.message}</p>
              </div>

              <button className="auth-primary-button" disabled={resetPasswordMutation.isPending} type="submit">
                {resetPasswordMutation.isPending ? "Updating password..." : "Update password"}
                <ArrowRight className="h-4 w-4" />
              </button>

              {resetPasswordMutation.isError ? (
                <div className="auth-status-card" role="status">
                  <p>{activeError}</p>
                </div>
              ) : null}

            </form>
          )}
        </section>
      </div>
    </div>
  );
}
