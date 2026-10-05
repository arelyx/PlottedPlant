import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppLayout() {
  const { isSignedIn } = useUser();
  const navigate = useNavigate();
  // On short screens (phones in landscape) the editor needs every pixel; its
  // own toolbar has a way back, so the app header steps aside there.
  const isEditor = useLocation().pathname.startsWith("/documents/");
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
      <header className={`border-b ${isEditor ? "short:hidden" : ""}`}>
        <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link to={isSignedIn ? "/dashboard" : "/"} className="text-lg font-semibold">
              PlottedPlant
            </Link>
            <nav className="hidden sm:flex items-center gap-2">
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
          <div className="flex items-center gap-1 sm:gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={cycleTheme}
              title={`Theme: ${preferences.theme}`}
            >
              {themeIcon}
            </Button>
            {/* On phones the nav links and theme toggle live in a menu. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Menu">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem onClick={() => navigate("/dashboard")}>Projects</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/templates")}>Templates</DropdownMenuItem>
                <DropdownMenuItem onClick={cycleTheme}>
                  Theme: {preferences.theme} {themeIcon}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
            <SignedOut>
              <SignInButton mode="redirect">
                <button className="text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="redirect">
                <Button size="sm">
                  <span className="sm:hidden">Sign up</span>
                  <span className="hidden sm:inline">Create account</span>
                </Button>
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
