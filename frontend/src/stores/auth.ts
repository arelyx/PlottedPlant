import { create } from "zustand";
import { api } from "@/lib/api";

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

export const useAuthStore = create<AuthState>((set, get) => ({
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
    const ok = await api.tryRefresh();
    if (!ok) set({ user: null });
    return ok;
  },

  initialize: async () => {
    // Guard against concurrent boots (React StrictMode double-invokes effects,
    // multiple tabs). The refresh itself is deduplicated in the api client, but
    // this avoids a redundant second /users/me fetch.
    if (get().isLoading || get().isInitialized) return;
    set({ isLoading: true });

    // Refresh via the deduplicated api-client path so two concurrent boots
    // don't each present the cookie and trip the backend's reuse detection.
    const refreshed = await api.tryRefresh();
    if (!refreshed) {
      set({ user: null, isInitialized: true, isLoading: false });
      return;
    }

    try {
      const user = await api.request<User>("/users/me");
      set({ user, isInitialized: true, isLoading: false });
    } catch {
      set({ user: null, isInitialized: true, isLoading: false });
    }
  },
}));

// When a request can't refresh the session, clear auth state so route guards
// redirect to login instead of leaving the app apparently signed in.
api.setOnAuthFailure(() => {
  useAuthStore.setState({ user: null });
});
