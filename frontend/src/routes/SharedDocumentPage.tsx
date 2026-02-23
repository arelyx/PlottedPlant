import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { registerPlantUMLLanguage } from "@/lib/plantuml-monaco";
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accessPublicLink, type PublicDocumentAccess } from "@/lib/shares";
import { api } from "@/lib/api";
import { usePreferencesStore } from "@/stores/preferences";
import { useAuthStore } from "@/stores/auth";
import { duplicateDocument } from "@/lib/documents";

// --- API helpers ---

async function renderSvg(source: string): Promise<{ svg?: string; error?: string }> {
  try {
    const response = await fetch("/api/v1/render/svg", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(api.getAccessToken()
          ? { Authorization: `Bearer ${api.getAccessToken()}` }
          : {}),
      },
      body: JSON.stringify({ source }),
    });
    if (!response.ok) return { error: "Render failed" };
    const svg = await response.text();
    return { svg };
  } catch {
    return { error: "Render request failed" };
  }
}

export function SharedDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { resolvedTheme, preferences } = usePreferencesStore();
  const { user, isInitialized, initialize } = useAuthStore();

  // Attempt to restore auth session from refresh token cookie
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  const [data, setData] = useState<PublicDocumentAccess | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [content, setContent] = useState("");

  // Render state
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [zoom, setZoom] = useState(100);
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load document
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const result = await accessPublicLink(token);
        setData(result);
        setContent(result.document.content);
      } catch {
        setLoadError("This link doesn't exist or has been revoked.");
      }
    })();
  }, [token]);

  // Render pipeline
  const triggerRender = useCallback((source: string) => {
    if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    renderTimeoutRef.current = setTimeout(async () => {
      setRendering(true);
      const result = await renderSvg(source);
      setRendering(false);
      if (result.svg) setSvgContent(result.svg);
    }, 400);
  }, []);

  useEffect(() => {
    if (content) triggerRender(content);
    return () => {
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    };
  }, [content, triggerRender]);

  const handleDuplicate = async () => {
    if (!data) return;
    try {
      const newDoc = await duplicateDocument(data.document.id);
      navigate(`/documents/${newDoc.id}`);
    } catch {
      console.error("Failed to duplicate");
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleExportSvg = () => {
    if (!svgContent || !data) return;
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    downloadBlob(blob, `${data.document.title}.svg`);
  };

  const handleExportPng = async () => {
    if (!content || !data) return;
    try {
      const response = await fetch("/api/v1/render/png", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(api.getAccessToken()
            ? { Authorization: `Bearer ${api.getAccessToken()}` }
            : {}),
        },
        body: JSON.stringify({ source: content }),
      });
      if (!response.ok) return;
      const blob = await response.blob();
      downloadBlob(blob, `${data.document.title}.png`);
    } catch {
      // silently fail
    }
  };

  const handleExportSource = () => {
    if (!content || !data) return;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `${data.document.title}.puml`);
  };

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
        <p className="text-lg text-muted-foreground mb-4">{loadError}</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Go Home
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground">
        Loading...
      </div>
    );
  }

  const isReadOnly = true; // Public links are always viewer-only

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <button
            className="text-sm font-bold hover:opacity-80"
            onClick={() => navigate(user ? "/dashboard" : "/")}
          >
            PlantUML IDE
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">{data.document.title}</span>
          <Badge variant="secondary" className="text-xs">
            View only
          </Badge>
          <span className="text-xs text-muted-foreground">
            Shared by {data.document.owner.display_name}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium rounded-md px-3 h-8 hover:bg-accent hover:text-accent-foreground">
              Export
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportSvg} disabled={!svgContent}>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => user ? handleDuplicate() : navigate("/login")}
          >
            Duplicate
          </Button>
        </div>
      </div>

      {/* Editor + Preview */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={50} minSize={20}>
            <Editor
              height="100%"
              language="plantuml"
              theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
              value={content}
              onMount={(_editor, monaco) => registerPlantUMLLanguage(monaco)}
              onChange={(val) => {
                if (val !== undefined && !isReadOnly) {
                  setContent(val);
                  triggerRender(val);
                }
              }}
              options={{
                readOnly: isReadOnly,
                minimap: { enabled: false },
                fontSize: preferences.editor_font_size,
                lineNumbers: "on",
                wordWrap: preferences.editor_word_wrap ? "on" : "off",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 8 },
              }}
            />
          </Panel>
          <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/20 transition-colors" />
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full flex flex-col bg-muted/30">
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
              <div className="flex-1 overflow-auto p-4">
                {svgContent ? (
                  <div
                    className="inline-block"
                    style={{
                      transform: `scale(${zoom / 100})`,
                      transformOrigin: "top left",
                    }}
                    dangerouslySetInnerHTML={{ __html: svgContent }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    {rendering ? "Rendering..." : "No preview available"}
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
