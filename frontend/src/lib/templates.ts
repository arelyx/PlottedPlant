import { api } from "./api";

export interface TemplateListItem {
  id: number;
  name: string;
  description: string;
  diagram_type: string;
  sort_order: number;
}

export interface TemplateDetail extends TemplateListItem {
  content: string;
}

export async function listTemplates(
  diagramType?: string
): Promise<{ items: TemplateListItem[] }> {
  const params = diagramType ? `?diagram_type=${diagramType}` : "";
  return api.request(`/templates${params}`);
}

export async function getTemplate(id: number): Promise<TemplateDetail> {
  return api.request(`/templates/${id}`);
}

/**
 * Get the URL for a template's pre-rendered SVG preview.
 * SVGs are static assets in /templates/ named as kebab-case of the template name.
 */
export function getTemplatePreviewUrl(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\(|\)/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  return `/templates/${slug}.svg`;
}
