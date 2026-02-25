import type { onLoadDocumentPayload } from "@hocuspocus/server";
import { internalRequest } from "../utils/http.js";
import { sha256 } from "../utils/hash.js";
import { logger } from "../utils/logger.js";

interface ContentResponse {
  content: string;
}

export interface DocumentMeta {
  last_persisted_hash: string;
  last_persisted_at: number;
  last_change_at: number | null;
  active_editors: Map<number, { display_name: string; connected_at: number }>;
  active_viewers: Map<number, { display_name: string; connected_at: number }>;
  is_session_ending: boolean;
}

export async function onLoadDocument({
  document,
  documentName,
}: onLoadDocumentPayload): Promise<void> {
  logger.info(`Loading document ${documentName} from database`);

  let result: ContentResponse;
  try {
    result = await internalRequest<ContentResponse>(
      `/documents/${documentName}/content`,
      { timeoutMs: 10_000 },
    );
  } catch (err) {
    logger.error(`Failed to load document ${documentName}:`, err);
    throw new Error("Failed to load document content");
  }

  const plainText = result.content || "";

  // Initialize Y.Text with the shared type name 'monaco'
  const ytext = document.getText("monaco");
  if (ytext.length === 0 && plainText.length > 0) {
    ytext.insert(0, plainText);
  }

  // Store metadata on the document for persistence logic
  const meta: DocumentMeta = {
    last_persisted_hash: sha256(plainText),
    last_persisted_at: Date.now(),
    last_change_at: null,
    active_editors: new Map(),
    active_viewers: new Map(),
    is_session_ending: false,
  };
  (document as any).meta = meta;

  logger.info(`Document ${documentName} loaded (${plainText.length} chars)`);
}
