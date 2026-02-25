import { api } from "./api";

export interface UserBrief {
  id: number;
  display_name: string;
}

export interface VersionListItem {
  version_number: number;
  created_at: string;
  created_by: UserBrief | null;
  label: string | null;
  source: string;
}

export interface VersionDetail extends VersionListItem {
  content: string;
}

export interface VersionDiff {
  base_version: number;
  compare_version: number;
  base_content: string;
  compare_content: string;
}

export interface RestoreResult {
  restored_to_version: number;
  pre_restore_version: number;
  post_restore_version: number;
  content: string;
}

export async function listVersions(
  documentId: string,
  cursor?: string,
  limit = 50
): Promise<{ items: VersionListItem[]; next_cursor: string | null; has_more: boolean }> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  const qs = params.toString();
  return api.request(`/documents/${documentId}/versions?${qs}`);
}

export async function getVersion(
  documentId: string,
  versionNumber: number
): Promise<VersionDetail> {
  return api.request(`/documents/${documentId}/versions/${versionNumber}`);
}

export async function getVersionDiff(
  documentId: string,
  versionNumber: number,
  compareTo: number
): Promise<VersionDiff> {
  return api.request(
    `/documents/${documentId}/versions/${versionNumber}/diff?compare_to=${compareTo}`
  );
}

export async function createCheckpoint(
  documentId: string,
  label: string
): Promise<VersionListItem> {
  return api.request(`/documents/${documentId}/versions`, {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export async function restoreVersion(
  documentId: string,
  versionNumber: number
): Promise<RestoreResult> {
  return api.request(
    `/documents/${documentId}/versions/${versionNumber}/restore`,
    { method: "POST" }
  );
}
