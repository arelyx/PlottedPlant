import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isInitialized, isLoading, initialize } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  if (!isInitialized || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
