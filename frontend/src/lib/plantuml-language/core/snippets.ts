import type { Snippet } from "./types";
import type { SnippetDef } from "./snippets-model";
import { activitySnippets } from "./snippets-activity";
import { classSnippets } from "./snippets-class";
import { commonSnippets } from "./snippets-common";
import { dataSnippets } from "./snippets-data";
import { descriptionSnippets } from "./snippets-description";
import { erSnippets } from "./snippets-er";
import { ganttSnippets } from "./snippets-gantt";
import { mindmapSnippets } from "./snippets-mindmap";
import { saltSnippets } from "./snippets-salt";
import { sequenceSnippets } from "./snippets-sequence";
import { stateSnippets } from "./snippets-state";
import { timingSnippets } from "./snippets-timing";

/** The snippets with their validation metadata (for tests and the validation script). */
export const snippetDefs: SnippetDef[] = [
  ...sequenceSnippets,
  ...classSnippets,
  ...activitySnippets,
  ...stateSnippets,
  ...descriptionSnippets,
  ...erSnippets,
  ...timingSnippets,
  ...ganttSnippets,
  ...mindmapSnippets,
  ...saltSnippets,
  ...dataSnippets,
  ...commonSnippets,
];

/**
 * Snippets for every diagram type: whole-diagram starters (scope "top"),
 * constructs scoped to one diagram kind, and cross-cutting ones (scope "any").
 */
export const snippets: Snippet[] = snippetDefs;
