import { Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";

export function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <span className="text-lg font-semibold">PlantUML IDE</span>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <>
                <span className="text-sm text-muted-foreground">
                  {user.display_name}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
