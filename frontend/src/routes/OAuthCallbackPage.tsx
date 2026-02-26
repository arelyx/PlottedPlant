import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function OAuthCallbackPage() {
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    let cancelled = false;

    const complete = async () => {
      try {
        // The backend set a refresh cookie — use it to get access token + user
        await initialize();
        if (!cancelled) {
          navigate("/dashboard", { replace: true });
        }
      } catch {
        if (!cancelled) {
          setError("Failed to complete sign in. Please try again.");
        }
      }
    };

    complete();
    return () => {
      cancelled = true;
    };
  }, [initialize, navigate]);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign in failed</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Signing you in...</CardTitle>
        <CardDescription>Please wait while we complete authentication.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-center py-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </CardContent>
    </Card>
  );
}
