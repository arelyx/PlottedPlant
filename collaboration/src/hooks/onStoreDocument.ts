import type { onStoreDocumentPayload } from "@hocuspocus/server";
import type { DocumentMeta } from "./onLoadDocument.js";
import { internalRequest } from "../utils/http.js";
import { sha256 } from "../utils/hash.js";
import { logger } from "../utils/logger.js";

interface SyncResponse {
  version_created: boolean;
  version_number?: number;
}

export async function onStoreDocument({
  document,
  documentName,
}: onStoreDocumentPayload): Promise<void> {
  const documentId = parseInt(documentName, 10);
  const meta = (document as any).meta as DocumentMeta | undefined;
  if (!meta) {
    logger.warn(`No meta for document ${documentId}, skipping persist`);
    return;
  }

  const ytext = document.getText("monaco");
  const currentText = ytext.toString();
  const currentHash = sha256(currentText);

  // Skip no-op writes
  if (currentHash === meta.last_persisted_hash) {
    logger.debug(`Document ${documentId}: content unchanged, skipping persist`);
    if (meta.is_session_ending) {
      meta.is_session_ending = false;
    }
    return;
  }

  // Determine which editor made the last change
  let editedByUserId: number | null = null;
  if (meta.active_editors.size > 0) {
    // Pick the most recently active editor
    let latestTime = 0;
    for (const [userId, info] of meta.active_editors) {
      if (info.connected_at > latestTime) {
        latestTime = info.connected_at;
        editedByUserId = userId;
      }
    }
  }

  // Determine endpoint based on session state
  const isSessionEnd = meta.is_session_ending;
  const endpoint = isSessionEnd
    ? `/documents/${documentId}/session-end`
    : `/documents/${documentId}/sync`;
  const method = "POST";

  try {
    const result = await internalRequest<SyncResponse>(endpoint, {
      method,
      body: {
        content: currentText,
        edited_by_user_id: editedByUserId,
      },
    });

    // Update meta on success
    meta.last_persisted_hash = currentHash;
    meta.last_persisted_at = Date.now();

    if (result.version_created) {
      logger.info(
        `Document ${documentId}: ${isSessionEnd ? "session_end" : "auto"} version ${result.version_number} created`,
      );
    } else {
      logger.debug(`Document ${documentId}: persisted (no new version)`);
    }
  } catch (err) {
    // On failure, hash is NOT updated → next cycle will retry
    logger.error(`Failed to persist document ${documentId}:`, err);
  }

  if (isSessionEnd) {
    meta.is_session_ending = false;
  }
}
