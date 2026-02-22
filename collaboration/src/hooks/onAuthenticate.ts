import type { onAuthenticatePayload } from "@hocuspocus/server";
import { internalRequest } from "../utils/http.js";
import { logger } from "../utils/logger.js";

const MAX_CONNECTIONS_PER_USER = parseInt(
  process.env.MAX_WS_CONNECTIONS_PER_USER || "20",
  10,
);

// Track active connections per user using unique socket IDs.
// This avoids counter drift when disconnects are processed after reconnects
// (common with React strict mode's mount → unmount → remount cycle).
const userActiveSockets = new Map<number, Set<string>>();
const socketToUser = new Map<string, number>();

export function getUserConnectionCount(userId: number): number {
  return userActiveSockets.get(userId)?.size ?? 0;
}

export function addUserConnection(userId: number, socketId: string): void {
  if (!userActiveSockets.has(userId)) {
    userActiveSockets.set(userId, new Set());
  }
  userActiveSockets.get(userId)!.add(socketId);
  socketToUser.set(socketId, userId);
}

export function removeUserConnection(socketId: string): void {
  const userId = socketToUser.get(socketId);
  if (userId !== undefined) {
    const sockets = userActiveSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        userActiveSockets.delete(userId);
      }
    }
    socketToUser.delete(socketId);
  }
}

export function getActiveSocketIds(): string[] {
  return Array.from(socketToUser.keys());
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
  socketId,
  context,
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

  // Track the new connection by socket ID
  addUserConnection(userId, socketId);

  // Attach user metadata to the shared context object so subsequent hooks
  // (onChange, onDisconnect, etc.) can access user info.
  connection.readOnly = result.permission === "viewer";
  context.user_id = result.user_id;
  context.display_name = result.display_name;
  context.permission = result.permission;
  context.is_readonly = result.permission === "viewer";
  context.authenticated_at = Date.now();

  logger.info(
    `Authenticated user ${result.user_id} (${result.display_name}) on document ${documentId} as ${result.permission} (connections: ${currentCount + 1}/${MAX_CONNECTIONS_PER_USER})`,
  );
}
