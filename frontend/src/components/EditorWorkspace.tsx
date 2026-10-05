import type { ReactNode } from "react";
import type * as Monaco from "monaco-editor";
import { Panel, Group, Separator } from "react-resizable-panels";
import { useIsMobile } from "@/hooks/useMediaQuery";

export type ViewMode = "editor" | "split" | "preview";

/**
 * Editor options for narrow screens: a slimmer gutter leaves more room for
 * code, and wrapping avoids sideways scrolling inside the editor.
 */
export const MOBILE_EDITOR_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  lineNumbersMinChars: 2,
  lineDecorationsWidth: 6,
  glyphMargin: false,
  folding: false,
  wordWrap: "on",
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
};

interface EditorWorkspaceProps {
  viewMode: ViewMode;
  editor: ReactNode;
  preview: ReactNode;
}

/**
 * The code editor and diagram preview with a draggable divider: side by side
 * on wide screens, stacked (code above, diagram below) on phones.
 */
export function EditorWorkspace({ viewMode, editor, preview }: EditorWorkspaceProps) {
  const stacked = useIsMobile();
  return (
    <Group orientation={stacked ? "vertical" : "horizontal"}>
      {viewMode !== "preview" && (
        <>
          <Panel defaultSize={50} minSize={20}>
            {editor}
          </Panel>
          {viewMode === "split" &&
            (stacked ? (
              // A taller handle with a grip: a 6px line is hard to grab with a finger.
              <Separator className="flex h-4 items-center justify-center border-y bg-muted touch-none">
                <span className="h-1 w-10 rounded-full bg-muted-foreground/40" />
              </Separator>
            ) : (
              <Separator className="w-1.5 bg-border hover:bg-primary/20 transition-colors" />
            ))}
        </>
      )}
      {viewMode !== "editor" && (
        <Panel defaultSize={50} minSize={20}>
          {preview}
        </Panel>
      )}
    </Group>
  );
}

const MODES: { mode: ViewMode; label: string; title: string }[] = [
  { mode: "editor", label: "Code", title: "Editor only" },
  { mode: "split", label: "Split", title: "Split view" },
  { mode: "preview", label: "Preview", title: "Preview only" },
];

/** Code / Split / Preview segmented control. */
export function ViewModeToggle({
  viewMode,
  onChange,
  className = "",
}: {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}) {
  return (
    <div className={`flex border rounded-md ${className}`}>
      {MODES.map(({ mode, label, title }) => (
        <button
          key={mode}
          className={`px-2 py-1 pointer-coarse:py-1.5 text-xs ${mode === "split" ? "border-x" : ""} ${
            viewMode === mode ? "bg-accent" : ""
          }`}
          onClick={() => onChange(mode)}
          title={title}
          aria-pressed={viewMode === mode}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Three-dot button for toolbar overflow menus. */
export function MoreIcon() {
  return (
    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
      />
    </svg>
  );
}
