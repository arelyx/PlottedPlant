import { type DocRecord, LINKS } from "./docs-model";

/** One builtin function: signature, description, example. The term is the name before "(". */
type Row = [signature: string, body: string, example: string];

const ROWS: Row[] = [
  // Logic
  [
    "%and(a, b [, ...]) : boolean",
    "Returns true when every argument is true. Takes two or more arguments.",
    "!if %and(%true(), 1 == 1)\nAlice -> Bob : both hold\n!endif",
  ],
  [
    "%or(a, b [, ...]) : boolean",
    "Returns true when at least one argument is true. Takes two or more arguments.",
    "!if %or(%false(), %true())\nAlice -> Bob : at least one holds\n!endif",
  ],
  [
    "%not(value) : boolean",
    "Returns the logical negation of its argument.",
    "!if %not(1 == 2)\nAlice -> Bob : the values differ\n!endif",
  ],
  [
    "%xor(a, b [, ...]) : boolean",
    "Returns true when exactly one argument is true. With more than two arguments it is still false as soon as two of them are true.",
    "!if %xor(%true(), %false())\nAlice -> Bob : exactly one holds\n!endif",
  ],
  [
    "%nand(a, b [, ...]) : boolean",
    "Returns false only when every argument is true. It is the negation of `%and`.",
    "!if %nand(%true(), %false())\nAlice -> Bob : not both\n!endif",
  ],
  [
    "%nor(a, b [, ...]) : boolean",
    "Returns true only when every argument is false. It is the negation of `%or`.",
    "!if %nor(%false(), %false())\nAlice -> Bob : neither holds\n!endif",
  ],
  [
    "%nxor(a, b [, ...]) : boolean",
    "Returns false when exactly one argument is true, and true otherwise. It is the negation of `%xor`.",
    "!if %nxor(%true(), %true())\nAlice -> Bob : not exactly one\n!endif",
  ],
  [
    "%true() : boolean",
    "Always returns true, which the preprocessor stores as `1`. Handy for readable flag variables.",
    "!$debug = %true()\n!if $debug\nAlice -> Bob : debug output\n!endif",
  ],
  [
    "%false() : boolean",
    "Always returns false, which the preprocessor stores as `0`.",
    "!$debug = %false()\n!if $debug\nAlice -> Bob : debug output\n!else\nAlice -> Bob : normal output\n!endif",
  ],
  [
    "%boolval(value) : boolean",
    "Converts `\"true\"`, `\"false\"`, `1` or `0` to a boolean, ignoring case. Any other value stops rendering with a conversion error.",
    "!if %boolval(\"true\")\nAlice -> Bob : enabled\n!endif",
  ],

  // Numbers
  [
    "%intval(string) : integer",
    "Converts a string of digits to an integer so it can be used in arithmetic. A string that is not a whole number stops rendering with a conversion error.",
    "!$total = %intval(\"40\") + 2\nAlice -> Bob : $total",
  ],
  [
    "%mod(dividend, divisor) : integer",
    "Returns the remainder of an integer division. A divisor of zero is an error.",
    "Alice -> Bob : %mod(10, 3)",
  ],
  [
    "%eval(expression) : integer",
    "Evaluates a string as a preprocessor expression and returns the result as an integer. Use it when the expression itself is built at run time.",
    "!$formula = \"2 + 3 * 4\"\nAlice -> Bob : %eval($formula)",
  ],
  [
    "%random([min,] max) : integer",
    "Returns a random integer. Without arguments the result is 0 or 1. With one argument it is between 0 and `max - 1`, and with two it is between `min` and `max - 1`. The diagram changes on every render.",
    "Alice -> Bob : rolled %random(1, 7)",
  ],
  [
    "%dec2hex(number) : string",
    "Converts an integer to its hexadecimal form in lower case, without a prefix. `%dec2hex(255)` gives `ff`.",
    "Alice -> Bob : %dec2hex(255)",
  ],
  [
    "%hex2dec(hex) : integer",
    "Converts a hexadecimal string to an integer. Returns 0 when the string is not valid hexadecimal.",
    "Alice -> Bob : %hex2dec(\"ff\")",
  ],

  // Strings
  [
    "%strlen(string) : integer",
    "Returns the number of characters in a string.",
    "!$n = %strlen(\"hello\")\nAlice -> Bob : $n characters",
  ],
  [
    "%strpos(string, search) : integer",
    "Returns the zero-based position of the first occurrence of `search` in the string, or `-1` when it does not occur.",
    "Alice -> Bob : %strpos(\"hello world\", \"world\")",
  ],
  [
    "%substr(string, start [, length]) : string",
    "Returns the part of a string from the zero-based position `start`. Without `length` it runs to the end of the string. A start past the end gives an empty string.",
    "Alice -> Bob : %substr(\"hello world\", 6) and %substr(\"hello world\", 0, 5)",
  ],
  [
    "%upper(string) : string",
    "Returns the string converted to upper case.",
    "Alice -> Bob : %upper(\"hello\")",
  ],
  [
    "%lower(string) : string",
    "Returns the string converted to lower case.",
    "Alice -> Bob : %lower(\"HELLO\")",
  ],
  [
    "%string(expression) : string",
    "Converts the value of an expression to a string. Use it before concatenating a number with text.",
    "!$label = %string(1 + 2) + \" items\"\nAlice -> Bob : $label",
  ],
  [
    "%chr(codepoint) : string",
    "Returns the character with the given Unicode code point. `%chr(65)` gives `A`.",
    "Alice -> Bob : %chr(65)",
  ],
  [
    "%ord(character) : integer",
    "Returns the Unicode code point of the first character of a string. `%ord(\"A\")` gives `65`.",
    "Alice -> Bob : %ord(\"A\")",
  ],
  [
    "%size(value) : integer",
    "Returns the length of a string, the number of elements in a JSON array, or the number of keys in a JSON object. A plain number has size 0.",
    "!$list = [1, 2, 3]\nAlice -> Bob : %size(\"hello\") and %size($list)",
  ],
  [
    "%splitstr(string, separators) : JSON array",
    "Splits a string into a JSON array, ready for `!foreach`. Every character of the second argument counts as a separator, and empty parts are dropped.",
    "!foreach $part in %splitstr(\"a,b,c\", \",\")\nAlice -> Bob : $part\n!endfor",
  ],
  [
    "%splitstr_regex(string, regex) : JSON array",
    "Splits a string into a JSON array wherever the regular expression matches. The pattern uses Java regex syntax.",
    "!foreach $part in %splitstr_regex(\"AbcDefGhi\", \"(?=[A-Z])\")\nAlice -> Bob : $part\n!endfor",
  ],

  // Special characters and line breaks
  [
    "%newline()",
    "Returns a line break for displayed text, the same as writing `\\n` in a label. `%n()` is the short form.",
    "Alice -> Bob : first line%newline()second line",
  ],
  [
    "%n()",
    "Short form of `%newline()`. Returns a line break for displayed text.",
    "Alice -> Bob : first line%n()second line",
  ],
  [
    "%breakline()",
    "Returns a line break in the PlantUML source itself, so the text after it is read as a new source line. For a line break inside a label, use `%newline()` instead.",
    "note as N\nfirst%breakline()second\nend note",
  ],
  [
    "%left_align()",
    "Returns a line break that left-aligns the line it ends, like `\\l` in a label.",
    "note as N\nshort%left_align()a much longer second line\nend note",
  ],
  [
    "%right_align()",
    "Returns a line break that right-aligns the line it ends, like `\\r` in a label.",
    "note as N\nshort%right_align()a much longer second line\nend note",
  ],
  [
    "%tab()",
    "Returns a tab character for displayed text.",
    "Alice -> Bob : name%tab()value",
  ],
  [
    "%backslash()",
    "Returns a single backslash. Use it where a literal `\\` would start an escape such as `\\n` or `\\t`.",
    "Alice -> Bob : C:%backslash()temp",
  ],
  [
    "%dollar()",
    "Returns a literal `$`. Use it where a dollar sign followed by a name would be read as a variable.",
    "Alice -> Bob : costs 5%dollar()",
  ],
  [
    "%percent()",
    "Returns a literal `%`. Use it where a percent sign followed by a name would be read as a builtin function.",
    "Alice -> Bob : 50%percent() done",
  ],

  // Colours
  [
    "%darken(color, percent) : color",
    "Returns the colour made darker by the given percentage, as a hex value. `%darken(\"red\", 20)` gives `#CC0000`. An unknown colour name is an error.",
    "rectangle Darker %darken(\"red\", 20)",
  ],
  [
    "%lighten(color, percent) : color",
    "Returns the colour made lighter by the given percentage, as a hex value. `%lighten(\"red\", 20)` gives `#FF3333`. An unknown colour name is an error.",
    "rectangle Lighter %lighten(\"red\", 20)",
  ],
  [
    "%hsl_color(hue, saturation, lightness [, alpha]) : color",
    "Builds a colour from hue in degrees and saturation, lightness and optional alpha in percent. `%hsl_color(120, 100, 50)` gives `#00FF00`.",
    "rectangle Green %hsl_color(120, 100, 50)",
  ],
  [
    "%is_dark(color) : boolean",
    "Reports whether a colour is dark. A common use is picking a readable text colour for a computed background.",
    "!$bg = \"#202020\"\n!if %is_dark($bg)\nskinparam defaultFontColor white\n!endif\nskinparam backgroundColor $bg\nAlice -> Bob : hello",
  ],
  [
    "%is_light(color) : boolean",
    "Reports whether a colour is light. It is the opposite of `%is_dark`.",
    "!if %is_light(\"#f0f0f0\")\nAlice -> Bob : light background\n!endif",
  ],
  [
    "%reverse_color(color) : color",
    "Returns the RGB inverse of a colour. `%reverse_color(\"#FF7700\")` gives `#0088FF`.",
    "rectangle Inverse %reverse_color(\"#FF7700\")",
  ],
  [
    "%reverse_hsluv_color(color) : color",
    "Returns the inverse of a colour computed in the HSLuv colour space, which keeps the hue and flips the perceived lightness. This usually reads better than `%reverse_color` for dark-mode variants.",
    "rectangle Inverse %reverse_hsluv_color(\"#FF7700\")",
  ],

  // Dates, version, environment
  [
    "%date([format [, epoch_seconds]]) : string",
    "Returns the current date and time. The optional format is a Java `SimpleDateFormat` pattern such as `yyyy-MM-dd`. The optional second argument is a time in seconds since 1970, for example `%now() + 86400` for tomorrow.",
    "title Generated on %date(\"yyyy-MM-dd\")\nAlice -> Bob : hello",
  ],
  [
    "%now() : integer",
    "Returns the current time in seconds since 1 January 1970. Combine it with `%date` to format a time relative to now.",
    "title Due %date(\"yyyy-MM-dd\", %now() + 7 * 86400)\nAlice -> Bob : hello",
  ],
  [
    "%version() : string",
    "Returns the version of the PlantUML engine rendering the diagram, such as `1.2026.1`.",
    "footer PlantUML %version()\nAlice -> Bob : hello",
  ],
  [
    "%feature(name) : boolean",
    "Reports whether the running PlantUML version supports a named feature. The recognised names are `style` and `theme`. Any other name returns false.",
    "!if %feature(\"theme\")\n!theme plain\n!endif\nAlice -> Bob : hello",
  ],
  [
    "%getenv(name) : string",
    "Returns a Java system property or environment variable of the machine rendering the diagram. Returns an empty string when the variable is unset or the server's security profile hides it, which is the usual case for hosted renderers.",
    "Alice -> Bob : home is %getenv(\"HOME\")",
  ],
  [
    "%dirpath() : string",
    "Returns the directory of the file being rendered. Empty when the source does not come from a file, as in an online editor.",
    "Alice -> Bob : rendered from %dirpath()",
  ],
  [
    "%filename() : string",
    "Returns the name of the file being rendered. Empty when the source does not come from a file, as in an online editor.",
    "Alice -> Bob : source file %filename()",
  ],
  [
    "%filename_no_extension() : string",
    "Returns the name of the file being rendered without its extension. Empty when the source does not come from a file.",
    "Alice -> Bob : diagram %filename_no_extension()",
  ],
  [
    "%filedate() : string",
    "Returns the last modification date of the file being rendered. Empty when the source does not come from a file.",
    "Alice -> Bob : last changed %filedate()",
  ],
  [
    "%file_exists(path) : boolean",
    "Reports whether a file exists on the machine rendering the diagram. Use it to guard an optional `!include`. A hosted renderer checks its own file system, so the result is normally false there.",
    "!if %file_exists(\"overrides.puml\")\nAlice -> Bob : overrides found\n!else\nAlice -> Bob : using defaults\n!endif",
  ],
  [
    "%xargs() : string",
    "Returns the text written after the `@start` tag on the first line of the diagram, or an empty string when there is none.",
    "@startuml release-notes\nAlice -> Bob : building %xargs()\n@enduml",
  ],

  // Variables, functions and procedures
  [
    "%variable_exists(name) : boolean",
    "Reports whether a variable is defined. Pass the name as a string, including the `$`.",
    "!$x = 1\n!if %variable_exists(\"$x\")\nAlice -> Bob : x is defined\n!endif",
  ],
  [
    "%function_exists(name) : boolean",
    "Reports whether a function or procedure with that name is defined. Pass the name as a string, including the `$`.",
    "!function $double($x)\n!return $x * 2\n!endfunction\n!if %function_exists(\"$double\")\nAlice -> Bob : $double(21)\n!endif",
  ],
  [
    "%get_variable_value(name)",
    "Returns the value of the variable whose name is given as a string, or an empty string when it is not defined. Use it when the variable name is computed.",
    "!$count = 3\nAlice -> Bob : %get_variable_value(\"$count\")",
  ],
  [
    "%set_variable_value(name, value)",
    "Sets a global variable whose name is given as a string and returns an empty string. Use it when the variable name is computed.",
    "%set_variable_value(\"$who\", \"Bob\")\nAlice -> $who : hello",
  ],
  [
    "%call_user_func(name [, args...])",
    "Calls the return function whose name is given as a string and passes the remaining arguments to it. This lets the function be chosen at run time.",
    "!function $bold($text)\n!return \"<b>\" + $text + \"</b>\"\n!endfunction\nAlice -> Bob : %call_user_func(\"$bold\", \"hello\")",
  ],
  [
    "%invoke_procedure(name [, args...])",
    "Calls the procedure whose name is given as a string and passes the remaining arguments to it. Write the call on a line of its own, like a normal procedure call.",
    "!procedure $greet($who)\nAlice -> $who : hello\n!endprocedure\n%invoke_procedure(\"$greet\", \"Bob\")",
  ],
  [
    "%retrieve_procedure(name [, args...]) : string",
    "Runs a procedure and returns the text it produces as a string instead of adding it to the diagram. Use it to capture generated lines in a variable.",
    "!procedure $cell($name)\n| $name | ok |\n!endprocedure\n!$row = %retrieve_procedure(\"$cell\", \"disk\")\nAlice -> Bob : $row",
  ],

  // JSON
  [
    "%str2json(string) : JSON",
    "Parses a string as JSON so its fields can be read with `$var.key` and `$var[0]`. Returns an empty string when the text is not valid JSON.",
    "!$user = %str2json('{ \"name\": \"Alice\" }')\nAlice -> Bob : $user.name",
  ],
  [
    "%load_json(source [, default [, charset]]) : JSON",
    "Loads JSON from a file path or URL. When the source cannot be read, the result is the default, which is `{}` unless the second argument gives another JSON string. Hosted renderers usually block file and network access, so the default is what comes back there.",
    "!$config = %load_json(\"config.json\", '{ \"env\": \"dev\" }')\nAlice -> Bob : deploy to $config.env",
  ],
  [
    "%get_json_keys(json) : JSON array",
    "Returns the keys of a JSON object as an array. For an array of objects it returns the keys of every object in it.",
    "!$user = { \"name\": \"Alice\", \"role\": \"admin\" }\n!foreach $key in %get_json_keys($user)\nAlice -> Bob : $key\n!endfor",
  ],
  [
    "%get_json_type(value) : string",
    "Returns the type of a value as `object`, `array`, `string`, `number` or `boolean`.",
    "!$data = { \"items\": [1, 2] }\nAlice -> Bob : %get_json_type($data.items)",
  ],
  [
    "%json_key_exists(json, key) : boolean",
    "Reports whether a JSON object has the given key. Returns false when the first argument is not a JSON object.",
    "!$user = { \"name\": \"Alice\" }\n!if %json_key_exists($user, \"name\")\nAlice -> Bob : $user.name\n!endif",
  ],
  [
    "%json_add(json, [key,] value) : JSON",
    "Returns a copy of a JSON array with the value appended, or of a JSON object with the key and value added. The original variable is unchanged, so assign the result back.",
    "!$user = { \"name\": \"Alice\" }\n!$user = %json_add($user, \"role\", \"admin\")\nAlice -> Bob : $user.role",
  ],
  [
    "%json_set(json, key_or_index, value) : JSON",
    "Returns a copy of a JSON object or array with one key or index set to a new value. An index outside the array leaves it unchanged. With two arguments, both objects, the second is merged deeply into the first.",
    "!$user = { \"name\": \"Alice\" }\n!$user = %json_set($user, \"name\", \"Bob\")\nAlice -> Bob : $user.name",
  ],
  [
    "%json_remove(json, key_or_index) : JSON",
    "Returns a copy of a JSON object without the given key, or of a JSON array without the element at the given index.",
    "!$user = { \"name\": \"Alice\", \"role\": \"admin\" }\n!$user = %json_remove($user, \"role\")\nAlice -> Bob : %size($user) key left",
  ],
  [
    "%json_merge(json1, json2) : JSON",
    "Combines two JSON values of the same kind. Two arrays are concatenated and two objects are merged. Mixing an array with an object returns the first argument unchanged.",
    "!$a = { \"name\": \"Alice\" }\n!$b = { \"role\": \"admin\" }\n!$user = %json_merge($a, $b)\nAlice -> Bob : $user.name is $user.role",
  ],

  // Themes and standard library
  [
    "%get_all_theme() : JSON array",
    "Returns the names of all themes bundled with PlantUML as a JSON array.",
    "!$themes = %get_all_theme()\nAlice -> Bob : %size($themes) themes available",
  ],
  [
    "%get_current_theme() : JSON object",
    "Returns the metadata of the theme loaded with `!theme` as a JSON object. The object is empty when no theme is loaded.",
    "!theme cerulean\n!$theme = %get_current_theme()\nAlice -> Bob : %get_json_type($theme)",
  ],
  [
    "%get_all_stdlib([detailed]) : JSON",
    "Without arguments, returns the names of the standard libraries bundled with PlantUML as a JSON array. With any argument, returns a JSON object keyed by library name holding its `name`, `version` and `source`.",
    "!$libs = %get_all_stdlib()\nAlice -> Bob : %size($libs) libraries bundled",
  ],
  [
    "%get_stdlib([library [, key]])",
    "Returns standard library metadata. Without arguments the result is a JSON object covering every library. One argument limits it to that library, and a second argument returns a single value such as its `version`. Library names are lower case, for example `c4`.",
    "!$version = %get_stdlib(\"c4\", \"version\")\nAlice -> Bob : C4 library $version",
  ],
];

export const builtinDocs: DocRecord[] = ROWS.map(([signature, body, example]) => ({
  terms: [signature.slice(0, signature.indexOf("("))],
  signature,
  body,
  example,
  link: LINKS.preprocessing,
}));
