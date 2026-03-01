import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import "./styles/index.css";
import App from "./App.tsx";

// Use the locally bundled monaco-editor instead of loading from CDN.
// This avoids CSP violations from script-src 'self'.
loader.config({ monaco });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
