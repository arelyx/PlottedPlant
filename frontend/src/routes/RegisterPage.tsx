import { SignUp } from "@clerk/clerk-react";

export function RegisterPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center py-12">
      <SignUp
        routing="path"
        path="/register"
        signInUrl="/login"
        fallbackRedirectUrl="/dashboard"
      />
    </div>
  );
}
