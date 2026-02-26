import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error"
  );
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "This verification link is invalid or missing the token."
  );

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const verify = async () => {
      try {
        await api.request("/auth/email/verify", {
          method: "POST",
          body: JSON.stringify({ token }),
          skipAuth: true,
        });
        if (!cancelled) setStatus("success");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage("An unexpected error occurred.");
        }
        setStatus("error");
      }
    };

    verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "loading") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Verifying email...</CardTitle>
          <CardDescription>Please wait while we verify your email address.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "success") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Email verified</CardTitle>
          <CardDescription>
            Your email address has been verified successfully.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link
            to="/dashboard"
            className="text-sm font-medium text-primary hover:underline"
          >
            Go to dashboard
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Verification failed</CardTitle>
        <CardDescription>{errorMessage}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Link to="/login" className="text-sm text-foreground hover:underline">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
