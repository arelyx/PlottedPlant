import { useCallback, useEffect, useRef } from "react";
import { MergeView } from "@codemirror/merge";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { usePreferencesStore } from "@/stores/preferences";
import { oneDark } from "@codemirror/theme-one-dark";
import type { VersionDiff } from "@/lib/versions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface VersionDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diff: VersionDiff;
}

export function VersionDiffDialog({
  open,
  onOpenChange,
  diff,
}: VersionDiffDialogProps) {
  const { resolvedTheme } = usePreferencesStore();
  const mergeViewRef = useRef<MergeView | null>(null);
  const diffRef = useRef(diff);
  const themeRef = useRef(resolvedTheme);
  diffRef.current = diff;
  themeRef.current = resolvedTheme;

  // Cleanup when dialog closes
  useEffect(() => {
    if (!open && mergeViewRef.current) {
      mergeViewRef.current.destroy();
      mergeViewRef.current = null;
    }
  }, [open]);

  // Callback ref — fires when the container div mounts in the portal
  const containerCallback = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      if (mergeViewRef.current) {
        mergeViewRef.current.destroy();
        mergeViewRef.current = null;
      }
      return;
    }

    // Clear any previous instance
    if (mergeViewRef.current) {
      mergeViewRef.current.destroy();
      mergeViewRef.current = null;
    }

    const d = diffRef.current;
    const themeExtensions =
      themeRef.current === "dark" ? [oneDark] : [];

    const view = new MergeView({
      a: {
        doc: d.base_content,
        extensions: [
          basicSetup,
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": { overflow: "auto" },
          }),
          ...themeExtensions,
        ],
      },
      b: {
        doc: d.compare_content,
        extensions: [
          basicSetup,
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": { overflow: "auto" },
          }),
          ...themeExtensions,
        ],
      },
      parent: node,
    });

    mergeViewRef.current = view;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle>
            Comparing v{diff.base_version} with v{diff.compare_version}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden border-y">
          {open && (
            <div
              ref={containerCallback}
              className="h-full [&_.cm-mergeView]:h-full [&_.cm-mergeViewEditor]:overflow-auto"
            />
          )}
        </div>

        <DialogFooter className="px-6 py-3 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
