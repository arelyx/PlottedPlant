import { api } from "./api";

// --- Types ---

export interface FolderBrief {
  id: number;
  name: string;
}

export interface UserBrief {
  id: number;
  display_name: string;
}

export interface FolderItem {
  id: number;
  name: string;
  permission: string;
  document_count: number;
  shared_by: UserBrief | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentItem {
  id: number;
  title: string;
  folder: FolderBrief | null;
  permission: string;
  is_shared: boolean;
  last_edited_by: UserBrief | null;
  shared_by: UserBrief | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentDetail {
  id: number;
  title: string;
  folder: FolderBrief | null;
  permission: string;
  is_shared: boolean;
  content: string;
  version_number: number;
  owner: { id: number; display_name: string; username: string };
  last_edited_by: UserBrief | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentCreateResponse {
  id: number;
  title: string;
  folder: FolderBrief | null;
  permission: string;
  is_shared: boolean;
  content: string;
  version_number: number;
  created_at: string;
  updated_at: string;
}

export interface ContentUpdateResponse {
  version_number: number;
  content_hash: string;
  created_version: boolean;
}

// --- Folder API ---

export async function listFolders(sort = "name", order = "asc") {
  return api.request<{ items: FolderItem[] }>(
    `/folders?sort=${sort}&order=${order}`
  );
}

export async function createFolder(name: string) {
  return api.request<FolderItem>("/folders", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function renameFolder(folderId: number, name: string) {
  return api.request<FolderItem>(`/folders/${folderId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function deleteFolder(folderId: number) {
  return api.request<void>(`/folders/${folderId}`, { method: "DELETE" });
}

// --- Document API ---

export async function listDocuments(params?: {
  folder_id?: string;
  sort?: string;
  order?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.folder_id) searchParams.set("folder_id", params.folder_id);
  if (params?.sort) searchParams.set("sort", params.sort);
  if (params?.order) searchParams.set("order", params.order);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));

  const qs = searchParams.toString();
  return api.request<{
    items: DocumentItem[];
    total: number;
    limit: number;
    offset: number;
  }>(`/documents${qs ? `?${qs}` : ""}`);
}

export async function createDocument(data: {
  title?: string;
  folder_id?: number | null;
  content?: string;
}) {
  return api.request<DocumentCreateResponse>("/documents", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getDocument(documentId: number) {
  return api.request<DocumentDetail>(`/documents/${documentId}`);
}

export async function updateDocument(
  documentId: number,
  data: { title?: string; folder_id?: number | null }
) {
  return api.request<DocumentDetail>(`/documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteDocument(documentId: number) {
  return api.request<void>(`/documents/${documentId}`, { method: "DELETE" });
}

export async function duplicateDocument(
  documentId: number,
  data?: { title?: string; folder_id?: number | null }
) {
  return api.request<DocumentCreateResponse>(
    `/documents/${documentId}/duplicate`,
    {
      method: "POST",
      body: JSON.stringify(data || {}),
    }
  );
}

export async function updateDocumentContent(
  documentId: number,
  content: string
) {
  return api.request<ContentUpdateResponse>(
    `/documents/${documentId}/content`,
    {
      method: "PUT",
      body: JSON.stringify({ content }),
    }
  );
}
