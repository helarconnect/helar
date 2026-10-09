import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import type { AuthSession } from "@/store/auth-store";
import { useAuthStore } from "@/store/auth-store";

type SessionResponse = {
  success: true;
  data: AuthSession;
};

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

const apiBaseURL =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "http://localhost:4000" : "");

export const publicHttp = axios.create({
  baseURL: apiBaseURL
});

export const authenticatedHttp = axios.create({
  baseURL: apiBaseURL
});

let refreshRequest: Promise<AuthSession> | null = null;

async function refreshAccessSession() {
  const authStore = useAuthStore.getState();
  const refreshToken = authStore.session?.refreshToken;

  if (!refreshToken) {
    throw new Error("Missing refresh token.");
  }

  const response = await publicHttp.post<SessionResponse>("/api/v1/auth/refresh", {
    refreshToken
  });

  authStore.setSession(response.data.data);
  return response.data.data;
}

authenticatedHttp.interceptors.request.use((config) => {
  const accessToken = useAuthStore.getState().session?.accessToken;

  if (accessToken) {
    config.headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return config;
});

authenticatedHttp.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      throw error;
    }

    const refreshToken = useAuthStore.getState().session?.refreshToken;

    if (!refreshToken) {
      useAuthStore.getState().clearSession();
      throw error;
    }

    originalRequest._retry = true;

    try {
      // Keep concurrent 401 responses behind one refresh call.
      refreshRequest ??= refreshAccessSession();
      const nextSession = await refreshRequest;
      originalRequest.headers.set("Authorization", `Bearer ${nextSession.accessToken}`);
      return authenticatedHttp(originalRequest);
    } catch (refreshError) {
      useAuthStore.getState().clearSession();
      throw refreshError;
    } finally {
      refreshRequest = null;
    }
  }
);
