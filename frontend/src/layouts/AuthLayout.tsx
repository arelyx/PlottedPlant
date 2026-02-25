import { Outlet } from "react-router-dom";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Outlet />
        <p className="mt-8 text-center text-sm text-muted-foreground">
          PlottedPlant
        </p>
      </div>
    </div>
  );
}
