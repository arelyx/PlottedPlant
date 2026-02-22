const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  async request<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const { skipAuth, ...fetchOptions } = options;

    const headers = new Headers(fetchOptions.headers);
    if (!headers.has("Content-Type") && fetchOptions.body) {
      headers.set("Content-Type", "application/json");
    }
    if (!skipAuth && this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers,
      credentials: "include", // Send cookies (refresh token)
    });

    // Auto-refresh on 401
    if (response.status === 401 && !skipAuth && !path.includes("/auth/refresh")) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        // Retry original request with new token
        headers.set("Authorization", `Bearer ${this.accessToken}`);
        const retryResponse = await fetch(`${API_BASE}${path}`, {
          ...fetchOptions,
          headers,
          credentials: "include",
        });
        if (!retryResponse.ok) {
          throw await this.buildError(retryResponse);
        }
        if (retryResponse.status === 204) return undefined as T;
        return retryResponse.json();
      }
      throw await this.buildError(response);
    }

    if (!response.ok) {
      throw await this.buildError(response);
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }

  private async tryRefresh(): Promise<boolean> {
    // Deduplicate concurrent refresh attempts
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!response.ok) return false;
        const data = await response.json();
        this.accessToken = data.access_token;
        return true;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async buildError(response: Response): Promise<ApiError> {
    try {
      const body = await response.json();
      return new ApiError(
        response.status,
        body.detail?.code || "UNKNOWN_ERROR",
        body.detail?.message || body.detail || "An error occurred",
      );
    } catch {
      return new ApiError(response.status, "UNKNOWN_ERROR", "An error occurred");
    }
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = new ApiClient();
