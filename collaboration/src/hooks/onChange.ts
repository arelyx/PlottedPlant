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

  // Viewer write gating is enforced by connection.readOnly (set in
  // onAuthenticate): Hocuspocus drops sync/update messages from readonly
  // connections before they are ever applied, so onChange never fires for a
  // viewer. Throwing here would be too late (the update is already applied and
  // broadcast) and would only close the connection — so this is a defensive
  // no-op, not the security boundary.
  if (ctx?.is_readonly) {
    logger.warn(
      `onChange fired for readonly user ${ctx.user_id} on ${documentName} — unexpected; connection.readOnly should have blocked it`,
    );
    return;
  }

  // Track editor activity for version attribution
  const meta = (document as any).meta as DocumentMeta | undefined;
  if (meta && ctx?.user_id) {
    meta.last_change_at = Date.now();
    meta.last_editor_id = ctx.user_id;
    meta.active_editors.set(ctx.user_id, {
      display_name: ctx.display_name || "Unknown",
      connected_at: Date.now(),
    });
  }
}
