import CodeMirror from "@uiw/react-codemirror";
import { usePreferencesStore } from "@/stores/preferences";
import { plantumlLanguage } from "@/lib/plantuml-lang";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface VersionPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionNumber: number;
  content: string;
  onRestore?: () => void;
}

export function VersionPreviewDialog({
  open,
  onOpenChange,
  versionNumber,
  content,
  onRestore,
}: VersionPreviewDialogProps) {
  const { resolvedTheme } = usePreferencesStore();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle>Version {versionNumber}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden border-y">
          <CodeMirror
            value={content}
            height="100%"
            readOnly
            editable={false}
            theme={resolvedTheme === "dark" ? "dark" : "light"}
            extensions={[plantumlLanguage]}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: false,
            }}
            style={{ height: "100%" }}
          />
        </div>

        <DialogFooter className="px-6 py-3 shrink-0">
          {onRestore && (
            <Button variant="default" onClick={onRestore}>
              Restore This Version
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
