const fs = require('fs');
const path = require('path');

const themesDir = path.join(__dirname, 'extensions/theme-defaults/themes');
const themeFiles = ['zen_lime.json', 'zen_cherry.json', 'zen_ocean.json'];

// Premium Tokyo Night / Catppuccin Mocha Syntax Palette
const tokyoNightSyntax = {
  tokenColors: [
    {
      "name": "Comments",
      "scope": ["comment", "punctuation.definition.comment"],
      "settings": { "foreground": "#565f89", "fontStyle": "italic" }
    },
    {
      "name": "Variables",
      "scope": ["variable", "string constant.other.placeholder"],
      "settings": { "foreground": "#c0caf5" }
    },
    {
      "name": "Keywords & Storage",
      "scope": ["keyword", "storage.type", "storage.modifier"],
      "settings": { "foreground": "#bb9af7", "fontStyle": "italic" }
    },
    {
      "name": "Functions & Methods",
      "scope": ["entity.name.function", "meta.function-call", "variable.function", "support.function"],
      "settings": { "foreground": "#7aa2f7" }
    },
    {
      "name": "Types, Classes, Interfaces",
      "scope": ["entity.name.type", "entity.name.class", "entity.name.namespace", "entity.name.scope-resolution", "support.class", "support.type"],
      "settings": { "foreground": "#2ac3de", "fontStyle": "bold" }
    },
    {
      "name": "Strings",
      "scope": ["string", "punctuation.definition.string"],
      "settings": { "foreground": "#9ece6a" }
    },
    {
      "name": "Numbers & Constants",
      "scope": ["constant.numeric", "constant.language", "constant.other", "support.constant"],
      "settings": { "foreground": "#ff9e64" }
    },
    {
      "name": "Parameters",
      "scope": ["variable.parameter"],
      "settings": { "foreground": "#e0af68", "fontStyle": "italic" }
    },
    {
      "name": "Properties",
      "scope": ["variable.other.property", "support.type.property-name"],
      "settings": { "foreground": "#7dcfff" }
    },
    {
      "name": "Operators & Punctuation",
      "scope": ["keyword.operator", "punctuation"],
      "settings": { "foreground": "#89ddff" }
    },
    {
      "name": "HTML/JSX Tags",
      "scope": ["entity.name.tag", "meta.tag.sgml"],
      "settings": { "foreground": "#f7768e" }
    },
    {
      "name": "HTML/JSX Attributes",
      "scope": ["entity.other.attribute-name"],
      "settings": { "foreground": "#bb9af7" }
    }
  ],
  semanticTokenColors: {
    "keyword": { "foreground": "#bb9af7", "italic": true },
    "storage": { "foreground": "#bb9af7", "italic": true },
    "modifier": { "foreground": "#bb9af7", "italic": true },
    "string": "#9ece6a",
    "number": "#ff9e64",
    "boolean": "#ff9e64",
    "function": "#7aa2f7",
    "method": "#7aa2f7",
    "class": { "foreground": "#2ac3de", "bold": true },
    "interface": { "foreground": "#2ac3de", "italic": true },
    "type": "#2ac3de",
    "variable": "#c0caf5",
    "parameter": { "foreground": "#e0af68", "italic": true },
    "property": "#7dcfff",
    "enumMember": "#ff9e64",
    "comment": { "foreground": "#565f89", "italic": true }
  }
};

themeFiles.forEach(file => {
  const filePath = path.join(themesDir, file);
  if (!fs.existsSync(filePath)) return;

  let raw = fs.readFileSync(filePath, 'utf8').replace(/\/\/.*$/gm, '');
  let json = JSON.parse(raw);

  json.tokenColors = tokyoNightSyntax.tokenColors;
  json.semanticTokenColors = tokyoNightSyntax.semanticTokenColors;

  fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
  console.log(`Updated syntax highlighting for ${file}`);
});
