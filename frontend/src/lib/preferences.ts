import { api } from "./api";

export interface Preferences {
  theme: "light" | "dark" | "system";
  editor_font_size: number;
  editor_minimap: boolean;
  editor_word_wrap: boolean;
}

export async function getPreferences(): Promise<Preferences> {
  return api.request<Preferences>("/users/me/preferences");
}

export async function updatePreferences(
  prefs: Preferences
): Promise<Preferences> {
  return api.request<Preferences>("/users/me/preferences", {
    method: "PUT",
    body: JSON.stringify(prefs),
  });
}
