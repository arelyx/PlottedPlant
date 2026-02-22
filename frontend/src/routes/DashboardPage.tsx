import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  listFolders,
  listDocuments,
  createFolder,
  createDocument,
  renameFolder,
  deleteFolder,
  deleteDocument,
  duplicateDocument,
  updateDocument,
  type FolderItem,
  type DocumentItem,
} from "@/lib/documents";
import { TemplatePickerDialog } from "@/components/TemplatePickerDialog";

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

export function DashboardPage() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);

  // Dialog states
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showRenameFolder, setShowRenameFolder] = useState(false);
  const [renameFolderId, setRenameFolderId] = useState<number | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "folder" | "document"; id: number; name: string } | null>(null);
  const [showMoveDoc, setShowMoveDoc] = useState(false);
  const [moveDocId, setMoveDocId] = useState<number | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [foldersRes, docsRes] = await Promise.all([
        listFolders(),
        listDocuments(
          activeFolderId !== null
            ? { folder_id: String(activeFolderId), search: search || undefined }
            : { search: search || undefined }
        ),
      ]);
      setFolders(foldersRes.items);
      setDocuments(docsRes.items);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, [activeFolderId, search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // --- Actions ---

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim());
    setNewFolderName("");
    setShowNewFolder(false);
    refresh();
  };

  const handleCreateDocument = async (
    content?: string | null,
    title?: string
  ) => {
    const doc = await createDocument({
      folder_id: activeFolderId,
      ...(content ? { content } : {}),
      ...(title ? { title } : {}),
    });
    navigate(`/documents/${doc.id}`);
  };

  const handleRenameFolder = async () => {
    if (!renameFolderId || !renameFolderName.trim()) return;
    await renameFolder(renameFolderId, renameFolderName.trim());
    setShowRenameFolder(false);
    refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "folder") {
      await deleteFolder(deleteTarget.id);
      if (activeFolderId === deleteTarget.id) setActiveFolderId(null);
    } else {
      await deleteDocument(deleteTarget.id);
    }
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
    refresh();
  };

  const handleDuplicate = async (docId: number) => {
    await duplicateDocument(docId);
    refresh();
  };

  const handleMoveDocument = async (docId: number, folderId: number | null) => {
    await updateDocument(docId, { folder_id: folderId });
    setShowMoveDoc(false);
    setMoveDocId(null);
    refresh();
  };

  // --- Filtered data ---

  const standaloneDocuments = documents.filter((d) => d.folder === null);
  const folderDocuments = activeFolderId
    ? documents.filter((d) => d.folder?.id === activeFolderId)
    : [];
  const activeFolder = folders.find((f) => f.id === activeFolderId);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          {activeFolderId ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveFolderId(null)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                My Projects
              </button>
              <span className="text-muted-foreground">/</span>
              <h1 className="text-2xl font-bold">{activeFolder?.name}</h1>
            </div>
          ) : (
            <h1 className="text-2xl font-bold">My Projects</h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          {!activeFolderId && (
            <Button variant="outline" onClick={() => setShowNewFolder(true)}>
              New Folder
            </Button>
          )}
          <Button onClick={() => setShowTemplatePicker(true)}>New Document</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <>
          {/* Folder Detail View */}
          {activeFolderId ? (
            <div>
              {folderDocuments.length === 0 ? (
                <EmptyState
                  message="This folder is empty."
                  action={
                    <Button onClick={() => setShowTemplatePicker(true)}>
                      Create Document
                    </Button>
                  }
                />
              ) : (
                <DocumentList
                  documents={folderDocuments}
                  onOpen={(id) => navigate(`/documents/${id}`)}
                  onDelete={(id, title) => {
                    setDeleteTarget({ type: "document", id, name: title });
                    setShowDeleteConfirm(true);
                  }}
                  onDuplicate={handleDuplicate}
                  onMove={(id) => {
                    setMoveDocId(id);
                    setShowMoveDoc(true);
                  }}
                />
              )}
            </div>
          ) : (
            <>
              {/* Folders Section */}
              {folders.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-sm font-medium text-muted-foreground mb-3">
                    Folders
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {folders.map((folder) => (
                      <FolderCard
                        key={folder.id}
                        folder={folder}
                        onClick={() => setActiveFolderId(folder.id)}
                        onRename={() => {
                          setRenameFolderId(folder.id);
                          setRenameFolderName(folder.name);
                          setShowRenameFolder(true);
                        }}
                        onDelete={() => {
                          setDeleteTarget({
                            type: "folder",
                            id: folder.id,
                            name: folder.name,
                          });
                          setShowDeleteConfirm(true);
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Standalone Documents Section */}
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-3">
                  Documents
                </h2>
                {standaloneDocuments.length === 0 && folders.length === 0 ? (
                  <EmptyState
                    message="No diagrams yet. Create your first PlantUML diagram to get started."
                    action={
                      <Button onClick={() => setShowTemplatePicker(true)}>
                        Create Your First Document
                      </Button>
                    }
                  />
                ) : standaloneDocuments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No standalone documents.
                  </p>
                ) : (
                  <DocumentList
                    documents={standaloneDocuments}
                    onOpen={(id) => navigate(`/documents/${id}`)}
                    onDelete={(id, title) => {
                      setDeleteTarget({ type: "document", id, name: title });
                      setShowDeleteConfirm(true);
                    }}
                    onDuplicate={handleDuplicate}
                    onMove={(id) => {
                      setMoveDocId(id);
                      setShowMoveDoc(true);
                    }}
                  />
                )}
              </section>
            </>
          )}
        </>
      )}

      {/* New Folder Dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Enter a name for the new folder.</DialogDescription>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolder(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={showRenameFolder} onOpenChange={setShowRenameFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <Input
            value={renameFolderName}
            onChange={(e) => setRenameFolderName(e.target.value)}
            placeholder="Folder name"
            onKeyDown={(e) => e.key === "Enter" && handleRenameFolder()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameFolder(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameFolder} disabled={!renameFolderName.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {deleteTarget?.type === "folder" ? "Folder" : "Document"}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === "folder"
                ? `This will permanently delete the folder "${deleteTarget.name}" and all documents within it. This action cannot be undone.`
                : `This will permanently delete "${deleteTarget?.name}". This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Picker Dialog */}
      <TemplatePickerDialog
        open={showTemplatePicker}
        onOpenChange={setShowTemplatePicker}
        onSelect={(content, title) => {
          setShowTemplatePicker(false);
          handleCreateDocument(content, title);
        }}
      />

      {/* Move to Folder Dialog */}
      <Dialog open={showMoveDoc} onOpenChange={setShowMoveDoc}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Folder</DialogTitle>
            <DialogDescription>
              Select a destination folder or move to the workspace root.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            <button
              className="w-full text-left px-3 py-2 rounded hover:bg-accent text-sm"
              onClick={() => moveDocId && handleMoveDocument(moveDocId, null)}
            >
              Workspace Root (no folder)
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                className="w-full text-left px-3 py-2 rounded hover:bg-accent text-sm"
                onClick={() => moveDocId && handleMoveDocument(moveDocId, f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Sub-components ---

function FolderCard({
  folder,
  onClick,
  onRename,
  onDelete,
}: {
  folder: FolderItem;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0">
        <svg
          className="h-5 w-5 text-muted-foreground shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
          />
        </svg>
        <div className="min-w-0">
          <p className="font-medium truncate">{folder.name}</p>
          <p className="text-xs text-muted-foreground">
            {folder.document_count} document{folder.document_count !== 1 ? "s" : ""} · {relativeTime(folder.updated_at)}
          </p>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
            </svg>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DocumentList({
  documents,
  onOpen,
  onDelete,
  onDuplicate,
  onMove,
}: {
  documents: DocumentItem[];
  onOpen: (id: number) => void;
  onDelete: (id: number, title: string) => void;
  onDuplicate: (id: number) => void;
  onMove: (id: number) => void;
}) {
  return (
    <div className="space-y-1">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer group"
          onClick={() => onOpen(doc.id)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <svg
              className="h-5 w-5 text-muted-foreground shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{doc.title}</p>
                {doc.permission !== "owner" && (
                  <Badge variant="secondary" className="text-xs">
                    {doc.permission}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {doc.last_edited_by
                  ? `Edited by ${doc.last_edited_by.display_name} · `
                  : ""}
                {relativeTime(doc.updated_at)}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onOpen(doc.id)}>Open</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(doc.id)}>
                Duplicate
              </DropdownMenuItem>
              {doc.permission === "owner" && (
                <>
                  <DropdownMenuItem onClick={() => onMove(doc.id)}>
                    Move to folder
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onDelete(doc.id, doc.title)}
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  message,
  action,
}: {
  message: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg
        className="h-16 w-16 text-muted-foreground/50 mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
      <p className="text-muted-foreground mb-4">{message}</p>
      {action}
    </div>
  );
}
