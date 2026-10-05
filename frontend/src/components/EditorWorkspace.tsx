import type { ReactNode } from "react";
import type * as Monaco from "monaco-editor";
import { Panel, Group, Separator } from "react-resizable-panels";

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

/** The code editor and diagram preview, side by side with a draggable divider. */
export function EditorWorkspace({ viewMode, editor, preview }: EditorWorkspaceProps) {
  return (
    <Group orientation="horizontal">
      {viewMode !== "preview" && (
        <>
          <Panel defaultSize={50} minSize={20}>
            {editor}
          </Panel>
          {viewMode === "split" && (
            <Separator className="w-1.5 bg-border hover:bg-primary/20 transition-colors" />
          )}
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
