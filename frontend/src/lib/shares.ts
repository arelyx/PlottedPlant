import { api } from "./api";

export interface ShareUser {
  id: number;
  username: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
}

export interface ShareItem {
  id: number;
  user: ShareUser;
  permission: string;
  created_at: string;
}

export interface PublicLink {
  token: string;
  permission: string;
  is_active: boolean;
  url: string;
  created_at: string;
}

export interface ShareListResponse {
  owner: ShareUser;
  shares: ShareItem[];
  public_link: PublicLink | null;
}

export interface UserSearchResult {
  id: number;
  username: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
}

// --- Document Shares ---

export async function getDocumentShares(documentId: number) {
  return api.request<ShareListResponse>(`/documents/${documentId}/shares`);
}

export async function createDocumentShare(
  documentId: number,
  userId: number,
  permission: string
) {
  return api.request<ShareItem>(`/documents/${documentId}/shares`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, permission }),
  });
}

export async function updateDocumentShare(
  documentId: number,
  shareId: number,
  permission: string
) {
  return api.request<ShareItem>(
    `/documents/${documentId}/shares/${shareId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ permission }),
    }
  );
}

export async function deleteDocumentShare(
  documentId: number,
  shareId: number
) {
  return api.request<void>(`/documents/${documentId}/shares/${shareId}`, {
    method: "DELETE",
  });
}

// --- Folder Shares ---

export async function getFolderShares(folderId: number) {
  return api.request<ShareListResponse>(`/folders/${folderId}/shares`);
}

export async function createFolderShare(
  folderId: number,
  userId: number,
  permission: string
) {
  return api.request<ShareItem>(`/folders/${folderId}/shares`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, permission }),
  });
}

export async function updateFolderShare(
  folderId: number,
  shareId: number,
  permission: string
) {
  return api.request<ShareItem>(`/folders/${folderId}/shares/${shareId}`, {
    method: "PATCH",
    body: JSON.stringify({ permission }),
  });
}

export async function deleteFolderShare(folderId: number, shareId: number) {
  return api.request<void>(`/folders/${folderId}/shares/${shareId}`, {
    method: "DELETE",
  });
}

// --- Public Links ---

export async function createDocumentPublicLink(documentId: number) {
  return api.request<PublicLink>(`/documents/${documentId}/public-link`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function revokeDocumentPublicLink(documentId: number) {
  return api.request<void>(`/documents/${documentId}/public-link`, {
    method: "DELETE",
  });
}

export async function createFolderPublicLink(folderId: number) {
  return api.request<PublicLink>(`/folders/${folderId}/public-link`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function revokeFolderPublicLink(folderId: number) {
  return api.request<void>(`/folders/${folderId}/public-link`, {
    method: "DELETE",
  });
}

// --- User Search ---

export async function searchUsers(query: string, limit = 10) {
  return api.request<UserSearchResult[]>(
    `/users/search?q=${encodeURIComponent(query)}&limit=${limit}`
  );
}

// --- Public Access ---

export interface PublicDocumentAccess {
  type: "document";
  permission: string;
  document: {
    id: number;
    title: string;
    content: string;
    owner: { display_name: string };
    updated_at: string;
  };
}

export interface PublicFolderAccess {
  type: "folder";
  permission: string;
  folder: {
    id: number;
    name: string;
    documents: { id: number; title: string; updated_at: string }[];
  };
}

export type PublicAccess = PublicDocumentAccess | PublicFolderAccess;

export async function accessPublicLink(token: string) {
  return api.request<PublicAccess>(`/share/${token}`, { skipAuth: true });
}
