import type * as Monaco from "monaco-editor";

/**
 * Register the PlantUML language with Monaco's Monarch tokenizer.
 * Safe to call multiple times — skips if already registered.
 */
export function registerPlantUMLLanguage(monaco: typeof Monaco): void {
  if (monaco.languages.getLanguages().some((l) => l.id === "plantuml")) return;

  monaco.languages.register({ id: "plantuml" });
  monaco.languages.setMonarchTokensProvider("plantuml", {
    tokenizer: {
      root: [
        [/@(startuml|enduml|startmindmap|endmindmap|startsalt|endsalt|startgantt|endgantt|startjson|endjson|startyaml|endyaml)/, "keyword"],
        [/\b(participant|actor|boundary|control|entity|database|collections|queue)\b/, "keyword"],
        [/\b(as|order|of|on|is|if|else|elseif|endif|while|endwhile|repeat|backward|end|fork|again|kill|return|stop|start|detach)\b/, "keyword"],
        [/\b(note|end note|rnote|hnote|ref|over|legend|end legend|header|footer|title|caption|newpage)\b/, "keyword"],
        [/\b(class|interface|enum|abstract|annotation|package|namespace|together|set|show|hide|remove|skinparam|style|sprite)\b/, "keyword"],
        [/\b(left|right|up|down|top|bottom|center)\b/, "keyword"],
        [/\b(activate|deactivate|create|destroy|return|autonumber)\b/, "keyword"],
        [/\b(state|partition|rectangle|node|folder|frame|cloud|component|usecase|artifact|storage|file|card|hexagon|diamond|circle|label)\b/, "keyword"],
        [/\b(group|box|loop|alt|opt|break|par|critical|section)\b/, "keyword"],
        [/'.*$/, "comment"],
        [/\/'.*/,  "comment"],
        [/\-+[>|*ox]+/, "operator"],
        [/<[>|*ox]?\-+/, "operator"],
        [/\.[>|*ox]+/, "operator"],
        [/<[>|*ox]?\.+/, "operator"],
        [/\~+[>|*ox]+/, "operator"],
        [/#[a-fA-F0-9]{6}\b/, "number"],
        [/#\w+/, "number"],
        [/"[^"]*"/, "string"],
        [/![a-z]+/, "tag"],
      ],
    },
  });
}
