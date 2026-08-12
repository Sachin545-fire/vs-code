import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	let disposable = vscode.commands.registerCommand('zenAi.analyzeCode', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('Zen AI: Please open a file first.');
			return;
		}

		const text = editor.document.getText();
		const lineCount = editor.document.lineCount;

		// Mock AI Analysis Panel
		const panel = vscode.window.createWebviewPanel(
			'zenAiAnalysis',
			'Zen AI Analysis',
			vscode.ViewColumn.Beside,
			{}
		);

		panel.webview.html = getWebviewContent(lineCount);
	});

	context.subscriptions.push(disposable);
}

function getWebviewContent(lineCount: number) {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Zen AI Analysis</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			background-color: transparent;
			color: var(--vscode-editor-foreground);
			padding: 20px;
		}
		.card {
			background: rgba(255,255,255,0.05);
			border: 1px solid rgba(255,255,255,0.1);
			padding: 20px;
			border-radius: 8px;
			box-shadow: 0 4px 12px rgba(0,0,0,0.2);
		}
		.header {
			font-size: 1.2em;
			font-weight: bold;
			color: #a3e635;
			margin-bottom: 12px;
			border-bottom: 1px solid rgba(163,230,53,0.3);
			padding-bottom: 8px;
		}
		.console {
			font-family: monospace;
			background: #000;
			padding: 12px;
			border-radius: 4px;
			color: #a3e635;
			font-size: 13px;
		}
	</style>
</head>
<body>
	<div class="card">
		<div class="header">SYSTEM.AI.ANALYSIS</div>
		<p>Scanning active buffer...</p>
		<div class="console">
			> INGESTING ${lineCount} LINES OF CODE...<br>
			> RUNNING HEURISTICS...<br>
			> 100% COMPLETE.<br><br>
			[DIAGNOSTICS]<br>
			- Complexity: O(n log n)<br>
			- Code smells detected: 0<br>
			- Zen Level: MAXIMUM<br><br>
			> "Your code is beautiful. Keep typing."
		</div>
	</div>
</body>
</html>`;
}

export function deactivate() {}
