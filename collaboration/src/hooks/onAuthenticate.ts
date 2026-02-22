import type { onAuthenticatePayload } from "@hocuspocus/server";
import { internalRequest } from "../utils/http.js";
import { logger } from "../utils/logger.js";

const MAX_CONNECTIONS_PER_USER = parseInt(
  process.env.MAX_WS_CONNECTIONS_PER_USER || "5",
  10,
);

// Track active connection counts per user
const userConnectionCounts = new Map<number, number>();

export function getUserConnectionCount(userId: number): number {
  return userConnectionCounts.get(userId) || 0;
}

export function incrementUserConnections(userId: number): void {
  userConnectionCounts.set(userId, getUserConnectionCount(userId) + 1);
}

export function decrementUserConnections(userId: number): void {
  const count = getUserConnectionCount(userId) - 1;
  if (count <= 0) {
    userConnectionCounts.delete(userId);
  } else {
    userConnectionCounts.set(userId, count);
  }
}

interface AuthResponse {
  valid: boolean;
  user_id?: number;
  display_name?: string;
  permission?: string;
  reason?: string;
}

export async function onAuthenticate({
  token,
  documentName,
  connection,
}: onAuthenticatePayload): Promise<void> {
  const documentId = parseInt(documentName, 10);
  if (isNaN(documentId)) {
    logger.warn("Invalid document name (not an integer):", documentName);
    throw new Error("Invalid document ID");
  }

  if (!token) {
    logger.warn("No token provided for document", documentId);
    throw new Error("Authentication required");
  }

  let result: AuthResponse;
  try {
    result = await internalRequest<AuthResponse>("/auth/validate", {
      method: "POST",
      body: { token, document_id: documentId },
      timeoutMs: 5_000,
    });
  } catch (err) {
    logger.error("Auth validation request failed:", err);
    throw new Error("Internal authentication error");
  }

  if (!result.valid) {
    logger.info("Auth rejected for document", documentId, ":", result.reason);
    throw new Error(result.reason || "Access denied");
  }

  // Enforce per-user connection limit
  const userId = result.user_id!;
  const currentCount = getUserConnectionCount(userId);
  if (currentCount >= MAX_CONNECTIONS_PER_USER) {
    logger.warn(
      `User ${userId} exceeded max WS connections (${currentCount}/${MAX_CONNECTIONS_PER_USER})`,
    );
    throw new Error("Too many concurrent connections");
  }

  // Track the new connection
  incrementUserConnections(userId);

  // Attach user metadata to connection context
  connection.readOnly = result.permission === "viewer";
  (connection as any).context = {
    user_id: result.user_id,
    display_name: result.display_name,
    permission: result.permission,
    is_readonly: result.permission === "viewer",
    authenticated_at: Date.now(),
  };

  logger.info(
    `Authenticated user ${result.user_id} (${result.display_name}) on document ${documentId} as ${result.permission} (connections: ${currentCount + 1}/${MAX_CONNECTIONS_PER_USER})`,
  );
}
