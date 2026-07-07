import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkAuthBridge } from "@/components/ClerkAuthBridge";
import { AuthLayout } from "@/layouts/AuthLayout";
import { AppLayout } from "@/layouts/AppLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { LoginPage } from "@/routes/LoginPage";
import { RegisterPage } from "@/routes/RegisterPage";
import { DashboardPage } from "@/routes/DashboardPage";
import { DocumentPage } from "@/routes/DocumentPage";
import { TemplateBrowserPage } from "@/routes/TemplateBrowserPage";
import { SharedDocumentPage } from "@/routes/SharedDocumentPage";
import { LandingPage } from "@/routes/LandingPage";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

/** ClerkProvider wired to react-router so Clerk navigations use the SPA router
 *  (must live inside BrowserRouter to call useNavigate). */
function ClerkWithRouter({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/login"
      signUpUrl="/register"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      afterSignOutUrl="/"
    >
      <ClerkAuthBridge />
      {children}
    </ClerkProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ClerkWithRouter>
        <TooltipProvider>
          <Routes>
            {/* Clerk-hosted auth (path routing needs the wildcard for sub-steps) */}
            <Route element={<AuthLayout />}>
              <Route path="/login/*" element={<LoginPage />} />
              <Route path="/register/*" element={<RegisterPage />} />
            </Route>

            {/* Protected routes */}
            <Route
              element={
                <AuthGuard>
                  <AppLayout />
                </AuthGuard>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/documents/:id" element={<DocumentPage />} />
            </Route>

            {/* Public app routes (AppLayout without AuthGuard) */}
            <Route element={<AppLayout />}>
              <Route path="/templates" element={<TemplateBrowserPage />} />
            </Route>

            {/* Public share access */}
            <Route path="/share/:token" element={<SharedDocumentPage />} />

            {/* Landing page */}
            <Route path="/" element={<LandingPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </TooltipProvider>
      </ClerkWithRouter>
    </BrowserRouter>
  );
}

export default App;
