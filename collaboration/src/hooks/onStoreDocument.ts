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

  // A version restore replaces the Y.Doc via force-content and bumps
  // meta.content_revision (see index.ts). If that lands while we are persisting,
  // our snapshot is pre-restore and must not become the document's latest DB
  // state. We snapshot the revision atomically with the text and, if it advances
  // during the async persist, discard the write and re-snapshot so the restored
  // content is what lands in the DB (issue #132). Bounded because restores are
  // rare — this is a safety cap against a restore storm, not a hot path.
  const MAX_RESTORE_RESNAPSHOTS = 3;

  resnapshotLoop: for (
    let resnapshot = 0;
    resnapshot <= MAX_RESTORE_RESNAPSHOTS;
    resnapshot++
  ) {
    const ytext = document.getText("monaco");
    const currentText = ytext.toString();
    const currentHash = sha256(currentText);
    // Captured together with the text (no await in between) so the pair is a
    // consistent snapshot of the Y.Doc at this instant.
    const revisionAtSnapshot = meta.content_revision;

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
    // giving up, then rethrow so the failure is surfaced rather than swallowed.
    const attempts = isSessionEnd ? SESSION_END_RETRY_DELAYS_MS.length + 1 : 1;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const result = await internalRequest<SyncResponse>(endpoint, {
          method: "POST",
          body: { content: currentText, edited_by_user_id: editedByUserId },
        });

        // A version restore replaced the Y.Doc while this write was in flight,
        // so `currentText` is pre-restore. Do NOT stamp it as persisted; loop
        // to re-persist the restored content, which overwrites our now-stale
        // write in the DB. Both this and the restore-scheduled store then write
        // identical restored content, so the DB converges regardless of order.
        if (
          meta.content_revision !== revisionAtSnapshot &&
          resnapshot < MAX_RESTORE_RESNAPSHOTS
        ) {
          logger.warn(
            `Document ${documentName}: content restored during persist — re-persisting restored content`,
          );
          continue resnapshotLoop;
        }

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
    // untouched. For a session end, rethrow so Hocuspocus records the failure
    // instead of silently unloading unsaved edits.
    if (isSessionEnd) {
      logger.error(
        `Document ${documentName}: session-end persist failed after ${attempts} attempts — edits may be lost`,
      );
      throw lastErr;
    }
    return;
  }
}
