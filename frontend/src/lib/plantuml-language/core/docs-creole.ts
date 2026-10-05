import { type DocRecord, LINKS } from "./docs-model";

const link = LINKS.creole;

// Text markup (Creole and HTML-like tags) and colour notation. These work in
// any label, note, title or legend, so every entry is kind-less. Bare "--",
// "__", "*", "#", "+" and "-" are left to the diagram-specific files, where
// they have other meanings.
export const creoleDocs: DocRecord[] = [
  // Inline emphasis
  {
    terms: ["**"],
    signature: "**bold text**",
    body: "Renders the enclosed text in bold. It works in any label, note, title or legend. The HTML-like form is `<b>text</b>`.",
    example: "Alice -> Bob : this step is **required**",
    link,
  },
  {
    terms: ["//"],
    signature: "//italic text//",
    body: "Renders the enclosed text in italics. The HTML-like form is `<i>text</i>`. A URL in plain text is not affected, because the marker needs a closing `//`.",
    example: "Alice -> Bob : this step is //optional//",
    link,
  },
  {
    terms: ['""'],
    signature: '""monospaced text""',
    body: "Renders the enclosed text in a monospaced font. Use it for code, commands and file names inside labels and notes.",
    example: 'Alice -> Bob : run ""make install"" first',
    link,
  },
  {
    terms: ["~~"],
    signature: "~~wave-underlined text~~",
    body: "Draws a wavy underline below the enclosed text. The HTML-like form is `<w>text</w>`, which also accepts a colour.",
    example: "Alice -> Bob : check the ~~spelling~~ here",
    link,
  },
  {
    terms: ["<b>", "</b>"],
    signature: "<b>bold text</b>",
    body: "Renders the enclosed text in bold. It is the HTML-like form of `**text**` and can be nested with the other tags.",
    example: "Alice -> Bob : <b>urgent</b> request",
    link,
  },
  {
    terms: ["<i>", "</i>"],
    signature: "<i>italic text</i>",
    body: "Renders the enclosed text in italics. It is the HTML-like form of `//text//`.",
    example: "Alice -> Bob : <i>optional</i> request",
    link,
  },
  {
    terms: ["<u>", "</u>"],
    signature: "<u>underlined</u> | <u:color>underlined</u>",
    body: "Underlines the enclosed text. A colour after the colon colours the line only. The Creole form is `__text__`.",
    example: "Alice -> Bob : <u>underlined</u> and <u:red>red underline</u>",
    link,
  },
  {
    terms: ["<s>", "</s>", "<strike>", "<del>"],
    signature: "<s>struck text</s> | <s:color>struck text</s>",
    body: "Strikes through the enclosed text. A colour after the colon colours the line only. `<strike>` and `<del>` are accepted as well, and the Creole form is `--text--`.",
    example: "Alice -> Bob : <s>old price</s> new price",
    link,
  },
  {
    terms: ["<w>", "</w>"],
    signature: "<w>wave-underlined</w> | <w:color>wave-underlined</w>",
    body: "Draws a wavy underline below the enclosed text, in the given colour if one follows the colon. The Creole form is `~~text~~`.",
    example: "Alice -> Bob : <w:red>typo</w> to fix",
    link,
  },
  {
    terms: ["<plain>", "</plain>"],
    signature: "<plain>text</plain>",
    body: "Resets the enclosed text to the plain font style. Use it inside a label that the diagram or a skinparam already renders bold or italic.",
    example: "title <plain>Draft</plain> Order flow\nAlice -> Bob : hello",
    link,
  },
  {
    terms: ["<sub>", "<sup>", "</sub>", "</sup>"],
    signature: "<sub>subscript</sub> | <sup>superscript</sup>",
    body: "Lowers or raises the enclosed text and makes it smaller. Use them for chemical formulas, exponents and footnote marks.",
    example: "Alice -> Bob : H<sub>2</sub>O and x<sup>2</sup>",
    link,
  },

  // Colour, size, font
  {
    terms: ["<color>", "<color:", "</color>"],
    signature: "<color:name | #RRGGBB>text</color>",
    body: "Colours the enclosed text. The value is a colour name or a hex code.",
    example: "Alice -> Bob : <color:red>failed</color> or <color:#00AA00>passed</color>",
    link,
  },
  {
    terms: ["<back>", "<back:", "</back>"],
    signature: "<back:name | #RRGGBB>text</back>",
    body: "Sets a background colour behind the enclosed text, like a highlighter.",
    example: "Alice -> Bob : <back:yellow>remember this</back>",
    link,
  },
  {
    terms: ["<size>", "<size:", "</size>"],
    signature: "<size:points>text</size>",
    body: "Sets the font size of the enclosed text in points. Other text in the same label keeps its size.",
    example: "Alice -> Bob : <size:18>large</size> and <size:9>small</size>",
    link,
  },
  {
    terms: ["<font>", "<font:", "</font>"],
    signature: "<font:family>text</font>",
    body: "Sets the font family of the enclosed text. The font has to be installed where the diagram is rendered, otherwise a fallback font is used. The older form `<font color=red size=14>` also works.",
    example: "Alice -> Bob : <font:monospaced>GET /orders</font>",
    link,
  },

  // Images, icons, formulas
  {
    terms: ["<img>", "<img:"],
    signature: "<img:path | URL{scale=factor}>",
    body: "Embeds an image in a label or note. The source is a file path or a URL, optionally followed by `{scale=0.5}`. Hosted renderers usually cannot read local files and may block remote ones. A sprite avoids that because it lives in the diagram source.",
    example: "note as N\n<img:logo.png{scale=0.5}>\nCompany logo\nend note",
    link,
  },
  {
    terms: ["<&"],
    signature: "<&icon-name> | <&icon-name*scale> | <&icon-name,color=name>",
    body: "Inserts an OpenIconic icon by name, for example `<&check>` or `<&warning>`. `*2` after the name scales it and `,color=red` colours it. The icon set is built into PlantUML, so it needs no include.",
    example: "Alice -> Bob : <&check> saved\nBob -> Alice : <&warning,color=red> disk almost full",
    link: LINKS.openiconic,
  },
  {
    terms: ["<:"],
    signature: "<:emoji-name:> | <#color:emoji-name:>",
    body: "Inserts an emoji by its short name, for example `<:smile:>` or `<:rocket:>`. A colour before the first colon, as in `<#green:sunny:>`, draws it in that single colour. The emoji set is built into PlantUML.",
    example: "Alice -> Bob : shipped <:rocket:>\nBob --> Alice : <:thumbsup:>",
    link,
  },
  {
    terms: ["<$"],
    signature: "<$sprite-name> | <$sprite-name{scale=factor}> | <$sprite-name,color=name>",
    body: "Inserts a sprite defined earlier with `sprite $name` or loaded from an included icon library. `{scale=2}` resizes it and `,color=red` colours it.",
    example: "sprite $dot [4x4/16] {\nFFFF\nF00F\nF00F\nFFFF\n}\nAlice -> Bob : <$dot> marked <$dot{scale=3}>",
    link: LINKS.sprite,
  },
  {
    terms: ["<math>", "</math>"],
    signature: "<math>AsciiMath formula</math>",
    body: "Renders a formula written in AsciiMath notation inside a label or note. Rendering needs the JLaTeXMath library where PlantUML runs. Without it the formula is replaced by an error message.",
    example: "note as N\n<math>x^2 + y^2 = r^2</math>\nend note",
    link: LINKS.math,
  },
  {
    terms: ["<latex>", "</latex>"],
    signature: "<latex>LaTeX formula</latex>",
    body: "Renders a formula written in LaTeX notation inside a label or note. Rendering needs the JLaTeXMath library where PlantUML runs.",
    example: "note as N\n<latex>\\sum_{i=0}^{n} i</latex>\nend note",
    link: LINKS.math,
  },
  {
    terms: ["<code>", "</code>"],
    signature: "<code> ... </code>",
    body: "Shows the lines between the tags verbatim in a monospaced font. Markup inside is not interpreted, which makes it the way to show source code in a note. Each tag goes on its own line.",
    example: "note as N\n<code>\nif (**ok**) return;\n</code>\nend note",
    link,
  },
  {
    terms: ["<U+", "&#"],
    signature: "<U+XXXX> | &#NNNN;",
    body: "Inserts a Unicode character by code point. `<U+2192>` takes the hexadecimal value and `&#8594;` the decimal one. Use them for symbols that are awkward to type.",
    example: "Alice -> Bob : input <U+2192> output &#169;",
    link,
  },

  // Line breaks and escaping
  {
    terms: ["\\n", "\\l", "\\r", "\\t"],
    signature: "first line\\nsecond line",
    body: "`\\n` breaks the line inside a label and centres it. `\\l` and `\\r` also break the line, and align the line they end to the left or right. `\\t` inserts a tab. In preprocessor expressions, `%newline()` gives the same line break.",
    example: "Alice -> Bob : first line\\nsecond line\nBob --> Alice : left aligned\\lnext line",
    link,
  },
  {
    terms: ["~"],
    signature: "~**not bold~**",
    body: "Escape character. A tilde in front of a markup sequence shows it literally instead of applying it.",
    example: "Alice -> Bob : write ~**text~** to get **text**",
    link,
  },

  // Block-level markup
  {
    terms: ["creole list"],
    signature: "* bullet | # numbered | ** nested",
    body: "In a multi-line note or label, a line starting with `*` is a bullet and a line starting with `#` is a numbered item. Repeat the marker to nest, as in `**` or `##`. The marker needs a space after it.",
    example: "note as N\n* fruit\n** apple\n** pear\n# first step\n# second step\nend note",
    link,
  },
  {
    terms: ["creole table", "|="],
    signature: "|= Header |= Header |  then  | cell | cell |",
    body: "Lines made of cells between `|` form a table. `|=` starts a header cell. A colour in the form `<#lightblue>` at the start of a cell sets its background.",
    example: "note as N\n|= Name |= Role |\n| Alice | admin |\n|<#lightblue> Bob | user |\nend note",
    link,
  },
  {
    terms: ["creole tree", "|_"],
    signature: "|_ item  (indent by two spaces per level)",
    body: "Lines starting with `|_` draw a tree, such as a folder listing. Two more spaces of indentation put an item one level deeper.",
    example: "note as N\n|_ src\n  |_ main\n  |_ test\n|_ README.md\nend note",
    link,
  },
  {
    terms: ["creole heading"],
    signature: "= Heading | == Heading | === Heading",
    body: "A line starting with one to four `=` signs and a space is a heading. One `=` is the largest and each extra sign makes it smaller. It applies in multi-line notes, titles and legends.",
    example: "note as N\n= Release plan\n== Phase 1\nprepare the database\nend note",
    link,
  },
  {
    terms: ["----", "====", "creole line"],
    signature: "---- | ====",
    body: "A line holding only `----` draws a horizontal rule across a note or a multi-line label. `====` draws a double rule. Use them to separate a summary from details.",
    example: "note as N\nsummary\n----\ndetails\n====\nfootnote\nend note",
    link,
  },

  // Colour notation
  {
    terms: ["#color", "#rrggbb"],
    signature: "#name | #RGB | #RRGGBB | #RRGGBBAA | #transparent",
    body: "Colour notation. After the `#` comes a colour name such as `red` or `LightSkyBlue`, or a hex code with three, six or eight digits, where the last two of eight are the alpha channel. Names are case-insensitive. In `skinparam` values and `<color:...>` tags the `#` before a name is optional.",
    example: "rectangle Named #LightSkyBlue\nrectangle Hex #FF8800\nrectangle Short #F80\nrectangle Translucent #FF880080",
    link: LINKS.color,
  },
  {
    terms: ["gradient"],
    signature: "#color1|color2  #color1-color2  #color1/color2  #color1\\color2",
    body: "Two colours joined by a separator make a gradient fill. `|` runs it left to right, `-` runs it top to bottom, and `/` or `\\` run it along a diagonal. Gradients work wherever a background colour is accepted.",
    example: "rectangle Horizontal #white|LightBlue\nrectangle Vertical #white-LightBlue\nrectangle Diagonal #white/LightBlue",
    link: LINKS.color,
  },
  {
    terms: ["inline style", "#line:", "#back:", "#text:"],
    signature: "#back:color;line:color;line.dashed;text:color",
    body: "Styles one element in place. After the `#`, list `back:` for the fill, `line:` for the border colour, `text:` for the text colour, and `line.bold`, `line.dashed` or `line.dotted` for the border style, separated by semicolons. A plain colour may come first as the background. This overrides themes and skinparams for that element only.",
    example: "rectangle Warning #back:LightYellow;line:red;line.dashed;text:red\nrectangle Normal\nWarning --> Normal",
    link: LINKS.color,
  },
  {
    terms: ["arrow style", "-["],
    signature: "A -[#color,dashed,thickness=2]-> B",
    body: "Square brackets inside an arrow style that one link. Accepted entries are a colour, `bold`, `dashed`, `dotted`, `plain`, `hidden` and `thickness=N`, separated by commas. Sequence diagram arrows take only the colour, written as `-[#red]>`.",
    example: "class Client\nclass Server\nClient -[#red,dashed,thickness=2]-> Server : retries",
    link: LINKS.color,
  },
];
