import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listTemplates,
  getTemplate,
  getTemplatePreviewUrl,
  type TemplateListItem,
  type TemplateDetail,
} from "@/lib/templates";
import { createDocument, listFolders, type FolderItem } from "@/lib/documents";

const DIAGRAM_TYPES = [
  { value: "", label: "All" },
  { value: "sequence", label: "Sequence" },
  { value: "class", label: "Class" },
  { value: "activity", label: "Activity" },
  { value: "use_case", label: "Use Case" },
  { value: "component", label: "Component" },
  { value: "state", label: "State" },
  { value: "deployment", label: "Deployment" },
  { value: "entity_relationship", label: "ER Diagram" },
  { value: "gantt", label: "Gantt" },
  { value: "mindmap", label: "Mindmap" },
  { value: "json", label: "JSON" },
  { value: "network", label: "Network" },
  { value: "wireframe", label: "Wireframe" },
];

export function TemplateBrowserPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [activeType, setActiveType] = useState("");
  const [loading, setLoading] = useState(true);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateDetail | null>(
    null
  );
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTemplates(activeType || undefined);
      setTemplates(res.items);
    } catch (err) {
      console.error("Failed to load templates:", err);
    } finally {
      setLoading(false);
    }
  }, [activeType]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    listFolders().then((res) => setFolders(res.items));
  }, []);

  const handlePreview = async (template: TemplateListItem) => {
    setLoadingPreview(true);
    try {
      const detail = await getTemplate(template.id);
      setPreviewTemplate(detail);
    } catch {
      console.error("Failed to load template");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleUseTemplate = async (content: string, name: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const doc = await createDocument({
        title: name,
        content,
        folder_id: selectedFolder,
      });
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      console.error("Failed to create document:", err);
      setCreating(false);
    }
  };

  // Group templates by type for display
  const grouped = templates.reduce(
    (acc, t) => {
      if (!acc[t.diagram_type]) acc[t.diagram_type] = [];
      acc[t.diagram_type].push(t);
      return acc;
    },
    {} as Record<string, TemplateListItem[]>
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className="w-48 border-r p-3 space-y-1 overflow-y-auto shrink-0">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Diagram Type
        </p>
        {DIAGRAM_TYPES.map((dt) => (
          <button
            key={dt.value}
            className={`block w-full text-left px-3 py-1.5 text-sm rounded-md ${
              activeType === dt.value
                ? "bg-accent text-accent-foreground font-medium"
                : "hover:bg-accent/50 text-muted-foreground"
            }`}
            onClick={() => setActiveType(dt.value)}
          >
            {dt.label}
          </button>
        ))}
      </aside>

      {/* Main grid */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Template Library</h1>

          {loading ? (
            <p className="text-center text-muted-foreground py-12">
              Loading templates...
            </p>
          ) : templates.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No templates found.
            </p>
          ) : activeType ? (
            // Flat grid when filtered
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onPreview={() => handlePreview(t)}
                  loading={loadingPreview}
                />
              ))}
            </div>
          ) : (
            // Grouped by type when showing all
            <div className="space-y-8">
              {Object.entries(grouped).map(([type, items]) => (
                <section key={type}>
                  <h2 className="text-lg font-semibold mb-3 capitalize">
                    {type.replace(/_/g, " ")}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((t) => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        onPreview={() => handlePreview(t)}
                        loading={loadingPreview}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog
        open={!!previewTemplate}
        onOpenChange={() => setPreviewTemplate(null)}
      >
        {previewTemplate && (
          <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{previewTemplate.name}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {previewTemplate.description}
              </p>
            </DialogHeader>
            <div className="flex-1 overflow-auto grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0">
              <div className="border rounded-md bg-white p-4 overflow-auto flex items-start justify-center">
                <img
                  src={getTemplatePreviewUrl(previewTemplate.name)}
                  alt={`${previewTemplate.name} preview`}
                  className="max-w-full h-auto"
                />
              </div>
              <div className="border rounded-md bg-muted/30 p-4 overflow-auto">
                <pre className="text-sm font-mono whitespace-pre-wrap">
                  {previewTemplate.content}
                </pre>
              </div>
            </div>
            <DialogFooter className="flex items-center gap-2">
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
              <Button
                variant="outline"
                onClick={() => setPreviewTemplate(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() =>
                  handleUseTemplate(
                    previewTemplate.content,
                    previewTemplate.name
                  )
                }
                disabled={creating}
              >
                {creating ? "Creating..." : "Use Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function TemplateCard({
  template,
  onPreview,
  loading,
}: {
  template: TemplateListItem;
  onPreview: () => void;
  loading: boolean;
}) {
  return (
    <div
      className="border rounded-lg overflow-hidden hover:border-primary/50 hover:shadow-sm cursor-pointer transition-colors"
      onClick={onPreview}
    >
      <div className="h-36 bg-white p-3 border-b flex items-center justify-center overflow-hidden">
        <img
          src={getTemplatePreviewUrl(template.name)}
          alt={`${template.name} preview`}
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-medium text-sm">{template.name}</h3>
          <Badge variant="secondary" className="text-xs shrink-0 capitalize">
            {template.diagram_type.replace(/_/g, " ")}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {template.description}
        </p>
      </div>
    </div>
  );
}
