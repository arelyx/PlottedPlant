import { create } from "zustand";
import { api } from "@/lib/api";

/** The local app profile (bigint id), fetched from /users/me. Identity and
 *  credentials live in Clerk; this is the row app data (documents, shares) is
 *  keyed to. Populated by ClerkAuthBridge from the Clerk session. */
export interface AppUser {
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
  user: AppUser | null;
  isLoaded: boolean;
  /** Back-compat alias of isLoaded for existing consumers. */
  isInitialized: boolean;
  /** Back-compat; Clerk drives loading state now. */
  isLoading: boolean;
  setUser: (user: AppUser | null) => void;
  setLoaded: (loaded: boolean) => void;
  /** No-op: ClerkAuthBridge drives hydration. Kept so callers don't break. */
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoaded: false,
  isInitialized: false,
  isLoading: false,
  setUser: (user) => set({ user }),
  setLoaded: (loaded) => set({ isLoaded: loaded, isInitialized: loaded }),
  initialize: () => {},
}));

/** Fetch the local app profile for the signed-in Clerk user. */
export async function fetchAppUser(): Promise<AppUser> {
  return api.request<AppUser>("/users/me");
}
