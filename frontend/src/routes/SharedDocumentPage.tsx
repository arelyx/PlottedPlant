import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import Editor from "@monaco-editor/react";
import {
  PLANTUML_EDITOR_OPTIONS,
  plantumlTheme,
  registerPlantUMLLanguage,
} from "@/lib/plantuml-language";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DiagramPreview } from "@/components/DiagramPreview";
import { EditorWorkspace, MOBILE_EDITOR_OPTIONS, MoreIcon } from "@/components/EditorWorkspace";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { accessPublicLink, duplicatePublicLink, type PublicDocumentAccess } from "@/lib/shares";
import { api } from "@/lib/api";
import { usePreferencesStore } from "@/stores/preferences";
import { useAuthStore } from "@/stores/auth";

// --- API helpers ---

async function renderSvg(source: string): Promise<{ svg?: string; error?: string }> {
  try {
    const response = await api.requestRaw("/render/svg", {
      method: "POST",
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
  const { resolvedTheme, preferences, isLoaded, load } = usePreferencesStore();
  const isMobile = useIsMobile();
  const { user, isInitialized, initialize } = useAuthStore();

  // Attempt to restore auth session from refresh token cookie
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  // Apply the viewer's own preferences (theme, editor settings) once their
  // session is restored — the share page is outside AppLayout, which is where
  // preferences are otherwise loaded.
  useEffect(() => {
    if (user && !isLoaded) {
      load();
    }
  }, [user, isLoaded, load]);

  const [data, setData] = useState<PublicDocumentAccess | null>(null);
  usePageTitle(data?.document.title);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Render state
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
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
    if (!data || !token) return;
    setDuplicateError(null);
    setDuplicating(true);
    try {
      // Token-scoped: public-link viewers have no share row on the source doc,
      // so the standard document duplicate endpoint would 404 for them.
      const newDoc = await duplicatePublicLink(token);
      navigate(`/documents/${newDoc.id}`);
    } catch {
      setDuplicateError("Couldn't duplicate this document. Please try again.");
    } finally {
      setDuplicating(false);
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
      const blob = await api.requestBlob("/render/png", {
        method: "POST",
        body: JSON.stringify({ source: content }),
      });
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
    <div className="flex flex-col h-dvh">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-2 sm:px-4 py-2 border-b bg-background shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            className="text-sm font-bold hover:opacity-80 shrink-0"
            onClick={() => navigate(user ? "/dashboard" : "/")}
          >
            PlottedPlant
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium truncate min-w-0" title={data.document.title}>
            {data.document.title}
          </span>
          <Badge variant="secondary" className="text-xs shrink-0">
            View only
          </Badge>
          <span className="hidden lg:inline text-xs text-muted-foreground whitespace-nowrap">
            Shared by {data.document.owner.display_name}
          </span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger className="hidden md:inline-flex items-center justify-center whitespace-nowrap text-sm font-medium rounded-md px-3 h-8 hover:bg-accent hover:text-accent-foreground">
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
            disabled={duplicating}
            onClick={() => user ? handleDuplicate() : navigate("/login")}
          >
            {duplicating ? "Duplicating…" : "Duplicate"}
          </Button>

          {/* Phones: export and details behind one button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="More actions">
                <MoreIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Shared by {data.document.owner.display_name}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportSvg} disabled={!svgContent}>
                Download SVG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPng}>Download PNG</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportSource}>Download Source (.puml)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {duplicateError && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {duplicateError}
        </div>
      )}

      {/* Editor + Preview */}
      <div className="flex-1 overflow-hidden">
        <EditorWorkspace
          viewMode="split"
          editor={
            <Editor
              height="100%"
              language="plantuml"
              theme={plantumlTheme(resolvedTheme)}
              value={content}
              beforeMount={registerPlantUMLLanguage}
              onChange={(val) => {
                if (val !== undefined && !isReadOnly) {
                  setContent(val);
                  triggerRender(val);
                }
              }}
              options={{
                ...PLANTUML_EDITOR_OPTIONS,
                readOnly: isReadOnly,
                minimap: { enabled: false },
                fontSize: preferences.editor_font_size,
                lineNumbers: "on",
                wordWrap: preferences.editor_word_wrap ? "on" : "off",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 8 },
                ...(isMobile ? MOBILE_EDITOR_OPTIONS : {}),
              }}
            />
          }
          preview={
            <DiagramPreview
              svg={svgContent}
              rendering={rendering}
              placeholder={rendering ? "Rendering..." : "No preview available"}
            />
          }
        />
      </div>
    </div>
  );
}
