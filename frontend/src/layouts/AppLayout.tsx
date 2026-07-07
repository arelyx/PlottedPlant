import { useEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
} from "@clerk/clerk-react";
import { usePreferencesStore } from "@/stores/preferences";
import { Button } from "@/components/ui/button";

export function AppLayout() {
  const { isSignedIn } = useUser();
  const { preferences, isLoaded, resolvedTheme, load, update } =
    usePreferencesStore();

  useEffect(() => {
    if (isSignedIn && !isLoaded) load();
  }, [isSignedIn, isLoaded, load]);

  // Listen for OS theme changes when using "system"
  useEffect(() => {
    if (preferences.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved = mq.matches ? "dark" : "light";
      document.documentElement.classList.toggle("dark", resolved === "dark");
      usePreferencesStore.setState({ resolvedTheme: resolved });
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preferences.theme]);

  const cycleTheme = () => {
    const order: Array<"light" | "dark" | "system"> = [
      "light",
      "dark",
      "system",
    ];
    const next = order[(order.indexOf(preferences.theme) + 1) % order.length];
    update({ theme: next });
  };

  const themeIcon =
    resolvedTheme === "dark" ? "\u263E" : preferences.theme === "system" ? "\u25D1" : "\u2600";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link to={isSignedIn ? "/dashboard" : "/"} className="text-lg font-semibold">
              PlottedPlant
            </Link>
            <nav className="flex items-center gap-2">
              <Link
                to="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Projects
              </Link>
              <Link
                to="/templates"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Templates
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={cycleTheme} title={`Theme: ${preferences.theme}`}>
              {themeIcon}
            </Button>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
            <SignedOut>
              <SignInButton mode="redirect">
                <button className="text-sm text-muted-foreground hover:text-foreground">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="redirect">
                <Button size="sm">Create account</Button>
              </SignUpButton>
            </SignedOut>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
