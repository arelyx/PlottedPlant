import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  listVersions,
  getVersion,
  getVersionDiff,
  createCheckpoint,
  restoreVersion,
  type VersionListItem,
  type VersionDetail,
  type VersionDiff,
} from "@/lib/versions";

interface VersionHistoryPanelProps {
  documentId: number;
  permission: string;
  onClose: () => void;
  onPreview: (content: string, versionNumber: number) => void;
  onRestore: (content: string) => void;
  onDiff: (diff: VersionDiff | null) => void;
}

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const SOURCE_LABELS: Record<string, string> = {
  auto: "Auto",
  render: "Render",
  manual: "Checkpoint",
  restore: "Restore",
  session_end: "Session End",
};

export function VersionHistoryPanel({
  documentId,
  permission,
  onClose,
  onPreview,
  onRestore,
  onDiff,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<VersionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Compare mode
  const [compareSelection, setCompareSelection] = useState<number[]>([]);

  // Dialogs
  const [showCheckpoint, setShowCheckpoint] = useState(false);
  const [checkpointLabel, setCheckpointLabel] = useState("");
  const [creatingCheckpoint, setCreatingCheckpoint] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);

  const loadVersions = useCallback(async (cursor?: string) => {
    setLoading(true);
    try {
      const res = await listVersions(documentId, cursor);
      if (cursor) {
        setVersions((prev) => [...prev, ...res.items]);
      } else {
        setVersions(res.items);
      }
      setNextCursor(res.next_cursor);
      setHasMore(res.has_more);
    } catch (err) {
      console.error("Failed to load versions:", err);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const handlePreview = async (versionNumber: number) => {
    try {
      const detail = await getVersion(documentId, versionNumber);
      onPreview(detail.content, versionNumber);
    } catch {
      console.error("Failed to load version");
    }
  };

  const handleCompareToggle = (versionNumber: number) => {
    setCompareSelection((prev) => {
      if (prev.includes(versionNumber)) {
        return prev.filter((v) => v !== versionNumber);
      }
      if (prev.length >= 2) {
        return [prev[1], versionNumber];
      }
      return [...prev, versionNumber];
    });
  };

  const handleCompare = async () => {
    if (compareSelection.length !== 2) return;
    const [a, b] = compareSelection.sort((x, y) => x - y);
    try {
      const diff = await getVersionDiff(documentId, a, b);
      onDiff(diff);
    } catch {
      console.error("Failed to load diff");
    }
  };

  const handleCreateCheckpoint = async () => {
    if (!checkpointLabel.trim()) return;
    setCreatingCheckpoint(true);
    try {
      await createCheckpoint(documentId, checkpointLabel.trim());
      setShowCheckpoint(false);
      setCheckpointLabel("");
      loadVersions(); // Refresh list
    } catch {
      console.error("Failed to create checkpoint");
    } finally {
      setCreatingCheckpoint(false);
    }
  };

  const handleRestore = async () => {
    if (restoreTarget === null) return;
    setRestoring(true);
    try {
      const result = await restoreVersion(documentId, restoreTarget);
      onRestore(result.content);
      setShowRestore(false);
      setRestoreTarget(null);
      loadVersions(); // Refresh list
    } catch {
      console.error("Failed to restore version");
    } finally {
      setRestoring(false);
    }
  };

  const isOwner = permission === "owner";

  return (
    <div className="w-72 border-l flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-sm font-medium">Version History</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => setShowCheckpoint(true)}
          >
            Checkpoint
          </Button>
          <button
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            onClick={onClose}
            title="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Compare bar */}
      {compareSelection.length > 0 && (
        <div className="px-3 py-2 border-b bg-muted/50 text-xs space-y-1">
          <p className="text-muted-foreground">
            {compareSelection.length === 2
              ? `Comparing v${Math.min(...compareSelection)} and v${Math.max(...compareSelection)}`
              : `Select one more version to compare`}
          </p>
          <div className="flex gap-1">
            {compareSelection.length === 2 && (
              <Button size="sm" className="text-xs h-6" onClick={handleCompare}>
                Compare
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6"
              onClick={() => {
                setCompareSelection([]);
                onDiff(null);
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {loading && versions.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">
            Loading...
          </p>
        ) : versions.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">
            No versions yet
          </p>
        ) : (
          <div className="divide-y">
            {versions.map((v) => (
              <div
                key={v.version_number}
                className="px-3 py-2 hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-medium">
                    v{v.version_number}
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    {SOURCE_LABELS[v.source] || v.source}
                  </Badge>
                  {v.label && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {v.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-muted-foreground">
                    {v.created_by?.display_name || "System"} ·{" "}
                    <span title={v.created_at}>
                      {relativeTime(v.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <input
                      type="checkbox"
                      className="h-3 w-3"
                      checked={compareSelection.includes(v.version_number)}
                      onChange={() => handleCompareToggle(v.version_number)}
                      title="Select for comparison"
                    />
                    <button
                      className="text-[10px] px-1.5 py-0.5 rounded hover:bg-accent text-muted-foreground"
                      onClick={() => handlePreview(v.version_number)}
                    >
                      View
                    </button>
                    {isOwner && (
                      <button
                        className="text-[10px] px-1.5 py-0.5 rounded hover:bg-accent text-muted-foreground"
                        onClick={() => {
                          setRestoreTarget(v.version_number);
                          setShowRestore(true);
                        }}
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {hasMore && (
              <button
                className="w-full py-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => nextCursor && loadVersions(nextCursor)}
                disabled={loading}
              >
                {loading ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Checkpoint Dialog */}
      <Dialog open={showCheckpoint} onOpenChange={setShowCheckpoint}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Checkpoint</DialogTitle>
            <DialogDescription>
              Name this checkpoint so you can find it later.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={checkpointLabel}
            onChange={(e) => setCheckpointLabel(e.target.value)}
            placeholder="e.g., Before refactor"
            onKeyDown={(e) => e.key === "Enter" && handleCreateCheckpoint()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckpoint(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCheckpoint}
              disabled={!checkpointLabel.trim() || creatingCheckpoint}
            >
              {creatingCheckpoint ? "Creating..." : "Create Checkpoint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog open={showRestore} onOpenChange={setShowRestore}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Version</DialogTitle>
            <DialogDescription>
              Restore to version {restoreTarget}? The current state will be saved
              as a new version first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRestore(false)}>
              Cancel
            </Button>
            <Button onClick={handleRestore} disabled={restoring}>
              {restoring ? "Restoring..." : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
