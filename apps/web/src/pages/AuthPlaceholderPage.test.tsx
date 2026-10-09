// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError } from "axios";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequireAuth } from "@/components/routing/RequireAuth";
import { useAuthStore } from "@/store/auth-store";
import { AuthPlaceholderPage } from "./AuthPlaceholderPage";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  } });
});
const api = vi.hoisted(() => ({ signInDemo: vi.fn(), signUpDemo: vi.fn(), resendEmailVerification: vi.fn() }));
vi.mock("@/lib/api", () => api);
const session = {
  accessToken: "access", refreshToken: "refresh", expiresIn: 900,
  user: { id: "user", fullName: "Member", email: "member@example.com", emailVerifiedAt: null as string | null, roleCodes: ["student"], institutionId: "institution", twoFactorEnabled: false }
};
function showPage(mode: "sign-in" | "sign-up") {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <MemoryRouter initialEntries={[`/auth/${mode}`]}><AuthPlaceholderPage mode={mode} /></MemoryRouter>
  </QueryClientProvider>);
}
function enterCredentials() {
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: session.user.email } });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), { target: { value: "Helar123!" } });
}
beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.getState().clearSession();
  api.resendEmailVerification.mockResolvedValue({ success: true, data: { message: "If this email belongs to an unverified account, a verification link has been sent." }, meta: { verificationEmailStatus: "sent" } });
});
afterEach(() => { cleanup(); useAuthStore.getState().clearSession(); });

describe("verification before portal login", () => {
  it("keeps a newly registered user signed out with a persistent verification message", async () => {
    api.signUpDemo.mockResolvedValue({ success: true, data: { user: session.user, requiresVerification: true }, meta: { verificationEmailStatus: "sent" } });
    showPage("sign-up");
    enterCredentials();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "New Member" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Helar123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(api.signUpDemo).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: "Resend verification link" });
    expect(screen.getAllByText(/Check your email for the verification link/).length).toBeGreaterThan(0);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Resend verification link" }));
    await waitFor(() => expect(api.resendEmailVerification).toHaveBeenCalledWith(session.user.email));
  });
  it("lets existing users resend from sign-in without logging in", async () => {
    showPage("sign-in");
    fireEvent.change(screen.getByLabelText("Email for verification"), { target: { value: session.user.email } });
    fireEvent.click(screen.getByRole("button", { name: "Resend verification link" }));
    await waitFor(() => expect(api.resendEmailVerification).toHaveBeenCalledWith(session.user.email));
    expect(api.signInDemo).not.toHaveBeenCalled();
    expect(useAuthStore.getState().session).toBeNull();
  });
  it("offers resend when login reports that verification is required", async () => {
    api.signInDemo.mockRejectedValue(new AxiosError("Verification required", undefined, undefined, undefined, {
      data: { error: { code: "EMAIL_VERIFICATION_REQUIRED", message: "Please verify your email address before signing in." } },
      status: 403, statusText: "Forbidden", headers: {}, config: { headers: {} } as never
    }));
    showPage("sign-in");
    enterCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to workspace" }));
    await waitFor(() => expect((screen.getByLabelText("Email for verification") as HTMLInputElement).value).toBe(session.user.email));
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
  it("blocks persisted unverified sessions from the protected portal", async () => {
    useAuthStore.getState().setSession(session);
    render(<MemoryRouter initialEntries={["/app/dashboard"]}>
      <Routes><Route element={<RequireAuth />}><Route path="/app/dashboard" element={<p>Protected dashboard</p>} /></Route>
      <Route path="/auth/sign-in" element={<p>Verification sign-in</p>} /></Routes>
    </MemoryRouter>);
    await screen.findByText("Verification sign-in");
    expect(screen.queryByText("Protected dashboard")).toBeNull();
  });
  it("retains access for previously verified sessions", async () => {
    useAuthStore.getState().setSession({ ...session, user: { ...session.user, emailVerifiedAt: "2026-09-01T00:00:00Z" } });
    render(<MemoryRouter initialEntries={["/app/dashboard"]}>
      <Routes><Route element={<RequireAuth />}><Route path="/app/dashboard" element={<p>Protected dashboard</p>} /></Route>
      <Route path="/auth/sign-in" element={<p>Verification sign-in</p>} /></Routes>
    </MemoryRouter>);
    expect(screen.getByText("Protected dashboard")).toBeTruthy();
  });
});
