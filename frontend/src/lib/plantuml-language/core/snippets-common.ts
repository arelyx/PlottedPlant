import type { SnippetDef } from "./snippets-model";

// Scope "any" fragments are not diagrams on their own. Each is validated
// inside a small host diagram, with the diagram type asserted so that a
// fragment which makes the host unparsable cannot pass unnoticed.
const SEQ = { setup: "Alice -> Bob : hello", expect: "SEQUENCE" } as const;
const CLS = { setup: "class Element {\n+id\n}\nclass Other\nElement --> Other", expect: "CLASS" } as const;
// Inline fragments are validated as the tail of a host line (PlantUML joins
// a line ending in "\" with the next one).
const IN_MESSAGE = { setup: "Alice -> Bob : see \\", expect: "SEQUENCE" } as const;
const ON_ELEMENT = { setup: "rectangle Box \\", expect: "DESCRIPTION" } as const;

const SPRITE_ROWS = [
  "FFFFFFFFFFFF",
  "F0000000000F",
  "F0FFFFFFFF0F",
  "F0F000000F0F",
  "F0F000000F0F",
  "F0FFFFFFFF0F",
  "F0000000000F",
  "FFFFFFFFFFFF",
].join("\n");

const layoutSnippets: SnippetDef[] = [
  {
    prefix: "uml",
    description: "Empty UML diagram with a title (starter)",
    body: "@startuml\ntitle ${1:Diagram title}\n\n$0\n@enduml",
    scope: "top",
    expect: null,
  },
  {
    prefix: "title",
    description: "Diagram title",
    body: "title ${1:Diagram title}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "title-block",
    description: "Multi-line diagram title",
    body: "title\n\t${1:<b>Diagram title</b>}\n\t${2:Subtitle}\nend title",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "header",
    description: "Page header",
    body: "header ${1:Draft}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "footer",
    description: "Page footer with page numbers",
    body: "footer ${1:Page %page% of %lastpage%}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "caption",
    description: "Caption below the diagram",
    body: "caption ${1:Figure 1. Caption text}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "legend",
    description: "Legend box with a position",
    body: "legend ${1|right,left,center,top left,top right,bottom left,bottom right|}\n\t${2:Legend text}\nend legend",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "legend-table",
    description: "Legend laid out as a table",
    body: "legend ${1|right,left,center|}\n\t|= ${2:Symbol} |= ${3:Meaning} |\n\t| ${4:A} | ${5:First item} |\n\t| ${6:B} | ${7:Second item} |\nend legend",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "mainframe",
    description: "Frame around the whole diagram with a label",
    body: "mainframe ${1:Frame title}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "scale",
    description: "Zoom factor for the rendered image",
    body: "scale ${1:1.5}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "scale-width",
    description: "Scale the image to a fixed width or height in pixels",
    body: "scale ${1:800} ${2|width,height|}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "scale-max",
    description: "Limit the image width or height in pixels",
    body: "scale max ${1:1024} ${2|width,height|}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "direction",
    description: "Layout direction of the diagram",
    body: "${1|left to right,top to bottom|} direction",
    scope: "any",
    ...CLS,
  },
  {
    prefix: "comment",
    description: "Single-line comment",
    body: "' ${1:comment}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "comment-block",
    description: "Multi-line comment",
    body: "/'\n${1:comment}\n'/",
    scope: "any",
    ...SEQ,
  },
];

const visibilitySnippets: SnippetDef[] = [
  {
    prefix: "hide",
    description: "Hide a part of the elements",
    body: "hide ${1|empty members,empty fields,empty methods,circle,stereotype,footbox,@unlinked|}",
    scope: "any",
    ...CLS,
  },
  {
    prefix: "show",
    description: "Show a part of the elements again",
    body: "show ${1|members,fields,methods,circle,stereotype,footbox|}",
    scope: "any",
    ...CLS,
  },
  {
    prefix: "remove",
    description: "Remove an element from the diagram",
    body: "remove ${1:Element}",
    scope: "any",
    ...CLS,
  },
  {
    prefix: "hide-tag",
    description: "Hide every element that carries a tag",
    body: "hide \\$${1:draft}",
    scope: "any",
    setup: "class Element\nclass Sketch $draft",
    expect: "CLASS",
  },
  {
    prefix: "remove-unlinked",
    description: "Remove elements that have no relation",
    body: "remove @unlinked",
    scope: "any",
    setup: `${CLS.setup}\nclass Orphan`,
    expect: "CLASS",
  },
];

const stylingSnippets: SnippetDef[] = [
  {
    prefix: "skinparam",
    description: "Single skinparam setting",
    body: "skinparam ${1:backgroundColor} ${2:White}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "skinparam-block",
    description: "Skinparam block for one element type",
    body: "skinparam ${1:class} {\n\t${2:BackgroundColor} ${3:White}\n\t${4:BorderColor} ${5:Black}\n}",
    scope: "any",
    ...CLS,
  },
  {
    prefix: "skinparam-font",
    description: "Default font name and size",
    body: "skinparam defaultFontName ${1:Helvetica}\nskinparam defaultFontSize ${2:14}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "style",
    description: "Style block for one element type",
    body: "<style>\n${1:element} {\n\t${2:BackgroundColor} ${3:LightYellow}\n\t${4:LineColor} ${5:Gray}\n\t${6:FontColor} ${7:Black}\n}\n</style>",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "theme",
    description: "Apply a built-in theme",
    body: "!theme ${1|plain,cerulean,materia,minty,sandstone,spacelab,superhero,sketchy-outline,vibrant,mono|}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "color",
    description: "Background colour on an element (#color after its name)",
    body: "#${1:LightBlue}",
    scope: "any",
    ...ON_ELEMENT,
  },
  {
    prefix: "gradient",
    description: "Two-colour gradient background (#from/to)",
    body: "#${1:LightBlue}/${2:White}",
    scope: "any",
    ...ON_ELEMENT,
  },
  {
    prefix: "color-style",
    description: "Inline background, line and text colours on an element",
    body: "#back:${1:LightBlue};line:${2:Navy};text:${3:Black}",
    scope: "any",
    ...ON_ELEMENT,
  },
  {
    prefix: "text-color",
    description: "Coloured text",
    body: "<color:${1:red}>${2:text}</color>",
    scope: "any",
    ...IN_MESSAGE,
  },
  {
    prefix: "text-size",
    description: "Text in a given font size",
    body: "<size:${1:18}>${2:text}</size>",
    scope: "any",
    ...IN_MESSAGE,
  },
  {
    prefix: "text-bold",
    description: "Bold text (creole)",
    body: "**${1:text}**",
    scope: "any",
    ...IN_MESSAGE,
  },
  {
    prefix: "link",
    description: "Hyperlink with a label",
    body: "[[${1:https://example.com} ${2:label}]]",
    scope: "any",
    ...IN_MESSAGE,
  },
  {
    prefix: "link-tooltip",
    description: "Hyperlink with a tooltip and a label",
    body: "[[${1:https://example.com}{${2:tooltip}} ${3:label}]]",
    scope: "any",
    ...IN_MESSAGE,
  },
  {
    prefix: "icon",
    description: "OpenIconic icon inside text",
    body: "<&${1:cloud}>",
    scope: "any",
    ...IN_MESSAGE,
  },
  {
    prefix: "emoji",
    description: "Emoji inside text",
    body: "<:${1:smile}:>",
    scope: "any",
    ...IN_MESSAGE,
  },
  {
    prefix: "sprite",
    description: "Define a 16-grey-level sprite",
    body: `sprite \\$\${1:box} [12x8/16] {\n${SPRITE_ROWS}\n}`,
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "sprite-use",
    description: "Insert a defined sprite inside text",
    body: "<\\$${1:box}>",
    scope: "any",
    setup: `sprite $box [12x8/16] {\n${SPRITE_ROWS}\n}\n${IN_MESSAGE.setup}`,
    expect: "SEQUENCE",
  },
];

const preprocessorSnippets: SnippetDef[] = [
  {
    prefix: "!define",
    description: "Text substitution constant",
    body: "!define ${1:NAME} ${2:value}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "!var",
    description: "Preprocessor variable",
    body: '!\\$${1:name} = ${2:"value"}',
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "!json",
    description: "Preprocessor variable holding JSON data",
    body: '!\\$${1:data} = { "${2:name}": "${3:Alice}", "${4:age}": ${5:30} }',
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "!procedure",
    description: "Procedure that emits diagram lines",
    body: "!procedure \\$${1:name}(\\$${2:arg})\n\t${3:participant} \\$$2\n!endprocedure",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "!function",
    description: "Function that returns a value",
    body: "!function \\$${1:double}(\\$${2:x})\n\t!return \\$$2 ${3:* 2}\n!endfunction",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "!if",
    description: "Conditional block (!if / !else / !endif)",
    body: "!if ${1:%variable_exists(\"\\$debug\")}\n\t${2:' lines used when the condition is true}\n!else\n\t${3:' lines used otherwise}\n!endif",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "!ifdef",
    description: "Block used only when a constant is defined",
    body: "!ifdef ${1:NAME}\n\t${2:' lines used when NAME is defined}\n!endif",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "!ifndef",
    description: "Define a constant unless it already exists",
    body: "!ifndef ${1:NAME}\n\t!define $1 ${2:value}\n!endif",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "!foreach",
    description: "Loop over the items of a list",
    body: '!foreach \\$${1:item} in ${2:["Carol", "Dave"]}\n\t${3:participant} \\$$1\n!endfor',
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "!while",
    description: "Loop while a condition holds",
    body: '!\\$${1:i} = 0\n!while \\$$1 < ${2:3}\n\t${3:participant} "Worker \\$$1"\n\t!\\$$1 = \\$$1 + 1\n!endwhile',
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "!include",
    description: "Include another file",
    body: "!include ${1:path/to/file.puml}",
    scope: "any",
    skip: "the sandboxed server cannot read files",
  },
  {
    prefix: "!include-std",
    description: "Include a standard library module",
    body: "!include <${1:C4/C4_Container}>",
    scope: "any",
    setup: "rectangle Box",
    expect: "DESCRIPTION",
  },
  {
    prefix: "!pragma",
    description: "Engine option",
    body: "!pragma ${1|teoz true,layout smetana,useVerticalIf on|}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "!log",
    description: "Write a message to the PlantUML log",
    body: "!log ${1:message}",
    scope: "any",
    ...SEQ,
  },
  {
    prefix: "!assert",
    description: "Stop with a message when a condition is false",
    body: '!assert ${1:%strlen("abc") == 3} : "${2:unexpected length}"',
    scope: "any",
    ...SEQ,
  },
];

export const commonSnippets: SnippetDef[] = [
  ...layoutSnippets,
  ...visibilitySnippets,
  ...stylingSnippets,
  ...preprocessorSnippets,
];
