import { useAuthStore } from "@/stores/auth";

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Welcome, {user?.display_name}. Your projects will appear here.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Document and folder management will be implemented in Step 3.
      </p>
    </div>
  );
}
