import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthLayout } from "@/layouts/AuthLayout";
import { AppLayout } from "@/layouts/AppLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { LoginPage } from "@/routes/LoginPage";
import { RegisterPage } from "@/routes/RegisterPage";
import { ForgotPasswordPage } from "@/routes/ForgotPasswordPage";
import { ResetPasswordPage } from "@/routes/ResetPasswordPage";
import { VerifyEmailPage } from "@/routes/VerifyEmailPage";
import { DashboardPage } from "@/routes/DashboardPage";
import { DocumentPage } from "@/routes/DocumentPage";
import { TemplateBrowserPage } from "@/routes/TemplateBrowserPage";
import { SharedDocumentPage } from "@/routes/SharedDocumentPage";
import { LandingPage } from "@/routes/LandingPage";

function App() {
  return (
    <TooltipProvider>
    <BrowserRouter>
      <Routes>
        {/* Public auth routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
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
    </BrowserRouter>
    </TooltipProvider>
  );
}

export default App;
