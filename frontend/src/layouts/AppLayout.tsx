import { useEffect } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { usePreferencesStore } from "@/stores/preferences";
import { Button } from "@/components/ui/button";

export function AppLayout() {
  const { user, logout, isInitialized, initialize } = useAuthStore();
  const { preferences, isLoaded, resolvedTheme, load, update } =
    usePreferencesStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isInitialized) initialize();
  }, [isInitialized, initialize]);

  useEffect(() => {
    if (!isLoaded) load();
  }, [isLoaded, load]);

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

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

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
            <Link to={user ? "/dashboard" : "/"} className="text-lg font-semibold">
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
            {user ? (
              <>
                <span className="text-sm text-muted-foreground">
                  {user.display_name}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Sign out
                </button>
              </>
            ) : (
              isInitialized && (
                <>
                  <Link
                    to="/login"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Sign in
                  </Link>
                  <Link to="/register">
                    <Button size="sm">Create account</Button>
                  </Link>
                </>
              )
            )}
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
