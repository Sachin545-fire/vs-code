const fs = require('fs');
const path = require('path');

const themesDir = path.join(__dirname, 'extensions/theme-defaults/themes');
const cherryPath = path.join(themesDir, 'zen_cherry.json');
const oceanPath = path.join(themesDir, 'zen_ocean.json');
const limePath = path.join(themesDir, 'zen_lime.json');

function patchTheme(filePath, keywordColor, stringColor, functionColor) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Strip single line comments
    content = content.replace(/\/\/.*$/gm, '');
    let theme = JSON.parse(content);

    // Patch semanticTokenColors
    if (theme.semanticTokenColors) {
        theme.semanticTokenColors['keyword'] = keywordColor;
        theme.semanticTokenColors['modifier'] = keywordColor;
        theme.semanticTokenColors['label'] = keywordColor;
        theme.semanticTokenColors['string'] = stringColor;
        theme.semanticTokenColors['function'] = functionColor;
        theme.semanticTokenColors['method'] = functionColor;
    }

    // Patch tokenColors
    theme.tokenColors.forEach(token => {
        if (!token.name) return;
        const name = token.name.toLowerCase();
        if (name.includes('keyword') || name.includes('storage')) {
            token.settings.foreground = keywordColor;
        } else if (name.includes('string')) {
            token.settings.foreground = stringColor;
        } else if (name.includes('function')) {
            token.settings.foreground = functionColor;
        }
    });

    fs.writeFileSync(filePath, JSON.stringify(theme, null, 2));
}

// For Cherry: Pink Keywords, Amber Strings, Cyan Functions
patchTheme(cherryPath, '#f472b6', '#fbbf24', '#67e8f9');

// For Ocean: Purple Keywords, Green Strings, Blue Functions
patchTheme(oceanPath, '#c084fc', '#a3e635', '#38bdf8');

// Also balance Lime: Purple Keywords, Yellow Strings, Cyan Functions
patchTheme(limePath, '#c084fc', '#fbbf24', '#67e8f9');

console.log('Themes patched!');
