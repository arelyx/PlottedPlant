import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  listTemplates,
  getTemplate,
  getTemplatePreviewUrl,
  type TemplateListItem,
} from "@/lib/templates";

interface TemplatePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (content: string | null, title?: string) => void;
}

export function TemplatePickerDialog({
  open,
  onOpenChange,
  onSelect,
}: TemplatePickerDialogProps) {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listTemplates()
      .then((res) => setTemplates(res.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const handleSelectTemplate = async (t: TemplateListItem) => {
    setLoadingId(t.id);
    try {
      const detail = await getTemplate(t.id);
      onSelect(detail.content, detail.name);
    } catch {
      console.error("Failed to load template");
    } finally {
      setLoadingId(null);
    }
  };

  // Group by type
  const grouped = templates.reduce(
    (acc, t) => {
      if (!acc[t.diagram_type]) acc[t.diagram_type] = [];
      acc[t.diagram_type].push(t);
      return acc;
    },
    {} as Record<string, TemplateListItem[]>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>New Document</DialogTitle>
        </DialogHeader>

        {/* Blank document option */}
        <button
          className="w-full text-left p-4 border-2 border-dashed rounded-lg hover:border-primary/50 hover:bg-accent/30 transition-colors mb-4"
          onClick={() => onSelect(null)}
        >
          <p className="font-medium text-sm">Blank Document</p>
          <p className="text-xs text-muted-foreground">
            Start with the default PlantUML skeleton
          </p>
        </button>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">
              Loading templates...
            </p>
          ) : (
            Object.entries(grouped).map(([type, items]) => (
              <section key={type}>
                <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  {type.replace(/_/g, " ")}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {items.map((t) => (
                    <button
                      key={t.id}
                      className="text-left border rounded-lg overflow-hidden hover:border-primary/50 hover:bg-accent/30 transition-colors disabled:opacity-50"
                      onClick={() => handleSelectTemplate(t)}
                      disabled={loadingId !== null}
                    >
                      <div className="h-24 bg-white p-2 border-b flex items-center justify-center overflow-hidden">
                        <img
                          src={getTemplatePreviewUrl(t.name)}
                          alt={`${t.name} preview`}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm">{t.name}</p>
                          {loadingId === t.id && (
                            <Badge variant="secondary" className="text-xs">
                              Loading...
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {t.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
