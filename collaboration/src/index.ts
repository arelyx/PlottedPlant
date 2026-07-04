import { Server } from "@hocuspocus/server";
import express from "express";
import { timingSafeEqual } from "node:crypto";
import { onAuthenticate, getActiveSocketIds, removeUserConnection } from "./hooks/onAuthenticate.js";
import { onLoadDocument } from "./hooks/onLoadDocument.js";
import { onStoreDocument } from "./hooks/onStoreDocument.js";
import { onDisconnect } from "./hooks/onDisconnect.js";
import { onChange } from "./hooks/onChange.js";
import { onConnect } from "./hooks/onConnect.js";
import { logger } from "./utils/logger.js";

const WEBSOCKET_PORT = parseInt(process.env.WEBSOCKET_PORT || "1234", 10);
const COMMAND_PORT = parseInt(process.env.COMMAND_PORT || "1235", 10);
// Persistence debounce: 10s quiet / 30s hard cap (per the WebSocket spec).
const DEBOUNCE_MS = parseInt(process.env.DEBOUNCE_MS || "10000", 10);
const MAX_DEBOUNCE_MS = parseInt(process.env.MAX_DEBOUNCE_MS || "30000", 10);
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "";

// The internal command server authenticates FastAPI via this shared secret.
// An empty secret would make `secret !== ""` false for a missing header,
// silently authorizing anyone on frontend_net — fail fast instead.
if (!INTERNAL_SECRET) {
  logger.error("INTERNAL_SECRET is not set — refusing to start the command server");
  process.exit(1);
}

// Hocuspocus WebSocket server with all lifecycle hooks
const hocuspocus = Server.configure({
  port: WEBSOCKET_PORT,
  timeout: 30_000, // Detect dead WebSocket connections via ping/pong
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

// Periodically clean up stale connection tracking entries.
// If a WebSocket dies without a proper close frame (browser crash, network
// failure), onDisconnect never fires and the socket ID stays in the tracking
// map. This sweep collects all socket IDs that Hocuspocus still considers
// active and removes any tracked entries that are no longer present.
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute
setInterval(() => {
  const liveSocketIds = new Set<string>();
  for (const doc of hocuspocus.documents.values()) {
    for (const conn of doc.getConnections()) {
      if (conn.socketId) liveSocketIds.add(conn.socketId);
    }
  }

  const tracked = getActiveSocketIds();
  let cleaned = 0;
  for (const socketId of tracked) {
    if (!liveSocketIds.has(socketId)) {
      removeUserConnection(socketId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.info(`Cleaned up ${cleaned} stale connection tracking entries`);
  }
}, CLEANUP_INTERVAL_MS);

// Internal HTTP command server (health + commands)
const app = express();
// force-content carries a full restored document body; the 100KB express
// default would 413 large documents before the handler runs.
app.use(express.json({ limit: "10mb" }));

const SECRET_BUF = Buffer.from(INTERNAL_SECRET);

// Constant-time comparison of the presented secret against the configured one.
function secretMatches(presented: unknown): boolean {
  if (typeof presented !== "string") return false;
  const buf = Buffer.from(presented);
  if (buf.length !== SECRET_BUF.length) return false;
  return timingSafeEqual(buf, SECRET_BUF);
}

// Auth middleware for internal commands
function verifySecret(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (req.path === "/health") return next();
  if (!secretMatches(req.headers["x-internal-secret"])) {
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

  // Deliberately do NOT stamp last_persisted_hash here. A debounced store
  // carrying pre-restore text can land between FastAPI's DB commit and this
  // call; stamping the restored hash would make every later flush hash-match
  // and skip, leaving stale content in the DB. Leaving the hash unchanged lets
  // the next onStoreDocument re-persist the restored text (a no-op version at
  // worst if the DB already holds it).

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

  // Mark the doc so the disconnect cascade's final store is a no-op — the
  // document is being deleted, so there's nothing to persist.
  const meta = (doc as any).meta;
  if (meta) meta.skip_persist = true;

  try {
    hocuspocus.closeConnections(documentId);
  } catch (err) {
    logger.error(`Error closing room ${documentId}:`, err);
  }

  logger.info(`Closed room for document ${documentId} (${count} connections)`);
  res.json({ active: true, disconnected: count });
});

const commandServer = app.listen(COMMAND_PORT, () => {
  logger.info(`Command HTTP server listening on port ${COMMAND_PORT}`);
});

// Graceful shutdown: on SIGTERM/SIGINT (docker stop, deploy), flush every
// pending debounced store and close connections before exiting. Without this,
// node exits immediately and all in-memory Y.Doc state up to a full debounce
// window is lost on every deploy.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);
  try {
    await hocuspocus.destroy(); // closes connections and flushes onStoreDocument
  } catch (err) {
    logger.error("Error during Hocuspocus shutdown:", err);
  }
  commandServer.close();
  logger.info("Shutdown complete");
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
