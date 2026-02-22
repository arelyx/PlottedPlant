import { Server } from "@hocuspocus/server";
import express from "express";

const WEBSOCKET_PORT = parseInt(process.env.WEBSOCKET_PORT || "1234", 10);
const COMMAND_PORT = parseInt(process.env.COMMAND_PORT || "1235", 10);

// Hocuspocus WebSocket server
// Hooks will be added in Step 8 — for now, just start the server.
const hocuspocus = Server.configure({
  port: WEBSOCKET_PORT,
});

hocuspocus.listen();
console.log(`Hocuspocus WebSocket server listening on port ${WEBSOCKET_PORT}`);

// Internal HTTP command server (health + commands)
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(COMMAND_PORT, () => {
  console.log(`Command HTTP server listening on port ${COMMAND_PORT}`);
});
