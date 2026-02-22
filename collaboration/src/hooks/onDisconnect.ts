import type { onDisconnectPayload } from "@hocuspocus/server";
import type { DocumentMeta } from "./onLoadDocument.js";
import { decrementUserConnections } from "./onAuthenticate.js";
import { logger } from "../utils/logger.js";

export async function onDisconnect({
  document,
  documentName,
  clientsCount,
  context,
}: onDisconnectPayload): Promise<void> {
  const documentId = parseInt(documentName, 10);
  const meta = (document as any).meta as DocumentMeta | undefined;
  const ctx = context as {
    user_id?: number;
    display_name?: string;
    is_readonly?: boolean;
  } | undefined;

  if (ctx?.user_id) {
    decrementUserConnections(ctx.user_id);
  }

  if (meta && ctx?.user_id) {
    meta.active_editors.delete(ctx.user_id);
    meta.active_viewers.delete(ctx.user_id);
  }

  logger.info(
    `User ${ctx?.user_id ?? "unknown"} disconnected from document ${documentId} (${clientsCount} clients remaining)`,
  );

  if (clientsCount === 0 && meta) {
    meta.is_session_ending = true;
    logger.info(`Document ${documentId}: last client disconnected, session ending`);
  }
}
