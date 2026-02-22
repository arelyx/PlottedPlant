import type { onChangePayload } from "@hocuspocus/server";
import type { DocumentMeta } from "./onLoadDocument.js";
import { logger } from "../utils/logger.js";

export async function onChange({
  document,
  documentName,
  context,
}: onChangePayload): Promise<void> {
  const ctx = context as {
    user_id?: number;
    display_name?: string;
    is_readonly?: boolean;
  } | undefined;

  // Reject writes from viewers (server-side enforcement)
  if (ctx?.is_readonly) {
    logger.warn(
      `Viewer ${ctx.user_id} attempted to modify document ${documentName}, rejecting`,
    );
    throw new Error("Read-only access");
  }

  // Track editor activity for version attribution
  const meta = (document as any).meta as DocumentMeta | undefined;
  if (meta && ctx?.user_id) {
    meta.last_change_at = Date.now();
    meta.active_editors.set(ctx.user_id, {
      display_name: ctx.display_name || "Unknown",
      connected_at: Date.now(),
    });
  }
}
