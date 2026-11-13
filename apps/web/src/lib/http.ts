import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import type { AuthSession } from "@/store/auth-store";
import { useAuthStore } from "@/store/auth-store";

type SessionResponse = {
  success: true;
  data: AuthSession;
};

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  authUserId?: string;
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

let refreshRequest: { token: string; promise: Promise<AuthSession> } | null = null;

async function refreshAccessSession(refreshToken: string) {
  const response = await publicHttp.post<SessionResponse>("/api/v1/auth/refresh", {
    refreshToken
  });

  const authStore = useAuthStore.getState();
  if (authStore.session?.refreshToken === refreshToken) {
    authStore.setSession(response.data.data);
  }
  return response.data.data;
}

authenticatedHttp.interceptors.request.use((config) => {
  const session = useAuthStore.getState().session;

  if (session) {
    (config as RetriableRequestConfig).authUserId = session.user.id;
    config.headers.set("Authorization", `Bearer ${session.accessToken}`);
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

    const session = useAuthStore.getState().session;

    if (!session || session.user.id !== originalRequest.authUserId) {
      throw error;
    }

    originalRequest._retry = true;

    if (originalRequest.headers.get("Authorization") !== `Bearer ${session.accessToken}`) {
      return authenticatedHttp(originalRequest);
    }

    if (refreshRequest?.token !== session.refreshToken) {
      refreshRequest = {
        token: session.refreshToken,
        promise: refreshAccessSession(session.refreshToken)
      };
    }
    const pendingRefresh = refreshRequest;

    try {
      const nextSession = await pendingRefresh.promise;
      if (useAuthStore.getState().session?.refreshToken !== nextSession.refreshToken) {
        throw error;
      }
      return authenticatedHttp(originalRequest);
    } catch (refreshError) {
      if (axios.isAxiosError(refreshError) && refreshError.response?.status === 401 &&
          useAuthStore.getState().session?.refreshToken === session.refreshToken) {
        useAuthStore.getState().clearSession();
      }
      throw refreshError;
    } finally {
      if (refreshRequest === pendingRefresh) {
        refreshRequest = null;
      }
    }
  }
);
