import { SignIn } from "@clerk/clerk-react";

export function LoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center py-12">
      <SignIn
        routing="path"
        path="/login"
        signUpUrl="/register"
        fallbackRedirectUrl="/dashboard"
      />
    </div>
  );
}
