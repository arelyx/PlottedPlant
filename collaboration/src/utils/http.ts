const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://backend:8000/api/v1/internal";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "";

interface RequestOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
}

export async function internalRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, timeoutMs = 10_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Internal API ${method} ${path} returned ${response.status}: ${text}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
