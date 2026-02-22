import { create } from "zustand";
import {
  getPreferences,
  updatePreferences,
  type Preferences,
} from "@/lib/preferences";

interface PreferencesState {
  preferences: Preferences;
  isLoaded: boolean;
  resolvedTheme: "light" | "dark";
  load: () => Promise<void>;
  update: (prefs: Partial<Preferences>) => Promise<void>;
}

const DEFAULTS: Preferences = {
  theme: "system",
  editor_font_size: 14,
  editor_minimap: false,
  editor_word_wrap: true,
};

function resolveTheme(theme: Preferences["theme"]): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

function applyTheme(resolved: "light" | "dark") {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: DEFAULTS,
  isLoaded: false,
  resolvedTheme: resolveTheme(DEFAULTS.theme),

  load: async () => {
    try {
      const prefs = await getPreferences();
      const resolved = resolveTheme(prefs.theme);
      applyTheme(resolved);
      set({ preferences: prefs, isLoaded: true, resolvedTheme: resolved });
    } catch {
      // Use defaults on error
      const resolved = resolveTheme(DEFAULTS.theme);
      applyTheme(resolved);
      set({ isLoaded: true, resolvedTheme: resolved });
    }
  },

  update: async (partial) => {
    const current = get().preferences;
    const merged = { ...current, ...partial };
    const resolved = resolveTheme(merged.theme);
    applyTheme(resolved);
    set({ preferences: merged, resolvedTheme: resolved });

    try {
      await updatePreferences(merged);
    } catch {
      // Revert on error
      const oldResolved = resolveTheme(current.theme);
      applyTheme(oldResolved);
      set({ preferences: current, resolvedTheme: oldResolved });
    }
  },
}));
