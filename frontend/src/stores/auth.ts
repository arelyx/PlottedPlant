import { create } from "zustand";
import { api, ApiError } from "@/lib/api";

interface User {
  id: number;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_email_verified: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    username: string,
    displayName: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,

  login: async (email, password) => {
    const data = await api.request<{
      user: User;
      access_token: string;
      expires_in: number;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });
    api.setAccessToken(data.access_token);
    set({ user: data.user });
  },

  register: async (email, username, displayName, password) => {
    const data = await api.request<{
      user: User;
      access_token: string;
      expires_in: number;
    }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        username,
        display_name: displayName,
        password,
      }),
      skipAuth: true,
    });
    api.setAccessToken(data.access_token);
    set({ user: data.user });
  },

  logout: async () => {
    try {
      await api.request("/auth/logout", { method: "POST" });
    } catch {
      // Logout should succeed even if the API call fails
    }
    api.setAccessToken(null);
    set({ user: null });
  },

  refreshToken: async () => {
    try {
      const data = await api.request<{
        access_token: string;
        expires_in: number;
      }>("/auth/refresh", {
        method: "POST",
        skipAuth: true,
      });
      api.setAccessToken(data.access_token);
      return true;
    } catch {
      api.setAccessToken(null);
      set({ user: null });
      return false;
    }
  },

  initialize: async () => {
    set({ isLoading: true });
    try {
      // Try to refresh the token (uses HTTP-only cookie)
      const data = await api.request<{
        access_token: string;
        expires_in: number;
      }>("/auth/refresh", {
        method: "POST",
        skipAuth: true,
      });
      api.setAccessToken(data.access_token);

      // Fetch user profile
      const user = await api.request<User>("/users/me");
      set({ user, isInitialized: true, isLoading: false });
    } catch {
      api.setAccessToken(null);
      set({ user: null, isInitialized: true, isLoading: false });
    }
  },
}));
