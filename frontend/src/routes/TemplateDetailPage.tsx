import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getTemplatePreviewUrl } from "@/lib/templates";
import { createDocument, listFolders, type FolderItem } from "@/lib/documents";
import { useAuthStore } from "@/stores/auth";
import { PitchModal } from "@/components/PitchModal";
import templateData from "@/data/templates.json";

export function TemplateDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [showPitch, setShowPitch] = useState(false);
  const [copied, setCopied] = useState(false);

  const template = templateData.find((t) => t.slug === slug);

  usePageTitle(template ? `${template.name} PlantUML Template` : undefined);

  useEffect(() => {
    if (user) listFolders().then((res) => setFolders(res.items));
  }, [user]);

  if (!template) {
    return <Navigate to="/templates" replace />;
  }

  const handleUseTemplate = async () => {
    if (!user) {
      setShowPitch(true);
      return;
    }
    if (creating) return;
    setCreating(true);
    try {
      const doc = await createDocument({
        title: template.name,
        content: template.content,
        folder_id: selectedFolder,
      });
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      console.error("Failed to create document:", err);
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — ignore
    }
  };

  return (
    <div className="p-6 overflow-y-auto h-[calc(100vh-3.5rem)]">
      <div className="max-w-3xl mx-auto">
        <nav className="text-sm text-muted-foreground mb-4">
          <Link to="/templates" className="hover:underline">
            Template Library
          </Link>{" "}
          / <span className="text-foreground">{template.name}</span>
        </nav>

        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-2xl font-bold">
            {template.name} PlantUML Template
          </h1>
          <Badge variant="secondary" className="shrink-0 capitalize mt-1.5">
            {template.diagram_type.replace(/_/g, " ")}
          </Badge>
        </div>
        <p className="text-muted-foreground mb-6">{template.description}</p>

        <div className="border rounded-md bg-white p-4 flex items-start justify-center mb-6">
          <img
            src={getTemplatePreviewUrl(template.name)}
            alt={`${template.name} PlantUML diagram example`}
            className="max-w-full h-auto"
          />
        </div>

        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">PlantUML Source</h2>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy Code"}
          </Button>
        </div>
        <div className="border rounded-md bg-muted/30 p-4 overflow-auto mb-6">
          <pre className="text-sm font-mono whitespace-pre-wrap">
            {template.content}
          </pre>
        </div>

        <div className="flex items-center gap-2 border-t pt-4">
          {user && (
            <div className="flex items-center gap-2 mr-auto">
              <label className="text-sm text-muted-foreground">
                Create in:
              </label>
              <select
                className="text-sm border rounded px-2 py-1 bg-background"
                value={selectedFolder ?? ""}
                onChange={(e) =>
                  setSelectedFolder(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button onClick={handleUseTemplate} disabled={creating}>
            {creating ? "Creating..." : "Use This Template"}
          </Button>
        </div>
      </div>

      <PitchModal open={showPitch} onOpenChange={setShowPitch} />
    </div>
  );
}
