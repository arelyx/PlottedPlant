const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
}

class ApiClient {
  // Clerk owns the session; a bridge component registers a getter that returns
  // a fresh short-lived session JWT. There is no in-memory token or custom
  // refresh flow anymore — Clerk mints/refreshes tokens on demand.
  private tokenGetter: (() => Promise<string | null>) | null = null;

  /** Register the source of the current session token (Clerk's getToken). */
  setTokenGetter(getter: (() => Promise<string | null>) | null) {
    this.tokenGetter = getter;
  }

  /** Current session token, or null when signed out. Used by the WS provider too. */
  async getToken(): Promise<string | null> {
    return this.tokenGetter ? await this.tokenGetter() : null;
  }

  private async doFetch(
    path: string,
    fetchOptions: RequestInit,
    skipAuth: boolean,
  ): Promise<Response> {
    const headers = new Headers(fetchOptions.headers);
    if (!headers.has("Content-Type") && fetchOptions.body) {
      headers.set("Content-Type", "application/json");
    }
    if (!skipAuth) {
      const token = await this.getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  }

  private async fetchWithAuth(
    path: string,
    fetchOptions: RequestInit,
    skipAuth: boolean,
  ): Promise<Response> {
    let response = await this.doFetch(path, fetchOptions, skipAuth);
    // On a fresh load the Clerk session token can lag the first request. Retry
    // once with a freshly-minted token before surfacing a 401, so the dashboard
    // doesn't render empty during the sign-in handoff.
    if (response.status === 401 && !skipAuth) {
      await new Promise((r) => setTimeout(r, 250));
      response = await this.doFetch(path, fetchOptions, skipAuth);
    }
    return response;
  }

  async request<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const { skipAuth, ...fetchOptions } = options;
    const response = await this.fetchWithAuth(path, fetchOptions, !!skipAuth);
    if (!response.ok) throw await this.buildError(response);
    if (response.status === 204) return undefined as T;
    return response.json();
  }

  /** Like request(), but returns the response body as a Blob (e.g. PNG export). */
  async requestBlob(path: string, options: ApiOptions = {}): Promise<Blob> {
    const { skipAuth, ...fetchOptions } = options;
    const response = await this.fetchWithAuth(path, fetchOptions, !!skipAuth);
    if (!response.ok) throw await this.buildError(response);
    return response.blob();
  }

  /**
   * Auth-aware fetch returning the raw Response without throwing on non-OK,
   * for callers that must inspect specific statuses (e.g. render's 422).
   */
  async requestRaw(path: string, options: ApiOptions = {}): Promise<Response> {
    const { skipAuth, ...fetchOptions } = options;
    return this.fetchWithAuth(path, fetchOptions, !!skipAuth);
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
