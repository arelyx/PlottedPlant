import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@/lib/api";
import { fetchAppUser, useAuthStore } from "@/stores/auth";
import { usePreferencesStore } from "@/stores/preferences";

/**
 * Bridges Clerk's session into the app: feeds the API client (and, via it, the
 * collaboration WebSocket) a fresh Clerk token, and mirrors the signed-in
 * user's local /users/me profile into useAuthStore so existing consumers keep
 * reading `user` (with its bigint id). Renders nothing.
 */
export function ClerkAuthBridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const setUser = useAuthStore((s) => s.setUser);
  const setLoaded = useAuthStore((s) => s.setLoaded);

  // Route every API/WS request's Authorization through Clerk's session token.
  useEffect(() => {
    api.setTokenGetter(async () => (isSignedIn ? await getToken() : null));
  }, [isSignedIn, getToken]);

  // Hydrate (or clear) the local profile as the Clerk session changes.
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    if (isSignedIn) {
      fetchAppUser()
        .then((u) => {
          if (!cancelled) {
            setUser(u);
            setLoaded(true);
          }
        })
        .catch(() => {
          if (!cancelled) setLoaded(true);
        });
    } else {
      setUser(null);
      setLoaded(true);
      // Don't let one user's preferences bleed into the next session.
      usePreferencesStore.getState().reset();
    }

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, setUser, setLoaded]);

  return null;
}
