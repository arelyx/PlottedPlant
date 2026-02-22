import type { onAuthenticatePayload } from "@hocuspocus/server";
import { internalRequest } from "../utils/http.js";
import { logger } from "../utils/logger.js";

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
    `Authenticated user ${result.user_id} (${result.display_name}) on document ${documentId} as ${result.permission}`,
  );
}
