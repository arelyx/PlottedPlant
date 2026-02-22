import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getDocument,
  updateDocument,
  type DocumentDetail,
} from "@/lib/documents";
import { api } from "@/lib/api";
import { usePreferencesStore } from "@/stores/preferences";
import { useAuthStore } from "@/stores/auth";
import { VersionHistoryPanel } from "@/components/VersionHistoryPanel";
import { ShareDialog } from "@/components/ShareDialog";
import {
  createCollaborationSession,
  bindMonacoEditor,
  type CollaborationSession,
  type ConnectionStatus,
  type CollaboratorInfo,
} from "@/lib/collaboration";

// --- Types ---

interface RenderError {
  message: string;
  line?: number;
}

type ViewMode = "split" | "editor" | "preview";

// --- API helpers ---

async function renderSvg(source: string): Promise<{ svg?: string; error?: RenderError }> {
  try {
    const response = await fetch("/api/v1/render/svg", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api.getAccessToken()}`,
      },
      body: JSON.stringify({ source }),
    });

    if (response.status === 422) {
      const data = await response.json();
      return { error: data.detail?.error || data.error || { message: "Syntax error" } };
    }

    if (!response.ok) throw new Error("Render failed");
    const svg = await response.text();
    return { svg };
  } catch {
    return { error: { message: "Render request failed" } };
  }
}

async function checkSyntax(source: string): Promise<{ valid: boolean; error?: RenderError }> {
  try {
    const data = await api.request<{ valid: boolean; error?: RenderError }>("/render/check", {
      method: "POST",
      body: JSON.stringify({ source }),
    });
    return data;
  } catch {
    return { valid: true }; // Don't block on check errors
  }
}

// --- Component ---

export function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const documentId = Number(id);
  const { preferences, resolvedTheme } = usePreferencesStore();
  const authUser = useAuthStore((s) => s.user);

  // Document state
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Collaboration state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>([]);
  const collabSessionRef = useRef<CollaborationSession | null>(null);
  const syncedRef = useRef(false);

  // Content ref — tracks Y.Text value for rendering and export
  const contentRef = useRef("");

  // Render state
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [lastGoodSvg, setLastGoodSvg] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<RenderError | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderTime, setRenderTime] = useState<number | null>(null);
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);

  // History state
  const [showHistory, setShowHistory] = useState(false);

  // Share state
  const [showShare, setShowShare] = useState(false);

  // Save status — tracks whether local changes have been persisted
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRefreshRef = useRef(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Editor state
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [zoom, setZoom] = useState(100);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [lineCount, setLineCount] = useState(1);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  // --- Load document metadata ---
  const loadDocument = useCallback(async () => {
    try {
      const data = await getDocument(documentId);
      setDoc(data);
      setTitle(data.title);
      setLoadError(null);
    } catch {
      setLoadError("Failed to load document.");
    }
  }, [documentId]);

  useEffect(() => {
    if (!isNaN(documentId)) loadDocument();
  }, [documentId, loadDocument]);

  // --- Render pipeline ---
  const triggerRender = useCallback(
    (source: string) => {
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
      if (renderAbortRef.current) renderAbortRef.current.abort();

      renderTimeoutRef.current = setTimeout(async () => {
        const abortController = new AbortController();
        renderAbortRef.current = abortController;
        setRendering(true);
        const start = performance.now();

        // Parallel: render SVG + syntax check
        const [renderResult, checkResult] = await Promise.all([
          renderSvg(source),
          checkSyntax(source),
        ]);

        if (abortController.signal.aborted) return;

        const elapsed = Math.round(performance.now() - start);
        setRenderTime(elapsed);
        setRendering(false);

        if (renderResult.svg) {
          setSvgContent(renderResult.svg);
          setLastGoodSvg(renderResult.svg);
          setRenderError(null);
        } else if (renderResult.error) {
          setRenderError(renderResult.error);
        }

        // Set Monaco error markers
        if (monacoRef.current && editorRef.current) {
          const model = editorRef.current.getModel();
          if (model) {
            if (!checkResult.valid && checkResult.error) {
              const errorLine = checkResult.error.line || 1;
              monacoRef.current.editor.setModelMarkers(model, "plantuml", [
                {
                  severity: monacoRef.current.MarkerSeverity.Error,
                  message: checkResult.error.message,
                  startLineNumber: errorLine,
                  startColumn: 1,
                  endLineNumber: errorLine,
                  endColumn: model.getLineMaxColumn(errorLine),
                },
              ]);
            } else {
              monacoRef.current.editor.setModelMarkers(model, "plantuml", []);
            }
          }
        }
      }, 400); // 400ms debounce
    },
    []
  );

  // --- Collaboration session ---
  useEffect(() => {
    if (!doc || !authUser || isNaN(documentId)) return;

    syncedRef.current = false;

    const session = createCollaborationSession(
      documentId,
      { id: authUser.id, name: authUser.display_name },
      doc.permission,
      {
        onStatus(status) {
          setConnectionStatus(status);
        },
        onCollaborators(collabs) {
          setCollaborators(collabs);
        },
        onSynced() {
          syncedRef.current = true;

          // Trigger initial render from Y.Text content
          const text = session.ytext.toString();
          if (text) {
            contentRef.current = text;
            setLineCount(text.split("\n").length);
            triggerRender(text);
          }

          // Bind to Monaco editor now that Y.Text has content from the server.
          // Deferring until onSynced avoids binding to an empty Y.Text which
          // would clear the editor via monacoModel.setValue("").
          if (editorRef.current && !session.binding) {
            bindMonacoEditor(session, editorRef.current);
          }
        },
      },
    );

    collabSessionRef.current = session;

    // Observe Y.Text changes for render pipeline + save status
    let isFirstSync = true;
    const ytextObserver = () => {
      const text = session.ytext.toString();
      contentRef.current = text;
      setLineCount(text.split("\n").length);
      triggerRender(text);

      // Skip the initial sync (loading content from server)
      if (isFirstSync) {
        isFirstSync = false;
        return;
      }

      // Mark as "saving" — server debounce is 2s, add margin for network
      setSaveStatus("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus("saved");
        // Bump history refresh key so panel re-fetches
        historyRefreshRef.current += 1;
        setHistoryRefreshKey(historyRefreshRef.current);
      }, 3500); // 2s server debounce + 1.5s margin
    };
    session.ytext.observe(ytextObserver);

    return () => {
      session.ytext.unobserve(ytextObserver);
      session.destroy();
      collabSessionRef.current = null;
      syncedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [doc, authUser, documentId, triggerRender]);

  // Cleanup render timeout on unmount
  useEffect(() => {
    return () => {
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    };
  }, []);

  // --- Monaco setup ---
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register PlantUML language if not already registered
    if (!monaco.languages.getLanguages().some((l) => l.id === "plantuml")) {
      monaco.languages.register({ id: "plantuml" });
      monaco.languages.setMonarchTokensProvider("plantuml", {
        tokenizer: {
          root: [
            [/@(startuml|enduml|startmindmap|endmindmap|startsalt|endsalt|startgantt|endgantt|startjson|endjson|startyaml|endyaml)/, "keyword"],
            [/\b(participant|actor|boundary|control|entity|database|collections|queue)\b/, "keyword"],
            [/\b(as|order|of|on|is|if|else|elseif|endif|while|endwhile|repeat|backward|end|fork|again|kill|return|stop|start|detach)\b/, "keyword"],
            [/\b(note|end note|rnote|hnote|ref|over|legend|end legend|header|footer|title|caption|newpage)\b/, "keyword"],
            [/\b(class|interface|enum|abstract|annotation|package|namespace|together|set|show|hide|remove|skinparam|style|sprite)\b/, "keyword"],
            [/\b(left|right|up|down|top|bottom|center)\b/, "keyword"],
            [/\b(activate|deactivate|create|destroy|return|autonumber)\b/, "keyword"],
            [/\b(state|partition|rectangle|node|folder|frame|cloud|component|usecase|artifact|storage|file|card|hexagon|diamond|circle|label)\b/, "keyword"],
            [/\b(group|box|loop|alt|opt|break|par|critical|section)\b/, "keyword"],
            [/'.*$/, "comment"],
            [/\/'.*/,  "comment"],
            [/\-+[>|*ox]+/, "operator"],
            [/<[>|*ox]?\-+/, "operator"],
            [/\.[>|*ox]+/, "operator"],
            [/<[>|*ox]?\.+/, "operator"],
            [/\~+[>|*ox]+/, "operator"],
            [/#[a-fA-F0-9]{6}\b/, "number"],
            [/#\w+/, "number"],
            [/"[^"]*"/, "string"],
            [/![a-z]+/, "tag"],
          ],
        },
      });
    }

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({ line: e.position.lineNumber, column: e.position.column });
    });

    // Ctrl+Shift+H to toggle history panel
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyH,
      () => setShowHistory((prev) => !prev)
    );

    // Bind y-monaco to the editor only if the collaboration session has
    // already synced. If not synced yet, the onSynced callback will create
    // the binding once Y.Text has content from the server.
    const session = collabSessionRef.current;
    if (session && !session.binding && syncedRef.current) {
      bindMonacoEditor(session, editor);
    }
  };

  // --- Title ---
  const handleTitleSave = async () => {
    if (!doc || title.trim() === doc.title) {
      setEditingTitle(false);
      return;
    }
    await updateDocument(documentId, { title: title.trim() });
    setDoc((prev) => (prev ? { ...prev, title: title.trim() } : prev));
    setEditingTitle(false);
  };

  // --- Export ---
  const handleExport = async (format: string) => {
    const url = `/api/v1/documents/${documentId}/export/${format}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${api.getAccessToken()}` },
      credentials: "include",
    });
    if (!response.ok) return;

    const blob = await response.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const ext = format === "source" ? "puml" : format;
    a.download = `${doc?.title || "diagram"}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // --- Error / loading states ---
  if (loadError) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground mb-4">{loadError}</p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (!doc) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  const isReadOnly = doc.permission === "viewer";

  // Connection status indicator
  const statusLabel =
    connectionStatus === "connected"
      ? "Connected"
      : connectionStatus === "connecting"
        ? "Connecting..."
        : "Disconnected";
  const statusColor =
    connectionStatus === "connected"
      ? "bg-green-500"
      : connectionStatus === "connecting"
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-background shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            Projects
          </Button>
          <span className="text-muted-foreground">/</span>
          {editingTitle ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => e.key === "Enter" && handleTitleSave()}
              className="h-7 w-64 text-sm"
              autoFocus
            />
          ) : (
            <button
              className="text-sm font-medium hover:underline"
              onClick={() => !isReadOnly && setEditingTitle(true)}
            >
              {doc.title}
            </button>
          )}
          {isReadOnly && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              Read Only
            </span>
          )}

          {/* Collaborator indicators */}
          {collaborators.length > 0 && (
            <div className="flex items-center gap-0.5 ml-2">
              {collaborators.slice(0, 5).map((c) => (
                <div
                  key={c.clientId}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: c.user.color }}
                  title={`${c.user.name}${c.permission === "viewer" ? " (viewing)" : ""}`}
                >
                  {c.user.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {collaborators.length > 5 && (
                <span className="text-xs text-muted-foreground ml-1">
                  +{collaborators.length - 5}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* View mode buttons */}
          <div className="flex border rounded-md">
            <button
              className={`px-2 py-1 text-xs ${viewMode === "editor" ? "bg-accent" : ""}`}
              onClick={() => setViewMode("editor")}
              title="Editor only"
            >
              Code
            </button>
            <button
              className={`px-2 py-1 text-xs border-x ${viewMode === "split" ? "bg-accent" : ""}`}
              onClick={() => setViewMode("split")}
              title="Split view"
            >
              Split
            </button>
            <button
              className={`px-2 py-1 text-xs ${viewMode === "preview" ? "bg-accent" : ""}`}
              onClick={() => setViewMode("preview")}
              title="Preview only"
            >
              Preview
            </button>
          </div>

          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("svg")}>
                Download SVG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("png")}>
                Download PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("pdf")}>
                Download PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport("source")}>
                Download Source (.puml)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => navigator.clipboard.writeText(contentRef.current)}
              >
                Copy Source
              </DropdownMenuItem>
              {svgContent && (
                <DropdownMenuItem
                  onClick={() => navigator.clipboard.writeText(svgContent)}
                >
                  Copy SVG
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {doc.permission === "owner" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowShare(true)}
            >
              Share
            </Button>
          )}

          {!isReadOnly && (
            <Button
              variant={showHistory ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowHistory((prev) => !prev)}
            >
              History
            </Button>
          )}
        </div>
      </div>

      {/* Main content area: editor/preview + optional history panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor + Preview */}
        <div className="flex-1 overflow-hidden">
          <PanelGroup direction="horizontal">
            {viewMode !== "preview" && (
              <>
                <Panel defaultSize={50} minSize={20}>
                  <Editor
                    height="100%"
                    language="plantuml"
                    theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
                    onMount={handleEditorMount}
                    options={{
                      readOnly: isReadOnly,
                      minimap: { enabled: preferences.editor_minimap },
                      fontSize: preferences.editor_font_size,
                      lineNumbers: "on",
                      wordWrap: preferences.editor_word_wrap ? "on" : "off",
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      tabSize: 2,
                      renderLineHighlight: "line",
                      bracketPairColorization: { enabled: true },
                      padding: { top: 8 },
                    }}
                  />
                </Panel>
                {viewMode === "split" && (
                  <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/20 transition-colors" />
                )}
              </>
            )}
              {viewMode !== "editor" && (
                <Panel defaultSize={50} minSize={20}>
                  <div className="h-full flex flex-col bg-muted/30">
                    {/* Preview toolbar */}
                    <div className="flex items-center gap-1 px-2 py-1 border-b text-xs">
                      <button
                        className="px-2 py-0.5 rounded hover:bg-accent"
                        onClick={() => setZoom((z) => Math.min(z + 25, 400))}
                      >
                        +
                      </button>
                      <span className="min-w-[3rem] text-center">{zoom}%</span>
                      <button
                        className="px-2 py-0.5 rounded hover:bg-accent"
                        onClick={() => setZoom((z) => Math.max(z - 25, 25))}
                      >
                        -
                      </button>
                      <button
                        className="px-2 py-0.5 rounded hover:bg-accent ml-1"
                        onClick={() => setZoom(100)}
                      >
                        Reset
                      </button>
                      {rendering && (
                        <span className="ml-auto text-muted-foreground">Rendering...</span>
                      )}
                    </div>

                    {/* Preview content */}
                    <div className="flex-1 overflow-auto p-4">
                      {renderError && !lastGoodSvg ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center text-muted-foreground">
                            <p className="text-sm font-medium text-destructive mb-1">
                              {renderError.message}
                            </p>
                            {renderError.line && (
                              <p className="text-xs">Error on line {renderError.line}</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="relative flex items-start justify-center min-h-full">
                          {renderError && lastGoodSvg && (
                            <div className="absolute top-2 left-2 right-2 z-10 bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 text-xs">
                              <span className="text-destructive font-medium">
                                {renderError.message}
                              </span>
                              {renderError.line && (
                                <span className="text-muted-foreground ml-2">
                                  Line {renderError.line}
                                </span>
                              )}
                            </div>
                          )}
                          <div
                            className={`transition-opacity ${renderError ? "opacity-40" : ""}`}
                            style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
                            dangerouslySetInnerHTML={{
                              __html: svgContent || lastGoodSvg || "",
                            }}
                          />
                          {!svgContent && !lastGoodSvg && !rendering && (
                            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                              Write some PlantUML to see a preview
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Panel>
              )}
          </PanelGroup>
        </div>

        {/* Version History Panel */}
        {showHistory && (
          <VersionHistoryPanel
            documentId={documentId}
            permission={doc.permission}
            refreshKey={historyRefreshKey}
            onClose={() => setShowHistory(false)}
            onRestore={(restoredContent) => {
              // After REST restore, Hocuspocus receives force-content
              // The Y.Text will be updated server-side, which triggers observer
              triggerRender(restoredContent);
            }}
          />
        )}
      </div>

      {/* Share Dialog */}
      <ShareDialog
        open={showShare}
        onOpenChange={setShowShare}
        resourceType="document"
        resourceId={documentId}
        resourceName={doc.title}
      />

      {/* Status bar */}
      <div className="flex items-center gap-4 px-3 py-1 border-t text-xs text-muted-foreground bg-background shrink-0">
        <span>
          Ln {cursorPosition.line}, Col {cursorPosition.column}
        </span>
        <span>{lineCount} lines</span>
        {renderTime !== null && (
          <span>{rendering ? "Rendering..." : `Rendered in ${renderTime}ms`}</span>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className={saveStatus === "saving" ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400"}>
            {saveStatus === "saving" ? "Saving..." : "Saved"}
          </span>
          <span className="text-muted-foreground">|</span>
          {collaborators.length > 0 && (
            <span>{collaborators.length + 1} users</span>
          )}
          <span className={`inline-block w-2 h-2 rounded-full ${statusColor}`} />
          <span>{statusLabel}</span>
        </div>
      </div>
    </div>
  );
}
