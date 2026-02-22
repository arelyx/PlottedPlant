import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getDocument,
  updateDocument,
  updateDocumentContent,
  type DocumentDetail,
} from "@/lib/documents";

export function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const documentId = Number(id);

  const loadDocument = useCallback(async () => {
    try {
      const data = await getDocument(documentId);
      setDoc(data);
      setContent(data.content);
      setTitle(data.title);
      setError(null);
    } catch {
      setError("Failed to load document. It may have been deleted or you don't have access.");
    }
  }, [documentId]);

  useEffect(() => {
    if (!isNaN(documentId)) {
      loadDocument();
    }
  }, [documentId, loadDocument]);

  // Auto-save content with debounce
  const saveContent = useCallback(
    async (newContent: string) => {
      if (!doc || doc.permission === "viewer") return;
      setSaving(true);
      try {
        const result = await updateDocumentContent(documentId, newContent);
        if (result.created_version) {
          setDoc((prev) =>
            prev ? { ...prev, version_number: result.version_number } : prev
          );
        }
        setLastSaved(new Date().toLocaleTimeString());
      } catch (err) {
        console.error("Failed to save:", err);
      } finally {
        setSaving(false);
      }
    },
    [doc, documentId]
  );

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    // Debounce save by 2 seconds
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveContent(newContent), 2000);
  };

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const handleTitleSave = async () => {
    if (!doc || title.trim() === doc.title) {
      setEditingTitle(false);
      return;
    }
    await updateDocument(documentId, { title: title.trim() });
    setDoc((prev) => (prev ? { ...prev, title: title.trim() } : prev));
    setEditingTitle(false);
  };

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-8 text-center text-muted-foreground">Loading...</div>
    );
  }

  const isReadOnly = doc.permission === "viewer";

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            Back
          </Button>
          {editingTitle ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => e.key === "Enter" && handleTitleSave()}
              className="h-8 w-64"
              autoFocus
            />
          ) : (
            <button
              className="text-sm font-medium hover:underline"
              onClick={() => !isReadOnly && setEditingTitle(true)}
              disabled={isReadOnly}
            >
              {doc.title}
            </button>
          )}
          {isReadOnly && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              Read Only
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {saving && <span>Saving...</span>}
          {lastSaved && !saving && <span>Saved at {lastSaved}</span>}
          <span>v{doc.version_number}</span>
        </div>
      </div>

      {/* Editor — simple textarea, Monaco comes in Step 4 */}
      <textarea
        className="flex-1 w-full p-4 font-mono text-sm bg-background resize-none focus:outline-none"
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        readOnly={isReadOnly}
        spellCheck={false}
        placeholder="@startuml&#10;&#10;@enduml"
      />
    </div>
  );
}
