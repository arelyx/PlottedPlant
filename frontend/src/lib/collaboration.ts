import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { MonacoBinding } from "y-monaco";
import type * as Monaco from "monaco-editor";
import { api } from "./api";

// Cursor color palette — 12 colors for up to 12 simultaneous collaborators
export const CURSOR_COLORS = [
  { color: "#E06C75", light: "#E06C7533" }, // Red
  { color: "#61AFEF", light: "#61AFEF33" }, // Blue
  { color: "#98C379", light: "#98C37933" }, // Green
  { color: "#D19A66", light: "#D19A6633" }, // Orange
  { color: "#C678DD", light: "#C678DD33" }, // Purple
  { color: "#56B6C2", light: "#56B6C233" }, // Cyan
  { color: "#E5C07B", light: "#E5C07B33" }, // Yellow
  { color: "#BE5046", light: "#BE504633" }, // Dark Red
  { color: "#7EC8E3", light: "#7EC8E333" }, // Light Blue
  { color: "#C3E88D", light: "#C3E88D33" }, // Lime
  { color: "#F78C6C", light: "#F78C6C33" }, // Salmon
  { color: "#A9B2C3", light: "#A9B2C333" }, // Silver
] as const;

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface CollaboratorInfo {
  clientId: number;
  user: {
    id: number;
    name: string;
    color: string;
    colorLight: string;
  };
  permission?: string;
}

/**
 * Pick the first available cursor color not currently used by other collaborators.
 */
function pickColor(usedColors: Set<string>): (typeof CURSOR_COLORS)[number] {
  for (const c of CURSOR_COLORS) {
    if (!usedColors.has(c.color)) return c;
  }
  // All in use — cycle back to first
  return CURSOR_COLORS[0];
}

// --- Dynamic CSS injection for remote cursor colors & name labels ---

const CURSOR_STYLE_ID = "yjs-remote-cursors";

/**
 * Inject/update a <style> element with per-collaborator CSS rules for
 * y-monaco's remote selection and cursor-head decorations.
 */
function updateRemoteCursorStyles(
  awareness: { getStates: () => Map<number, Record<string, unknown>> },
  localClientId: number,
): void {
  let styleEl = document.getElementById(CURSOR_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = CURSOR_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  let css = "";
  awareness.getStates().forEach((state, clientID) => {
    if (clientID === localClientId) return;
    const user = state.user as
      | { color?: string; colorLight?: string; name?: string }
      | undefined;
    if (!user?.color) return;

    const bg = user.colorLight || user.color + "33";
    const name = (user.name || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    css += `.yRemoteSelection-${clientID}{background-color:${bg}}`;
    css += `.yRemoteSelectionHead-${clientID}{border-left:2px solid ${user.color}}`;
    css += `.yRemoteSelectionHead-${clientID}::after{content:"${name}";background-color:${user.color}}`;
  });

  styleEl.textContent = css;
}

function removeRemoteCursorStyles(): void {
  document.getElementById(CURSOR_STYLE_ID)?.remove();
}

export interface CollaborationSession {
  provider: HocuspocusProvider;
  ydoc: Y.Doc;
  ytext: Y.Text;
  binding: MonacoBinding | null;
  destroy: () => void;
}

/**
 * Create a collaboration session for a document.
 * Connects to Hocuspocus, sets up Yjs Y.Doc, and prepares for Monaco binding.
 */
export function createCollaborationSession(
  documentId: number,
  user: { id: number; name: string },
  permission: string,
  callbacks: {
    onStatus?: (status: ConnectionStatus) => void;
    onCollaborators?: (collaborators: CollaboratorInfo[]) => void;
    onSynced?: () => void;
    onAuthenticationFailed?: (reason: string) => void;
    onDisconnectedAfterSync?: () => void;
  } = {},
): CollaborationSession {
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText("monaco");

  // Track whether this session has ever successfully synced.
  // Used to detect reconnections with stale CRDT state.
  let wasSynced = false;

  // Determine WebSocket URL
  // Nginx routes /collaboration to Hocuspocus upstream
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${window.location.host}/collaboration`;

  const provider = new HocuspocusProvider({
    url: wsUrl,
    name: documentId.toString(),
    document: ydoc,
    token: () => api.getAccessToken() || "",
    onStatus({ status }) {
      callbacks.onStatus?.(status as ConnectionStatus);

      if (status === "disconnected" && wasSynced) {
        // CRITICAL: Prevent auto-reconnect with stale Y.Doc state.
        //
        // When the WebSocket drops, the server destroys the room (after the
        // last client disconnects). If HocuspocusProvider auto-reconnects,
        // the server creates a new room and inserts DB content into a fresh
        // Y.Text via onLoadDocument. Meanwhile, the client still holds the
        // old Y.Doc with prior operations. Yjs CRDT merge treats both sets
        // of operations as concurrent insertions, DOUBLING the content.
        //
        // By calling disconnect() we cancel the provider's reconnect timer.
        // The parent component (DocumentPage) will detect this via the
        // onDisconnectedAfterSync callback and recreate the entire session
        // with a fresh Y.Doc, eliminating the stale state.
        queueMicrotask(() => provider.disconnect());
        callbacks.onDisconnectedAfterSync?.();
      }
    },
    onSynced() {
      wasSynced = true;
      callbacks.onSynced?.();
    },
    onAuthenticationFailed({ reason }) {
      callbacks.onAuthenticationFailed?.(reason);
    },
    onAwarenessUpdate({ states }) {
      const collaborators: CollaboratorInfo[] = [];
      states.forEach((state: Record<string, unknown>, clientId: number) => {
        if (state.user && clientId !== ydoc.clientID) {
          collaborators.push({
            clientId,
            user: state.user as CollaboratorInfo["user"],
            permission: state.permission as string | undefined,
          });
        }
      });
      callbacks.onCollaborators?.(collaborators);
    },
  });

  // Pick a cursor color based on what's already in use
  const usedColors = new Set<string>();
  provider.awareness?.getStates().forEach((state: Record<string, unknown>) => {
    const u = state.user as { color?: string } | undefined;
    if (u?.color) usedColors.add(u.color);
  });
  const myColor = pickColor(usedColors);

  // Set local awareness state
  provider.awareness?.setLocalState({
    user: {
      id: user.id,
      name: user.name,
      color: myColor.color,
      colorLight: myColor.light,
    },
    permission,
  });

  // Wire up dynamic CSS injection for remote cursor styles
  const awarenessChangeHandler = () => {
    if (provider.awareness) {
      updateRemoteCursorStyles(provider.awareness, ydoc.clientID);
    }
  };
  provider.awareness?.on("change", awarenessChangeHandler);

  let binding: MonacoBinding | null = null;

  const session: CollaborationSession = {
    provider,
    ydoc,
    ytext,
    binding,
    destroy() {
      if (session.binding) {
        session.binding.destroy();
        session.binding = null;
      }
      provider.awareness?.off("change", awarenessChangeHandler);
      removeRemoteCursorStyles();
      provider.destroy();
      ydoc.destroy();
    },
  };

  return session;
}

/**
 * Bind the Y.Text to a Monaco editor instance. Call after the editor is mounted.
 */
export function bindMonacoEditor(
  session: CollaborationSession,
  editor: Monaco.editor.IStandaloneCodeEditor,
): MonacoBinding {
  const model = editor.getModel();
  if (!model) throw new Error("Monaco editor has no model");

  const binding = new MonacoBinding(
    session.ytext,
    model,
    new Set([editor]),
    session.provider.awareness ?? undefined,
  );
  session.binding = binding;
  return binding;
}
