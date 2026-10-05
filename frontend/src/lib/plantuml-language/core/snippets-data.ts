import type { SnippetDef } from "./snippets-model";

function styleBlock(diagram: string, indent: string): string {
  return [
    "<style>",
    `${diagram} {`,
    `${indent}node {`,
    `${indent}${indent}BackGroundColor \${1:Khaki}`,
    `${indent}${indent}LineColor \${2:Olive}`,
    `${indent}${indent}RoundCorner \${3:8}`,
    `${indent}}`,
    `${indent}highlight {`,
    `${indent}${indent}BackGroundColor \${4:Gold}`,
    `${indent}}`,
    "}",
    "</style>",
  ].join("\n");
}

const jsonSnippets: SnippetDef[] = [
  {
    prefix: "json",
    description: "JSON data diagram (starter)",
    body: [
      "@startjson",
      "{",
      '\t"${1:name}": "${2:Alice}",',
      '\t"${3:roles}": ["${4:admin}", "${5:editor}"],',
      '\t"${6:address}": {',
      '\t\t"${7:city}": "${8:Paris}",',
      '\t\t"${9:zip}": "${10:75001}"',
      "\t},",
      '\t"active": true',
      "}",
      "@endjson",
    ].join("\n"),
    scope: "top",
    expect: "JSON",
  },
  {
    prefix: "highlight",
    description: "Highlight the value at a key path",
    body: '#highlight "${1:key}" / "${2:nested}"',
    scope: ["json", "yaml"],
  },
  {
    prefix: "json-style",
    description: "Style block for JSON nodes and highlights",
    body: styleBlock("jsonDiagram", "\t"),
    scope: ["json"],
    setup: '#highlight "name"',
  },
  {
    prefix: "pair",
    description: "Key with a string value",
    body: '"${1:key}": "${2:value}"',
    scope: ["json"],
  },
  {
    prefix: "object",
    description: "Key with a nested object",
    body: '"${1:key}": {\n\t"${2:name}": "${3:value}"\n}',
    scope: ["json"],
  },
  {
    prefix: "array",
    description: "Key with an array of values",
    body: '"${1:items}": ["${2:first}", "${3:second}"]',
    scope: ["json"],
  },
  {
    prefix: "array-objects",
    description: "Key with an array of objects",
    body: '"${1:items}": [\n\t{ "${2:name}": "${3:first}" },\n\t{ "$2": "${4:second}" }\n]',
    scope: ["json"],
  },
];

const yamlSnippets: SnippetDef[] = [
  {
    prefix: "yaml",
    description: "YAML data diagram (starter)",
    body: [
      "@startyaml",
      "${1:name}: ${2:Alice}",
      "${3:roles}:",
      "  - ${4:admin}",
      "  - ${5:editor}",
      "${6:address}:",
      "  ${7:city}: ${8:Paris}",
      '  ${9:zip}: "${10:75001}"',
      "active: true",
      "@endyaml",
    ].join("\n"),
    scope: "top",
    expect: "YAML",
  },
  {
    prefix: "yaml-style",
    description: "Style block for YAML nodes and highlights",
    body: styleBlock("yamlDiagram", "  "),
    scope: ["yaml"],
    setup: '#highlight "name"',
  },
  {
    prefix: "pair",
    description: "Key with a scalar value",
    body: "${1:key}: ${2:value}",
    scope: ["yaml"],
  },
  {
    prefix: "map",
    description: "Key with nested keys",
    body: "${1:parent}:\n  ${2:key}: ${3:value}\n  ${4:other}: ${5:value}",
    scope: ["yaml"],
  },
  {
    prefix: "list",
    description: "Key with a list of values",
    body: "${1:items}:\n  - ${2:first}\n  - ${3:second}",
    scope: ["yaml"],
  },
  {
    prefix: "list-maps",
    description: "Key with a list of mappings",
    body: "${1:items}:\n  - ${2:name}: ${3:first}\n    ${4:value}: ${5:1}\n  - $2: ${6:second}\n    $4: ${7:2}",
    scope: ["yaml"],
  },
];

const nwdiagSnippets: SnippetDef[] = [
  {
    prefix: "nwdiag",
    description: "Network diagram (starter)",
    body: [
      "@startnwdiag",
      "nwdiag {",
      "\tinternet [shape = cloud];",
      "\tinternet -- router;",
      "",
      "\tnetwork ${1:dmz} {",
      '\t\taddress = "${2:210.x.x.x/24}"',
      '\t\trouter [address = "${3:210.x.x.1}"];',
      '\t\t${4:web01} [address = "${5:210.x.x.10}"];',
      "\t}",
      "\tnetwork ${6:internal} {",
      '\t\taddress = "${7:172.x.x.x/24}"',
      '\t\t$4 [address = "${8:172.x.x.10}"];',
      '\t\t${9:db01} [address = "${10:172.x.x.20}", shape = database];',
      "\t}",
      "}",
      "@endnwdiag",
    ].join("\n"),
    scope: "top",
    expect: "NWDIAG",
  },
  {
    prefix: "network",
    description: "Network with an address range and one node",
    body: 'network ${1:dmz} {\n\taddress = "${2:10.0.0.0/24}"\n\t${3:web01} [address = "${4:10.0.0.10}"];\n}',
    scope: ["nwdiag"],
  },
  {
    prefix: "network-color",
    description: "Network with a colour and a label",
    body: 'network ${1:dmz} {\n\taddress = "${2:10.0.0.0/24}"\n\tcolor = "${3:PaleGreen}"\n\tdescription = "${4:DMZ}"\n\t${5:web01};\n}',
    scope: ["nwdiag"],
  },
  {
    prefix: "node",
    description: "Node with an address",
    body: '${1:web01} [address = "${2:10.0.0.10}"];',
    scope: ["nwdiag"],
  },
  {
    prefix: "node-shape",
    description: "Node with a shape and a description",
    body: '${1:db01} [shape = ${2|database,cloud,node,actor,storage,queue,folder,file|}, description = "${3:Primary DB}"];',
    scope: ["nwdiag"],
  },
  {
    prefix: "node-color",
    description: "Node with a background colour",
    body: '${1:web01} [color = "${2:LightBlue}"];',
    scope: ["nwdiag"],
  },
  {
    prefix: "group",
    description: "Group of nodes with a colour and a label",
    body: 'group ${1:web} {\n\tcolor = "${2:#FFAAAA}";\n\tdescription = "${3:Web tier}";\n\t${4:web01};\n\t${5:web02};\n}',
    scope: ["nwdiag"],
    setup: "network dmz {\n\tweb01;\n\tweb02;\n}",
  },
  {
    prefix: "peer",
    description: "Direct link between two nodes outside a network",
    body: "${1:router} -- ${2:firewall};",
    scope: ["nwdiag"],
  },
  {
    prefix: "internet",
    description: "Internet cloud linked to a router",
    body: "${1:internet} [shape = cloud];\n$1 -- ${2:router};",
    scope: ["nwdiag"],
  },
];

const ebnfSnippets: SnippetDef[] = [
  {
    prefix: "ebnf",
    description: "EBNF grammar (starter)",
    body: [
      "@startebnf",
      "title ${1:Expression grammar}",
      '${2:expression} = ${3:term}, { ("+" | "-"), $3 };',
      '$3 = ${4:factor}, { ("*" | "/"), $4 };',
      '$4 = ${5:number} | "(", $2, ")";',
      "$5 = ${6:digit}, { $6 };",
      '$6 = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";',
      "@endebnf",
    ].join("\n"),
    scope: "top",
    expect: "EBNF",
  },
  {
    prefix: "rule",
    description: "Rule made of a sequence of items",
    body: '${1:name} = ${2:"terminal"}, ${3:other_rule};',
    scope: ["ebnf"],
  },
  {
    prefix: "alternation",
    description: "Rule with alternatives (a | b)",
    body: '${1:name} = ${2:"first"} | ${3:"second"};',
    scope: ["ebnf"],
  },
  {
    prefix: "optional",
    description: "Rule with an optional part ([ ... ])",
    body: '${1:name} = [ ${2:"optional"} ], ${3:"required"};',
    scope: ["ebnf"],
  },
  {
    prefix: "repetition",
    description: "Rule with a part repeated zero or more times ({ ... })",
    body: '${1:name} = { ${2:"repeated"} };',
    scope: ["ebnf"],
  },
  {
    prefix: "repetition-one",
    description: "Rule with a part repeated one or more times ({ ... }-)",
    body: '${1:name} = { ${2:"repeated"} }-;',
    scope: ["ebnf"],
  },
  {
    prefix: "group",
    description: "Rule with a parenthesised group",
    body: '${1:name} = ( ${2:"a"} | ${3:"b"} ), ${4:"c"};',
    scope: ["ebnf"],
  },
  {
    prefix: "special",
    description: "Rule described in free text (? ... ?)",
    body: "${1:name} = ? ${2:any printable character} ?;",
    scope: ["ebnf"],
  },
  {
    prefix: "ebnf-comment",
    description: "EBNF comment, drawn as a note on the rule",
    body: "(* ${1:comment} *)",
    scope: ["ebnf"],
    setup: 'name = "terminal";',
  },
];

const regexSnippets: SnippetDef[] = [
  {
    prefix: "regex",
    description: "Regular expression diagram (starter)",
    body: "@startregex\ntitle ${1:ISO date}\n${2:\\d{4\\}-\\d{2\\}-\\d{2\\}}\n@endregex",
    scope: "top",
    expect: "REGEX",
  },
  {
    prefix: "named-group",
    description: "Named capture group",
    body: "(?<${1:name}>${2:\\d+})",
    scope: ["regex"],
  },
  {
    prefix: "alternation",
    description: "Group of alternatives",
    body: "(${1:cat}|${2:dog})",
    scope: ["regex"],
  },
  {
    prefix: "date",
    description: "Pattern for an ISO date (YYYY-MM-DD)",
    body: "\\d{4}-\\d{2}-\\d{2}",
    scope: ["regex"],
  },
  {
    prefix: "email",
    description: "Pattern for a simple e-mail address",
    body: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
    scope: ["regex"],
  },
  {
    prefix: "descriptive",
    description: "Show descriptive names for character classes",
    body: "!option useDescriptiveNames true",
    scope: ["regex"],
    setup: "\\d+",
  },
];

const otherStarters: SnippetDef[] = [
  {
    prefix: "ditaa",
    description: "Ditaa ASCII-art diagram (starter)",
    body: [
      "@startditaa",
      "+----------+     +----------+     +----------+",
      "| ${1:Client  } |---->| ${2:Server  } |---->| ${3:Storage } |",
      "|          |     |          |     |{s}       |",
      "+----------+     +----------+     +----------+",
      "@endditaa",
    ].join("\n"),
    scope: "top",
    expect: null,
  },
  {
    prefix: "math",
    description: "AsciiMath formula (starter)",
    body: "@startmath\n${1:f(t)=(a_0)/2 + sum_(n=1)^oo a_n cos((n pi t)/L)}\n@endmath",
    scope: "top",
    expect: null,
  },
  {
    prefix: "latex",
    description: "LaTeX formula (starter)",
    body: "@startlatex\n${1:\\sum_{i=0\\}^{n-1\\} (a_i + b_i^2)}\n@endlatex",
    scope: "top",
    expect: null,
  },
  {
    prefix: "creole",
    description: "Creole text block (starter)",
    body: "@startcreole\n= ${1:Title}\n${2:Text with **bold** and //italic// words}\n* ${3:First item}\n* ${4:Second item}\n@endcreole",
    scope: "top",
    expect: null,
  },
  {
    prefix: "files",
    description: "File tree from a list of paths (starter)",
    body: "@startfiles\n/${1:src}/${2:main.ts}\n/$1/${3:lib/util.ts}\n/${4:README.md}\n@endfiles",
    scope: "top",
    expect: "FILES",
  },
];

export const dataSnippets: SnippetDef[] = [
  ...jsonSnippets,
  ...yamlSnippets,
  ...nwdiagSnippets,
  ...ebnfSnippets,
  ...regexSnippets,
  ...otherStarters,
];
