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
