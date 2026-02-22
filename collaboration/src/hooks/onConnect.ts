import type { onConnectPayload } from "@hocuspocus/server";
import { logger } from "../utils/logger.js";

export async function onConnect({
  documentName,
  context,
}: onConnectPayload): Promise<void> {
  const ctx = context as {
    user_id?: number;
    display_name?: string;
    is_readonly?: boolean;
  } | undefined;

  logger.info(
    `User ${ctx?.user_id ?? "unknown"} (${ctx?.display_name ?? "?"}) connecting to document ${documentName} as ${ctx?.is_readonly ? "viewer" : "editor"}`,
  );
}
