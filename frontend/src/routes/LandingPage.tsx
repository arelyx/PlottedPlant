import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { registerPlantUMLLanguage } from "@/lib/plantuml-monaco";
import {
  Panel,
  Group,
  Separator,
} from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api";
import { sanitizeSvg } from "@/lib/sanitize";
import { PitchModal } from "@/components/PitchModal";
import {
  renderPreview,
  whenEngineReady,
  isClientEngineReady,
  type RenderErrorInfo,
} from "@/lib/plantuml-client";

// --- Types ---

type RenderError = RenderErrorInfo;

type ViewMode = "split" | "editor" | "preview";

// --- Constants ---

const SAMPLE_CODE = `@startuml
actor User
participant "Web App" as App
participant "API Server" as API
database "PostgreSQL" as DB
    User -> App : Open diagram
    App -> API : GET /documents/1
    API -> DB : SELECT content
    DB --> API : document data
    API --> App : JSON response
    App --> User : Render editor
@enduml`;

// --- localStorage persistence ---

const LS_CONTENT_KEY = "plottedplant:scratch:content";
const LS_TITLE_KEY = "plottedplant:scratch:title";

function loadSavedContent(): string {
  try {
    return localStorage.getItem(LS_CONTENT_KEY) ?? SAMPLE_CODE;
  } catch {
    return SAMPLE_CODE;
  }
}

function loadSavedTitle(): string {
  try {
    return localStorage.getItem(LS_TITLE_KEY) ?? "Untitled Diagram";
  } catch {
    return "Untitled Diagram";
  }
}

function saveContent(content: string) {
  try {
    localStorage.setItem(LS_CONTENT_KEY, content);
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

function saveTitle(title: string) {
  try {
    localStorage.setItem(LS_TITLE_KEY, title);
  } catch {
    // silently ignore
  }
}

// --- Component ---

export function LandingPage() {
  const { user, isInitialized, initialize } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) initialize();
  }, [isInitialized, initialize]);

  // Title (persisted to localStorage)
  const [title, setTitle] = useState(loadSavedTitle);
  const [editingTitle, setEditingTitle] = useState(false);

  // Editor refs
  const initialContent = useRef(loadSavedContent()).current;
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const contentRef = useRef(initialContent);

  // Render state
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [lastGoodSvg, setLastGoodSvg] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<RenderError | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderTime, setRenderTime] = useState<number | null>(null);
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);

  // View controls
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [zoom, setZoom] = useState(100);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [lineCount, setLineCount] = useState(initialContent.split("\n").length);

  // Pitch modal
  const [showPitch, setShowPitch] = useState(false);

  // Force dark mode on document root so portalled elements (dropdowns, dialogs) inherit it
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, []);

  // --- Render pipeline ---
  const triggerRender = useCallback((source: string) => {
    if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    if (renderAbortRef.current) renderAbortRef.current.abort();

    // In-browser renders skip the network round trip, so a shorter debounce
    // is affordable; the server fallback keeps the original 400ms.
    const debounceMs = isClientEngineReady() ? 200 : 400;
    renderTimeoutRef.current = setTimeout(async () => {
      const abortController = new AbortController();
      renderAbortRef.current = abortController;
      setRendering(true);
      const start = performance.now();

      // Client-side TeaVM render when the engine is ready, server otherwise.
      // The result carries the syntax error too, so no separate check call.
      const result = await renderPreview(source);

      if (abortController.signal.aborted || result.superseded) return;

      const elapsed = Math.round(performance.now() - start);
      setRenderTime(elapsed);
      setRendering(false);

      if (result.svg) {
        setSvgContent(result.svg);
        setLastGoodSvg(result.svg);
        setRenderError(null);
      } else if (result.error) {
        setRenderError(result.error);
      }

      // Set Monaco error markers
      if (monacoRef.current && editorRef.current) {
        const model = editorRef.current.getModel();
        if (model) {
          if (result.error && !result.error.transient) {
            // Clamp to the model's real line range — a reported line past
            // the current line count makes getLineMaxColumn throw.
            const errorLine = Math.min(
              Math.max(result.error.line || 1, 1),
              model.getLineCount(),
            );
            monacoRef.current.editor.setModelMarkers(model, "plantuml", [
              {
                severity: monacoRef.current.MarkerSeverity.Error,
                message: result.error.message,
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
    }, debounceMs);
  }, []);

  // Start downloading the in-browser rendering engine immediately so it's
  // warm by the first debounced render (renders fall back to the server
  // until it's ready), and re-render the current content locally once it
  // arrives so the preview no longer depends on the server path.
  useEffect(() => {
    let active = true;
    whenEngineReady().then((ready) => {
      if (active && ready && contentRef.current) triggerRender(contentRef.current);
    });
    return () => {
      active = false;
    };
  }, [triggerRender]);

  // Initial render (from stored content or sample code)
  useEffect(() => {
    triggerRender(contentRef.current);
    return () => {
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    };
  }, [triggerRender]);

  // Persist title to localStorage when it changes
  useEffect(() => {
    saveTitle(title);
  }, [title]);

  // --- Monaco setup ---
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerPlantUMLLanguage(monaco);

    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({
        line: e.position.lineNumber,
        column: e.position.column,
      });
    });
  };

  // --- Export ---
  const downloadBlob = (blob: Blob, filename: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportFilename = title.trim() || "diagram";

  const handleExportSvg = () => {
    const svg = svgContent || lastGoodSvg;
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    downloadBlob(blob, `${exportFilename}.svg`);
  };

  const handleExportPng = async () => {
    const source = contentRef.current;
    if (!source) return;
    try {
      const blob = await api.requestBlob("/render/png", {
        method: "POST",
        body: JSON.stringify({ source }),
      });
      downloadBlob(blob, `${exportFilename}.png`);
    } catch {
      // silently fail
    }
  };

  const handleExportSource = () => {
    const source = contentRef.current;
    if (!source) return;
    const blob = new Blob([source], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `${exportFilename}.puml`);
  };

  return (
    <div className="dark flex flex-col h-screen bg-background text-foreground">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-background shrink-0">
        <div className="flex items-center gap-2">
          <Link to="/" className="text-sm font-bold hover:opacity-80">
            PlottedPlant
          </Link>
          <span className="text-muted-foreground">/</span>
          {editingTitle ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
              className="h-7 w-64 text-sm"
              autoFocus
            />
          ) : (
            <button
              className="text-sm font-medium hover:underline"
              onClick={() => setEditingTitle(true)}
            >
              {title}
            </button>
          )}
          <Link
            to="/templates"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Templates
          </Link>
        </div>

        <div className="flex items-center gap-1">
          {/* View mode toggle */}
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
            <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium rounded-md px-3 h-8 hover:bg-accent hover:text-accent-foreground">
              Export
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleExportSvg}
                disabled={!svgContent && !lastGoodSvg}
              >
                Download SVG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPng}>
                Download PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportSource}>
                Download Source (.puml)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Share & History → pitch modal */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPitch(true)}
          >
            Share
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPitch(true)}
          >
            History
          </Button>

          {/* Auth links */}
          <div className="ml-1 border-l pl-2 flex items-center gap-1">
            {user ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">Create account</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Editor + Preview */}
      <div className="flex-1 overflow-hidden">
        <Group orientation="horizontal">
          {viewMode !== "preview" && (
            <>
              <Panel defaultSize={50} minSize={20}>
                <Editor
                  height="100%"
                  defaultValue={initialContent}
                  language="plantuml"
                  theme="vs-dark"
                  onMount={handleEditorMount}
                  onChange={(val) => {
                    if (val !== undefined) {
                      contentRef.current = val;
                      setLineCount(val.split("\n").length);
                      saveContent(val);
                      triggerRender(val);
                    }
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: "on",
                    wordWrap: "on",
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
                <Separator className="w-1.5 bg-border hover:bg-primary/20 transition-colors" />
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
                    <span className="ml-auto text-muted-foreground">
                      Rendering...
                    </span>
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
                          <p className="text-xs">
                            Error on line {renderError.line}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="relative min-h-full">
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
                        className={`inline-block transition-opacity ${renderError ? "opacity-40" : ""}`}
                        style={{
                          transform: `scale(${zoom / 100})`,
                          transformOrigin: "top left",
                        }}
                        dangerouslySetInnerHTML={{
                          __html: sanitizeSvg(svgContent || lastGoodSvg || ""),
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
        </Group>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-3 py-1 border-t text-xs text-muted-foreground bg-background shrink-0">
        <span>
          Ln {cursorPosition.line}, Col {cursorPosition.column}
        </span>
        <span>{lineCount} lines</span>
        {renderTime !== null && (
          <span>
            {rendering ? "Rendering..." : `Rendered in ${renderTime}ms`}
          </span>
        )}
      </div>

      {/* Pitch Modal */}
      <PitchModal open={showPitch} onOpenChange={setShowPitch} />
    </div>
  );
}
