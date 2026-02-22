import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  type ShareItem,
  type ShareUser,
  type PublicLink,
  type UserSearchResult,
  getDocumentShares,
  createDocumentShare,
  updateDocumentShare,
  deleteDocumentShare,
  getFolderShares,
  createFolderShare,
  updateFolderShare,
  deleteFolderShare,
  createDocumentPublicLink,
  revokeDocumentPublicLink,
  regenerateDocumentPublicLink,
  createFolderPublicLink,
  revokeFolderPublicLink,
  regenerateFolderPublicLink,
  searchUsers,
} from "@/lib/shares";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: "document" | "folder";
  resourceId: number;
  resourceName: string;
}

export function ShareDialog({
  open,
  onOpenChange,
  resourceType,
  resourceId,
  resourceName,
}: ShareDialogProps) {
  const [owner, setOwner] = useState<ShareUser | null>(null);
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [publicLink, setPublicLink] = useState<PublicLink | null>(null);
  const [loading, setLoading] = useState(true);

  // User search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [newPermission, setNewPermission] = useState("editor");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const loadShares = useCallback(async () => {
    setLoading(true);
    try {
      const data =
        resourceType === "document"
          ? await getDocumentShares(resourceId)
          : await getFolderShares(resourceId);
      setOwner(data.owner);
      setShares(data.shares);
      setPublicLink(data.public_link);
    } catch (err) {
      console.error("Failed to load shares:", err);
    } finally {
      setLoading(false);
    }
  }, [resourceType, resourceId]);

  useEffect(() => {
    if (open) loadShares();
  }, [open, loadShares]);

  // User search debounce
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchUsers(searchQuery);
        // Filter out users already shared with
        const sharedIds = new Set(shares.map((s) => s.user.id));
        if (owner) sharedIds.add(owner.id);
        setSearchResults(results.filter((u) => !sharedIds.has(u.id)));
        setShowResults(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, shares, owner]);

  // Close results on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAddShare = async (user: UserSearchResult) => {
    try {
      if (resourceType === "document") {
        await createDocumentShare(resourceId, user.id, newPermission);
      } else {
        await createFolderShare(resourceId, user.id, newPermission);
      }
      setSearchQuery("");
      setSearchResults([]);
      setShowResults(false);
      loadShares();
    } catch (err) {
      console.error("Failed to add share:", err);
    }
  };

  const handleUpdatePermission = async (
    shareId: number,
    permission: string
  ) => {
    try {
      if (resourceType === "document") {
        await updateDocumentShare(resourceId, shareId, permission);
      } else {
        await updateFolderShare(resourceId, shareId, permission);
      }
      loadShares();
    } catch (err) {
      console.error("Failed to update share:", err);
    }
  };

  const handleRemoveShare = async (shareId: number) => {
    try {
      if (resourceType === "document") {
        await deleteDocumentShare(resourceId, shareId);
      } else {
        await deleteFolderShare(resourceId, shareId);
      }
      loadShares();
    } catch (err) {
      console.error("Failed to remove share:", err);
    }
  };

  const handleTogglePublicLink = async (enabled: boolean) => {
    try {
      if (enabled) {
        const link =
          resourceType === "document"
            ? await createDocumentPublicLink(resourceId, "viewer")
            : await createFolderPublicLink(resourceId, "viewer");
        setPublicLink(link);
      } else {
        if (resourceType === "document") {
          await revokeDocumentPublicLink(resourceId);
        } else {
          await revokeFolderPublicLink(resourceId);
        }
        setPublicLink(null);
      }
    } catch (err) {
      console.error("Failed to toggle public link:", err);
    }
  };

  const handlePublicLinkPermission = async (permission: string) => {
    try {
      const link =
        resourceType === "document"
          ? await createDocumentPublicLink(resourceId, permission)
          : await createFolderPublicLink(resourceId, permission);
      setPublicLink(link);
    } catch (err) {
      console.error("Failed to update link permission:", err);
    }
  };

  const handleRegenerateLink = async () => {
    try {
      const permission = publicLink?.permission || "viewer";
      const link =
        resourceType === "document"
          ? await regenerateDocumentPublicLink(resourceId, permission)
          : await regenerateFolderPublicLink(resourceId, permission);
      setPublicLink(link);
    } catch (err) {
      console.error("Failed to regenerate link:", err);
    }
  };

  const copyLink = () => {
    if (!publicLink) return;
    const url = `${window.location.origin}/share/${publicLink.token}`;
    navigator.clipboard.writeText(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            Share &ldquo;{resourceName}&rdquo;
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Loading...
          </p>
        ) : (
          <div className="space-y-4">
            {/* User search */}
            <div className="relative" ref={resultsRef}>
              <div className="flex gap-2">
                <Input
                  placeholder="Search by username or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 h-9 text-sm"
                />
                <Select value={newPermission} onValueChange={setNewPermission}>
                  <SelectTrigger className="w-24 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {showResults && searchResults.length > 0 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                      onClick={() => handleAddShare(user)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {user.display_name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          @{user.username} &middot; {user.email}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showResults &&
                searchQuery.length >= 2 &&
                searchResults.length === 0 &&
                !searching && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md p-3 text-sm text-muted-foreground text-center">
                    No users found
                  </div>
                )}
            </div>

            {/* Current shares */}
            <div className="space-y-1">
              {/* Owner */}
              {owner && (
                <div className="flex items-center gap-2 py-2 px-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {owner.display_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      @{owner.username}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">Owner</span>
                </div>
              )}

              {/* Shared users */}
              {shares.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center gap-2 py-2 px-1"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {share.user.display_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      @{share.user.username}
                    </div>
                  </div>
                  <Select
                    value={share.permission}
                    onValueChange={(val) =>
                      handleUpdatePermission(share.id, val)
                    }
                  >
                    <SelectTrigger className="w-24 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    className="p-1 rounded hover:bg-accent text-muted-foreground"
                    onClick={() => handleRemoveShare(share.id)}
                    title="Remove"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Public link */}
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Public link</span>
                <Switch
                  checked={publicLink !== null}
                  onCheckedChange={handleTogglePublicLink}
                />
              </div>

              {publicLink && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${window.location.origin}/share/${publicLink.token}`}
                      className="flex-1 h-8 text-xs font-mono bg-muted"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={copyLink}
                    >
                      Copy
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Anyone with the link can
                    </span>
                    <Select
                      value={publicLink.permission}
                      onValueChange={handlePublicLinkPermission}
                    >
                      <SelectTrigger className="w-20 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="editor">edit</SelectItem>
                        <SelectItem value="viewer">view</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground ml-auto"
                      onClick={handleRegenerateLink}
                      title="Generate a new link (old link will stop working)"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
