import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import {
  PLANTUML_EDITOR_OPTIONS,
  plantumlTheme,
  registerPlantUMLLanguage,
} from "@/lib/plantuml-language";
import { engineErrorMarkers } from "@/lib/plantuml-language/monaco/authoring";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DiagramPreview } from "@/components/DiagramPreview";
import {
  EditorWorkspace,
  MOBILE_EDITOR_OPTIONS,
  MoreIcon,
  ViewModeToggle,
  type ViewMode,
} from "@/components/EditorWorkspace";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api";
import { PitchModal } from "@/components/PitchModal";
import {
  renderPreview,
  whenEngineReady,
  isClientEngineReady,
  type RenderErrorInfo,
} from "@/lib/plantuml-client";

// --- Types ---

type RenderError = RenderErrorInfo;

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
  const isMobile = useIsMobile();
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
          // One marker on the text of the failing line, unless the lint already explains it.
          monacoRef.current.editor.setModelMarkers(
            model,
            "plantuml",
            result.error && !result.error.transient
              ? engineErrorMarkers(monacoRef.current, model, result.error)
              : [],
          );
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
    <div className="dark flex flex-col h-dvh bg-background text-foreground">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-2 sm:px-3 py-1.5 border-b bg-background shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/" className="text-sm font-bold hover:opacity-80 shrink-0">
            PlottedPlant
          </Link>
          <span className="text-muted-foreground">/</span>
          {editingTitle ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
              className="h-7 w-40 sm:w-64 text-sm"
              autoFocus
            />
          ) : (
            <button
              className="text-sm font-medium hover:underline truncate min-w-0"
              onClick={() => setEditingTitle(true)}
              title={title}
            >
              {title}
            </button>
          )}
          <Link
            to="/templates"
            className="hidden md:inline text-sm text-muted-foreground hover:text-foreground"
          >
            Templates
          </Link>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />

          <div className="hidden md:flex items-center gap-1">
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

          {/* Phones: the same actions behind one button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="More actions">
                <MoreIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {user ? (
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">Dashboard</Link>
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem asChild>
                    <Link to="/register">Create account</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/login">Sign in</Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem asChild>
                <Link to="/templates">Templates</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowPitch(true)}>Share</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowPitch(true)}>Version history</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Export</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleExportSvg} disabled={!svgContent && !lastGoodSvg}>
                Download SVG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPng}>Download PNG</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportSource}>Download Source (.puml)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Editor + Preview */}
      <div className="flex-1 overflow-hidden">
        <EditorWorkspace
          viewMode={viewMode}
          editor={
            <Editor
              height="100%"
              defaultValue={initialContent}
              language="plantuml"
              theme={plantumlTheme("dark")}
              beforeMount={registerPlantUMLLanguage}
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
                ...PLANTUML_EDITOR_OPTIONS,
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
                ...(isMobile ? MOBILE_EDITOR_OPTIONS : {}),
              }}
            />
          }
          preview={
            <DiagramPreview
              svg={svgContent || lastGoodSvg}
              error={renderError}
              rendering={rendering}
              placeholder="Write some PlantUML to see a preview"
            />
          }
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-3 py-1 border-t text-xs text-muted-foreground bg-background shrink-0">
        <span className="hidden sm:inline">
          Ln {cursorPosition.line}, Col {cursorPosition.column}
        </span>
        <span>{lineCount} lines</span>
        {renderTime !== null && (
          <span className="hidden sm:inline">
            {rendering ? "Rendering..." : `Rendered in ${renderTime}ms`}
          </span>
        )}
      </div>

      {/* Pitch Modal */}
      <PitchModal open={showPitch} onOpenChange={setShowPitch} />
    </div>
  );
}
