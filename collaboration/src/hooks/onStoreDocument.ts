import type { onStoreDocumentPayload } from "@hocuspocus/server";
import type { DocumentMeta } from "./onLoadDocument.js";
import { internalRequest } from "../utils/http.js";
import { sha256 } from "../utils/hash.js";
import { logger } from "../utils/logger.js";

interface SyncResponse {
  version_created: boolean;
  version_number?: number;
}

// Backoff between session-end persist retries (transient backend restarts).
const SESSION_END_RETRY_DELAYS_MS = [500, 1500, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function onStoreDocument({
  document,
  documentName,
}: onStoreDocumentPayload): Promise<void> {
  const meta = (document as any).meta as DocumentMeta | undefined;
  if (!meta) {
    logger.warn(`No meta for document ${documentName}, skipping persist`);
    return;
  }

  // The document is being deleted (close-room set this). Persisting now would
  // recreate content for a row that's gone, so skip entirely.
  if (meta.skip_persist) {
    logger.debug(`Document ${documentName}: skip_persist set, not persisting`);
    return;
  }

  const ytext = document.getText("monaco");
  const currentText = ytext.toString();
  const currentHash = sha256(currentText);

  // Skip no-op writes
  if (currentHash === meta.last_persisted_hash) {
    logger.debug(`Document ${documentName}: content unchanged, skipping persist`);
    if (meta.is_session_ending) {
      meta.is_session_ending = false;
    }
    return;
  }

  // Attribute the edit to the last user who actually changed the doc. This
  // survives onDisconnect (which clears active_editors), so a non-owner's
  // session_end version is attributed correctly rather than to the owner.
  let editedByUserId: number | null = meta.last_editor_id;
  if (editedByUserId === null && meta.active_editors.size > 0) {
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
    ? `/documents/${documentName}/session-end`
    : `/documents/${documentName}/sync`;

  // A mid-session store failure is retried on the next debounce (the hash is
  // left unchanged). The session-ending store has no next cycle — Hocuspocus
  // destroys the ephemeral Y.Doc right after — so retry it in-hook before
  // giving up, then log the exhaustion loudly (see below) rather than rethrow.
  const attempts = isSessionEnd ? SESSION_END_RETRY_DELAYS_MS.length + 1 : 1;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await internalRequest<SyncResponse>(endpoint, {
        method: "POST",
        body: { content: currentText, edited_by_user_id: editedByUserId },
      });

      // Update meta only on success
      meta.last_persisted_hash = currentHash;
      meta.last_persisted_at = Date.now();
      if (isSessionEnd) meta.is_session_ending = false;

      if (result.version_created) {
        logger.info(
          `Document ${documentName}: ${isSessionEnd ? "session_end" : "auto"} version ${result.version_number} created`,
        );
      } else {
        logger.debug(`Document ${documentName}: persisted (no new version)`);
      }
      return;
    } catch (err) {
      lastErr = err;
      logger.error(
        `Failed to persist document ${documentName} (attempt ${attempt}/${attempts}):`,
        err,
      );
      if (attempt < attempts) {
        await sleep(SESSION_END_RETRY_DELAYS_MS[attempt - 1]);
      }
    }
  }

  // All attempts failed. Leave last_persisted_hash and is_session_ending
  // untouched. We deliberately do NOT rethrow here (issue #128): Hocuspocus
  // invokes onStoreDocument via an un-awaited internal call, so a throw becomes
  // an unhandled promise rejection that crashes the whole Node process —
  // dropping every connected document and user, not just this one. Losing one
  // doc's session-end save is far less bad than taking down the server for
  // everyone, so we log the exhaustion very loudly and return normally.
  //
  // TODO(#128): a durable dead-letter queue for failed session-end saves would
  // let us recover these edits later instead of only logging them. Not built
  // here to keep the fix surgical.
  if (isSessionEnd) {
    logger.error(
      `Document ${documentName}: session-end persist FAILED after ${attempts} attempts — unsaved edits may be lost. ` +
        `Not rethrowing (would crash the whole collaboration server). Last error:`,
      lastErr,
    );
    return;
  }
}
