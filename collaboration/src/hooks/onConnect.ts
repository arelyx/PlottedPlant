import type { onConnectPayload } from "@hocuspocus/server";
import type { DocumentMeta } from "./onLoadDocument.js";
import { logger } from "../utils/logger.js";

export async function onConnect({
  documentName,
  context,
  instance,
}: onConnectPayload): Promise<void> {
  const ctx = context as {
    user_id?: number;
    display_name?: string;
    is_readonly?: boolean;
  } | undefined;

  // If a client reconnects while the doc is still loaded (the page-refresh
  // case: disconnect then reconnect within the debounce window), the last
  // disconnect set is_session_ending=true but the doc was never unloaded.
  // Clear the flag so the next store is recorded as an `auto` version, not a
  // spurious `session_end` mid-session. A brand-new doc isn't in the map yet
  // (meta undefined → no-op); onLoadDocument initializes the flag to false.
  const doc = instance.documents.get(documentName);
  const meta = (doc as any)?.meta as DocumentMeta | undefined;
  if (meta?.is_session_ending) {
    meta.is_session_ending = false;
    logger.info(
      `Document ${documentName}: client reconnected during session-ending window, cleared flag`,
    );
  }

  logger.info(
    `User ${ctx?.user_id ?? "unknown"} (${ctx?.display_name ?? "?"}) connecting to document ${documentName} as ${ctx?.is_readonly ? "viewer" : "editor"}`,
  );
}
