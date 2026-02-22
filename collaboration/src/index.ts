import { Server } from "@hocuspocus/server";
import express from "express";
import { onAuthenticate } from "./hooks/onAuthenticate.js";
import { onLoadDocument } from "./hooks/onLoadDocument.js";
import { onStoreDocument } from "./hooks/onStoreDocument.js";
import { onDisconnect } from "./hooks/onDisconnect.js";
import { onChange } from "./hooks/onChange.js";
import { onConnect } from "./hooks/onConnect.js";
import { sha256 } from "./utils/hash.js";
import { logger } from "./utils/logger.js";

const WEBSOCKET_PORT = parseInt(process.env.WEBSOCKET_PORT || "1234", 10);
const COMMAND_PORT = parseInt(process.env.COMMAND_PORT || "1235", 10);
const DEBOUNCE_MS = parseInt(process.env.DEBOUNCE_MS || "2000", 10);
const MAX_DEBOUNCE_MS = parseInt(process.env.MAX_DEBOUNCE_MS || "10000", 10);
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "";

// Hocuspocus WebSocket server with all lifecycle hooks
const hocuspocus = Server.configure({
  port: WEBSOCKET_PORT,
  debounce: DEBOUNCE_MS,
  maxDebounce: MAX_DEBOUNCE_MS,

  async onAuthenticate(data) {
    return onAuthenticate(data);
  },

  async onLoadDocument(data) {
    return onLoadDocument(data);
  },

  async onConnect(data) {
    return onConnect(data);
  },

  async onChange(data) {
    return onChange(data);
  },

  async onStoreDocument(data) {
    return onStoreDocument(data);
  },

  async onDisconnect(data) {
    return onDisconnect(data);
  },
});

hocuspocus.listen();
logger.info(
  `Hocuspocus WebSocket server listening on port ${WEBSOCKET_PORT} (debounce: ${DEBOUNCE_MS}ms, max: ${MAX_DEBOUNCE_MS}ms)`,
);

// Internal HTTP command server (health + commands)
const app = express();
app.use(express.json());

// Auth middleware for internal commands
function verifySecret(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (req.path === "/health") return next();
  const secret = req.headers["x-internal-secret"];
  if (secret !== INTERNAL_SECRET) {
    res.status(403).json({ error: "Invalid internal secret" });
    return;
  }
  next();
}
app.use(verifySecret);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// POST /internal/documents/:id/force-content
// Called by FastAPI when a version is restored while collaborators are connected
app.post("/internal/documents/:id/force-content", (req, res) => {
  const documentId = req.params.id;
  const { content, restored_by, version_number } = req.body;

  const documents = hocuspocus.documents;
  const doc = documents.get(documentId);

  if (!doc) {
    // Document not active — content will be loaded from DB on next connect
    res.json({ active: false });
    return;
  }

  // Replace Y.Text content in a transaction
  const ytext = doc.getText("monaco");
  doc.transact(() => {
    ytext.delete(0, ytext.length);
    ytext.insert(0, content || "");
  });

  // Update persisted hash to match the forced content
  const meta = (doc as any).meta;
  if (meta) {
    meta.last_persisted_hash = sha256(content || "");
    meta.last_persisted_at = Date.now();
  }

  logger.info(
    `Force-content applied to document ${documentId} (version ${version_number} by ${restored_by})`,
  );
  res.json({ active: true });
});

// POST /internal/documents/:id/close-room
// Called by FastAPI when a document is deleted
app.post("/internal/documents/:id/close-room", (req, res) => {
  const documentId = req.params.id;
  const doc = hocuspocus.documents.get(documentId);

  if (!doc) {
    res.json({ active: false, disconnected: 0 });
    return;
  }

  // Get connection count before closing
  const count = doc.getConnectionsCount();

  try {
    hocuspocus.closeConnections(documentId);
  } catch (err) {
    logger.error(`Error closing room ${documentId}:`, err);
  }

  logger.info(`Closed room for document ${documentId} (${count} connections)`);
  res.json({ active: true, disconnected: count });
});

app.listen(COMMAND_PORT, () => {
  logger.info(`Command HTTP server listening on port ${COMMAND_PORT}`);
});
