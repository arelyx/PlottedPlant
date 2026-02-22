import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { usePreferencesStore } from "@/stores/preferences";

export function EditorSettingsPopover() {
  const { preferences, update } = usePreferencesStore();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" title="Editor settings">
          Settings
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-4">
          <h4 className="font-medium text-sm">Editor Settings</h4>

          {/* Theme */}
          <div className="space-y-1.5">
            <Label className="text-xs">Theme</Label>
            <div className="flex gap-1">
              {(["light", "dark", "system"] as const).map((t) => (
                <button
                  key={t}
                  className={`px-3 py-1 text-xs rounded-md border ${
                    preferences.theme === t
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => update({ theme: t })}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Font size */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Font Size</Label>
              <span className="text-xs text-muted-foreground">
                {preferences.editor_font_size}px
              </span>
            </div>
            <Slider
              min={8}
              max={32}
              step={1}
              value={[preferences.editor_font_size]}
              onValueChange={([v]) => update({ editor_font_size: v })}
            />
          </div>

          {/* Word wrap */}
          <div className="flex items-center justify-between">
            <Label className="text-xs">Word Wrap</Label>
            <Switch
              checked={preferences.editor_word_wrap}
              onCheckedChange={(v) => update({ editor_word_wrap: v })}
            />
          </div>

          {/* Minimap */}
          <div className="flex items-center justify-between">
            <Label className="text-xs">Minimap</Label>
            <Switch
              checked={preferences.editor_minimap}
              onCheckedChange={(v) => update({ editor_minimap: v })}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
