const { glob } = require('glob');
const minimatch = require('minimatch');
console.log(minimatch('node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe', '**/@openai/codex-{darwin,linux,win32}-*/**'));
console.log(minimatch('node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe', '**/@anthropic-ai/claude-agent-sdk-{darwin,linux,win32}-*/**'));
