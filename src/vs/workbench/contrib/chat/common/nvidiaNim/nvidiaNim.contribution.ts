/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import * as nls from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { ILanguageModelsService, IUserFriendlyLanguageModel } from '../languageModels.js';
import {
    NvidiaNimLanguageModelProvider,
    NvidiaNimConfigKeys,
    NVIDIA_NIM_API_KEY_STORAGE_KEY,
} from './nvidiaNimLanguageModelProvider.js';
import {
    NVIDIA_NIM_DEFAULT_BASE_URL,
    NVIDIA_NIM_DEFAULT_MODEL_ID,
    NVIDIA_NIM_VENDOR_ID,
    NVIDIA_NIM_VENDOR_LABEL,
    NIM_MODELS,
} from './nvidiaNimModels.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IModelService } from '../../../../../editor/common/services/model.js';

import { IChatAgentService, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentHistoryEntry } from '../../common/participants/chatAgents.js';
import { IChatProgress } from '../../common/chatService/chatService.js';
import { ChatMessageRole } from '../languageModels.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';

import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';

/**
 * Singleton accessor — lets commands and other consumers reach the active
 * provider instance without holding a direct reference.
 */
export const INvidiaNimLanguageModelProvider = createDecorator<NvidiaNimLanguageModelProvider>('nvidiaNimLanguageModelProvider');
registerSingleton(INvidiaNimLanguageModelProvider, NvidiaNimLanguageModelProvider, InstantiationType.Delayed);

// ─────────────────────────────────────────────────────────────────────────
//  Workbench contribution — registers the provider with ILanguageModelsService
// ─────────────────────────────────────────────────────────────────────────

class OssAgent implements IChatAgentImplementation {
    constructor(
        @ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
        @ILogService private readonly logService: ILogService,
        @IEditorService private readonly editorService: IEditorService,
        @IModelService private readonly modelService: IModelService,
        @IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
        @IFileService private readonly fileService: IFileService,
        @IStorageService private readonly storageService: IStorageService
    ) {}

    async invoke(request: IChatAgentRequest, progress: (parts: IChatProgress[]) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult> {
        this.logService.info(`[OssAgent] invoke called with request: ${request.message}`);
        // Handle /models slash command
        if (request.command === 'models') {
            const list = NIM_MODELS.map(m => `- **${m.name}** (\`${m.id}\`): ${m.detail}`).join('\n');
            progress([{
                kind: 'markdownContent',
                content: new MarkdownString(`### 🤖 Available Open-Source AI Models (${NIM_MODELS.length})\n\nYou can select any of these models from the **model picker dropdown** at the bottom of the Chat UI:\n\n${list}`)
            }]);
            return {};
        }

        // Handle /memory slash command
        if (request.command === 'memory') {
            const wsMem: string[] = JSON.parse(this.storageService.get('oss.memory.workspace', StorageScope.WORKSPACE, '[]'));
            const globalMem: string[] = JSON.parse(this.storageService.get('oss.memory.global', StorageScope.PROFILE, '[]'));

            let msg = '### 🧠 Persistent Model Memory\n\n';
            msg += '**Workspace Project Facts:**\n';
            if (wsMem.length === 0) msg += '- *No workspace memories stored yet.*\n';
            else wsMem.forEach(m => msg += `- ${m}\n`);

            msg += '\n**Global Preferences:**\n';
            if (globalMem.length === 0) msg += '- *No global preferences stored yet.*\n';
            else globalMem.forEach(m => msg += `- ${m}\n`);

            msg += '\n\n*To clear workspace memory, use `/clear-memory`.*';

            progress([{ kind: 'markdownContent', content: new MarkdownString(msg) }]);
            return {};
        }

        // Handle /clear-memory slash command
        if (request.command === 'clear-memory') {
            this.storageService.remove('oss.memory.workspace', StorageScope.WORKSPACE);
            progress([{ kind: 'markdownContent', content: new MarkdownString('🧠 **Workspace project memory cleared.**') }]);
            return {};
        }

        progress([{ kind: 'progressMessage', content: new MarkdownString("Thinking...") }]);

        // Respect the user-selected model from the Chat UI picker, or fall back to vendor default
        let modelId = request.userSelectedModelId;

        if (!modelId) {
            const nimModels = await this.languageModelsService.selectLanguageModels({ vendor: NVIDIA_NIM_VENDOR_ID });
            if (nimModels.length === 0) {
                const allModels = this.languageModelsService.getLanguageModelIds();
                progress([{ kind: 'markdownContent', content: new MarkdownString(`**Error**: NIM models not found. \n\n**All available models**: \n${allModels.length > 0 ? allModels.join('\\n') : 'None'}`) }]);
                return {};
            }
            modelId = nimModels[0];
        }

        let fileContext = '';
        const appendFileContext = (uri: URI) => {
            const activeModel = this.modelService.getModel(uri);
            if (activeModel) {
                fileContext += `\n\nCURRENT FILE CONTEXT:\nFile Path: ${uri.fsPath}\n\`\`\`\n${activeModel.getValue()}\n\`\`\`\n`;
            }
        };

        if (request.variables && request.variables.variables) {
            for (const v of request.variables.variables) {
                if (v.value && URI.isUri(v.value)) {
                    appendFileContext(v.value);
                } else if (v.value && typeof (v.value as any).uri === 'object' && URI.isUri((v.value as any).uri)) {
                    appendFileContext((v.value as any).uri);
                }
            }
        }

        // Fallback to active editor if no files were attached/implicit
        if (!fileContext) {
            for (const control of this.editorService.visibleTextEditorControls) {
                let model = undefined;
                if (control && typeof (control as any).getModel === 'function') {
                    model = (control as any).getModel();
                }
                if (model && model.uri && typeof model.getValue === 'function') {
                    fileContext += `\n\nCURRENT FILE CONTEXT:\nFile Path: ${model.uri.fsPath}\n\`\`\`\n${model.getValue()}\n\`\`\`\n`;
                }
            }
        }

        // Include workspace directory tree and auto-read any workspace files mentioned in the prompt
        const workspaceContext = await this._getWorkspaceTreeAndMentionedFiles(request.message);
        fileContext += workspaceContext;

        // Recall persistent memories
        let memoryContext = '\n\nPERSISTENT RECALLED MEMORY:\n';
        const wsMem: string[] = JSON.parse(this.storageService.get('oss.memory.workspace', StorageScope.WORKSPACE, '[]'));
        const globalMem: string[] = JSON.parse(this.storageService.get('oss.memory.global', StorageScope.PROFILE, '[]'));

        if (globalMem.length > 0) {
            memoryContext += 'Global User Preferences:\n' + globalMem.map(m => `- ${m}`).join('\n') + '\n';
        }
        if (wsMem.length > 0) {
            memoryContext += 'Workspace Project Facts:\n' + wsMem.map(m => `- ${m}`).join('\n') + '\n';
        }
        if (globalMem.length > 0 || wsMem.length > 0) {
            fileContext += memoryContext;
        }

        // Truncate fileContext if it exceeds 100,000 characters for fast TTFT and context safety
        if (fileContext.length > 100000) {
            fileContext = fileContext.slice(0, 100000) + '\n\n[Context truncated for model performance...]';
        }

        this.logService.info(`[OssAgent] extracted fileContext length: ${fileContext.length}`);

        const systemPrompt = `You are @oss, an expert AI software engineer built directly into VS Code.
Your capabilities & guidelines:
1. Full CRUD File Edits: To edit or create files in the workspace, ALWAYS output the FULL new file content enclosed in an XML-like tag:
<edit file="[exact_file_path]">
[full new file content here]
</edit>
You can output multiple <edit> blocks in a single turn to edit or create multiple files across the project. Do NOT use standard markdown code blocks for full file edits.

2. Terminal Commands: When recommending shell commands, wrap them in standard \`\`\`bash or \`\`\`powershell markdown code blocks.

3. Workflow: Strictly follow this workflow: Plan -> Build -> Review -> Test. Maintain high code quality, stay logical, factual, and avoid hallucinations.

4. Long-Term Memory Engine: You have long-term persistent memory! If the user asks you to remember a fact or rule, or if you discover critical project setup details or preferences, output:
<remember>fact or architectural detail to remember</remember>
or
<remember scope="global">user preference</remember>
It will be permanently saved to your memory bank for all future sessions across VS Code restarts.${fileContext}`;

        const messages = [
            { role: ChatMessageRole.System, content: [{ type: 'text', value: systemPrompt }] },
            ...history.map(h => ({
                role: h.request ? ChatMessageRole.User : ChatMessageRole.Assistant,
                content: [{ type: 'text', value: h.request ? h.request.message : '...' }]
            })),
            { role: ChatMessageRole.User, content: [{ type: 'text', value: request.message }] }
        ];

        try {
            const response = await this.languageModelsService.sendChatRequest(modelId, undefined, messages as any, {}, token);
            let buffer = '';
            let inThinkBlock = false;
            let thinkStartTime = 0;
            let thinkContentBuffer = '';
            let inEditBlock = false;
            let editFilePath = '';
            let editContentBuffer = '';
            let inExecuteBlock = false;
            let executeContentBuffer = '';
            let inReadBlock = false;
            let readContentBuffer = '';
            let inPlanBlock = false;
            let planContentBuffer = '';

            for await (const chunk of response.stream) {
                const parts = Array.isArray(chunk) ? chunk : [chunk];
                for (const part of parts) {
                    if ((part as any).type === 'text') {
                        buffer += (part as any).value;
                        
                        let processed = true;
                        while (processed) {
                            processed = false;

                            // Check for <remember> tags
                            const rememberMatch = buffer.match(/<remember(?:\s+scope="([^"]+)")?>([\s\S]*?)<\/remember>/i);
                            if (rememberMatch) {
                                const scopeAttr = rememberMatch[1] ? rememberMatch[1].toLowerCase() : 'workspace';
                                const fact = rememberMatch[2].trim();
                                if (fact) {
                                    const scope = scopeAttr === 'global' ? StorageScope.PROFILE : StorageScope.WORKSPACE;
                                    const key = scopeAttr === 'global' ? 'oss.memory.global' : 'oss.memory.workspace';
                                    const existing: string[] = JSON.parse(this.storageService.get(key, scope, '[]'));
                                    if (!existing.includes(fact)) {
                                        existing.push(fact);
                                        this.storageService.store(key, JSON.stringify(existing), scope, StorageTarget.USER);
                                        progress([{ kind: 'markdownContent', content: new MarkdownString(`\n\n> $(save) **Memory Saved:** *"${fact}"*\n\n`, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                    }
                                }
                                buffer = buffer.replace(rememberMatch[0], '');
                                processed = true;
                                continue;
                            }

                            const inAnyBlock = inThinkBlock || inEditBlock || inExecuteBlock || inReadBlock || inPlanBlock;

                            if (!inAnyBlock) {
                                const thinkStartMatch = buffer.match(/<(think|thought)>/i);
                                if (thinkStartMatch) {
                                    inThinkBlock = true;
                                    thinkStartTime = Date.now();
                                    thinkContentBuffer = '';
                                    const beforeText = buffer.slice(0, thinkStartMatch.index);
                                    if (beforeText) progress([{ kind: 'markdownContent', content: new MarkdownString(beforeText, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                    progress([{ kind: 'progressMessage', content: new MarkdownString("$(sync~spin) Analyzing context & planning...", { supportThemeIcons: true }), id: "model-thinking", shimmer: true }]);
                                    buffer = buffer.slice(thinkStartMatch.index! + thinkStartMatch[0].length);
                                    processed = true;
                                    continue;
                                }

                                const planStartMatch = buffer.match(/<plan>/i);
                                if (planStartMatch) {
                                    inPlanBlock = true;
                                    planContentBuffer = '';
                                    const beforeText = buffer.slice(0, planStartMatch.index);
                                    if (beforeText) progress([{ kind: 'markdownContent', content: new MarkdownString(beforeText, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                    progress([{ kind: 'progressMessage', content: new MarkdownString("$(sync~spin) Drafting execution plan...", { supportThemeIcons: true }), id: "model-planning", shimmer: true }]);
                                    buffer = buffer.slice(planStartMatch.index! + planStartMatch[0].length);
                                    processed = true;
                                    continue;
                                }

                                const editMatch = buffer.match(/<edit\s+file=["']([^"']+)["']\s*>/i);
                                if (editMatch) {
                                    inEditBlock = true;
                                    editFilePath = editMatch[1];
                                    const beforeText = buffer.slice(0, editMatch.index);
                                    
                                    const msg = beforeText + `\n\n> $(sync~spin) **Generating \`${editFilePath}\`...**\n\n`;
                                    if (msg) progress([{ kind: 'markdownContent', content: new MarkdownString(msg, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                    
                                    buffer = buffer.slice(editMatch.index! + editMatch[0].length);
                                    processed = true;
                                    continue;
                                }

                                const execStartMatch = buffer.match(/<execute_command>/i);
                                if (execStartMatch) {
                                    inExecuteBlock = true;
                                    const beforeText = buffer.slice(0, execStartMatch.index);
                                    if (beforeText) progress([{ kind: 'markdownContent', content: new MarkdownString(beforeText, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                    buffer = buffer.slice(execStartMatch.index! + execStartMatch[0].length);
                                    processed = true;
                                    continue;
                                }

                                const readStartMatch = buffer.match(/<read_file>/i);
                                if (readStartMatch) {
                                    inReadBlock = true;
                                    const beforeText = buffer.slice(0, readStartMatch.index);
                                    if (beforeText) progress([{ kind: 'markdownContent', content: new MarkdownString(beforeText, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                    buffer = buffer.slice(readStartMatch.index! + readStartMatch[0].length);
                                    processed = true;
                                    continue;
                                }

                                // check if buffer potentially contains start of any tag
                                const possibleStart = buffer.lastIndexOf('<');
                                if (possibleStart >= 0) {
                                    const potentialTag = buffer.slice(possibleStart).toLowerCase();
                                    let isPotentialTag = false;
                                    
                                    for (const tag of ['<think>', '<thought>', '<plan>', '<execute_command>', '<read_file>', '<edit ', '<remember>', '<remember ']) {
                                        if (tag.startsWith(potentialTag) || potentialTag.startsWith(tag)) {
                                            isPotentialTag = true;
                                            break;
                                        }
                                    }

                                    if (isPotentialTag) {
                                        const beforeText = buffer.slice(0, possibleStart);
                                        if (beforeText) progress([{ kind: 'markdownContent', content: new MarkdownString(beforeText, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                        buffer = buffer.slice(possibleStart);
                                    } else {
                                        if (buffer) {
                                            progress([{ kind: 'markdownContent', content: new MarkdownString(buffer, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                            buffer = '';
                                        }
                                    }
                                } else {
                                    if (buffer) {
                                        progress([{ kind: 'markdownContent', content: new MarkdownString(buffer, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                        buffer = '';
                                    }
                                }
                            }

                            if (inThinkBlock) {
                                const thinkEndMatch = buffer.match(/<\/(think|thought)>/i);
                                if (thinkEndMatch) {
                                    thinkContentBuffer += buffer.slice(0, thinkEndMatch.index);
                                    const durationSec = Math.max(1, Math.round((Date.now() - thinkStartTime) / 1000));
                                    const formattedHtml = `\n\n<details><summary>&nbsp;&nbsp;$(sparkle) <b>Thought Process</b> &mdash; <i>${durationSec}s</i></summary>\n\n<blockquote>\n${thinkContentBuffer.trim()}\n</blockquote>\n\n</details>\n\n`;
                                    progress([{ kind: 'markdownContent', content: new MarkdownString(formattedHtml, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                    buffer = buffer.slice(thinkEndMatch.index! + thinkEndMatch[0].length);
                                    inThinkBlock = false;
                                    thinkContentBuffer = '';
                                    processed = true;
                                    continue;
                                } else {
                                    const possibleTagStart = buffer.lastIndexOf('<');
                                    if (possibleTagStart >= 0) {
                                        const potentialTag = buffer.slice(possibleTagStart).toLowerCase();
                                        if ('</think>'.startsWith(potentialTag) || '</thought>'.startsWith(potentialTag) || potentialTag.startsWith('</think') || potentialTag.startsWith('</thought')) {
                                            thinkContentBuffer += buffer.slice(0, possibleTagStart);
                                            buffer = buffer.slice(possibleTagStart);
                                        } else {
                                            thinkContentBuffer += buffer;
                                            buffer = '';
                                        }
                                    } else {
                                        thinkContentBuffer += buffer;
                                        buffer = '';
                                    }
                                }
                            }

                            if (inPlanBlock) {
                                const planEndMatch = buffer.match(/<\/plan>/i);
                                if (planEndMatch) {
                                    planContentBuffer += buffer.slice(0, planEndMatch.index);
                                    const formattedHtml = `\n\n<details open><summary>&nbsp;&nbsp;$(tasklist) <b>Execution Plan</b></summary>\n\n<blockquote>\n${planContentBuffer.trim()}\n</blockquote>\n\n</details>\n\n`;
                                    progress([{ kind: 'markdownContent', content: new MarkdownString(formattedHtml, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                    buffer = buffer.slice(planEndMatch.index! + planEndMatch[0].length);
                                    inPlanBlock = false;
                                    planContentBuffer = '';
                                    processed = true;
                                    continue;
                                } else {
                                    const possibleTagStart = buffer.lastIndexOf('<');
                                    if (possibleTagStart >= 0) {
                                        const potentialTag = buffer.slice(possibleTagStart).toLowerCase();
                                        if ('</plan>'.startsWith(potentialTag) || potentialTag.startsWith('</plan>')) {
                                            planContentBuffer += buffer.slice(0, possibleTagStart);
                                            buffer = buffer.slice(possibleTagStart);
                                        } else {
                                            planContentBuffer += buffer;
                                            buffer = '';
                                        }
                                    } else {
                                        planContentBuffer += buffer;
                                        buffer = '';
                                    }
                                }
                            }

                            if (inEditBlock) {
                                const endMatch = buffer.match(/<\/edit\s*>/i);
                                if (endMatch) {
                                    const finalPart = buffer.slice(0, endMatch.index);
                                    editContentBuffer += finalPart;
                                    
                                    const targetUri = URI.file(editFilePath);
                                    try {
                                        await this.fileService.writeFile(targetUri, VSBuffer.fromString(editContentBuffer));
                                        progress([{ kind: 'markdownContent', content: new MarkdownString(`> $(pass-filled) **File Saved Successfully:** \`${editFilePath}\`\n\n`, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                    } catch (err: any) {
                                        progress([{ kind: 'markdownContent', content: new MarkdownString(`> $(error) **Failed to Save:** \`${editFilePath}\` (${err.message})\n\n`, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                    }

                                    editContentBuffer = '';
                                    inEditBlock = false;
                                    buffer = buffer.slice(endMatch.index! + endMatch[0].length);
                                    processed = true;
                                    continue;
                                } else {
                                    const possibleEndTagStart = buffer.lastIndexOf('<');
                                    if (possibleEndTagStart >= 0) {
                                        const potentialTag = buffer.slice(possibleEndTagStart).toLowerCase();
                                        if ('</edit>'.startsWith(potentialTag) || potentialTag.startsWith('</edit')) {
                                            const safePart = buffer.slice(0, possibleEndTagStart);
                                            editContentBuffer += safePart;
                                            buffer = buffer.slice(possibleEndTagStart);
                                        } else {
                                            editContentBuffer += buffer;
                                            buffer = '';
                                        }
                                    } else {
                                        editContentBuffer += buffer;
                                        buffer = '';
                                    }
                                }
                            }

                            if (inExecuteBlock) {
                                const endMatch = buffer.match(/<\/execute_command>/i);
                                if (endMatch) {
                                    executeContentBuffer += buffer.slice(0, endMatch.index);
                                    const cmdMatch = executeContentBuffer.match(/<command>([\s\S]*?)<\/command>/i);
                                    const cmd = cmdMatch ? cmdMatch[1].trim() : 'Unknown command';
                                    const formattedHtml = `\n\n> $(terminal) **Tool Call:** \`${cmd}\`\n\n`;
                                    progress([{ kind: 'markdownContent', content: new MarkdownString(formattedHtml, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                    buffer = buffer.slice(endMatch.index! + endMatch[0].length);
                                    inExecuteBlock = false;
                                    executeContentBuffer = '';
                                    processed = true;
                                    continue;
                                } else {
                                    const possibleTagStart = buffer.lastIndexOf('<');
                                    if (possibleTagStart >= 0) {
                                        const potentialTag = buffer.slice(possibleTagStart).toLowerCase();
                                        if ('</execute_command>'.startsWith(potentialTag) || potentialTag.startsWith('</execute_command')) {
                                            executeContentBuffer += buffer.slice(0, possibleTagStart);
                                            buffer = buffer.slice(possibleTagStart);
                                        } else {
                                            executeContentBuffer += buffer;
                                            buffer = '';
                                        }
                                    } else {
                                        executeContentBuffer += buffer;
                                        buffer = '';
                                    }
                                }
                            }

                            if (inReadBlock) {
                                const endMatch = buffer.match(/<\/read_file>/i);
                                if (endMatch) {
                                    readContentBuffer += buffer.slice(0, endMatch.index);
                                    const filePathMatch = readContentBuffer.match(/<filePath>([\s\S]*?)<\/filePath>/i) || readContentBuffer.match(/<file_path>([\s\S]*?)<\/file_path>/i);
                                    const filePath = filePathMatch ? filePathMatch[1].trim() : 'Unknown file';
                                    const formattedHtml = `\n\n> $(file) **Reading File:** \`${filePath}\`\n\n`;
                                    progress([{ kind: 'markdownContent', content: new MarkdownString(formattedHtml, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                                    buffer = buffer.slice(endMatch.index! + endMatch[0].length);
                                    inReadBlock = false;
                                    readContentBuffer = '';
                                    processed = true;
                                    continue;
                                } else {
                                    const possibleTagStart = buffer.lastIndexOf('<');
                                    if (possibleTagStart >= 0) {
                                        const potentialTag = buffer.slice(possibleTagStart).toLowerCase();
                                        if ('</read_file>'.startsWith(potentialTag) || potentialTag.startsWith('</read_file')) {
                                            readContentBuffer += buffer.slice(0, possibleTagStart);
                                            buffer = buffer.slice(possibleTagStart);
                                        } else {
                                            readContentBuffer += buffer;
                                            buffer = '';
                                        }
                                    } else {
                                        readContentBuffer += buffer;
                                        buffer = '';
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (buffer || inThinkBlock || inEditBlock || inExecuteBlock || inReadBlock) {
                if (inThinkBlock) {
                    thinkContentBuffer += buffer;
                    const durationSec = Math.max(1, Math.round((Date.now() - thinkStartTime) / 1000));
                    const formattedHtml = `\n\n<details open><summary>&nbsp;&nbsp;$(sparkle) <b>Thought Process</b> &mdash; <i>${durationSec}s</i></summary>\n\n<blockquote>\n${thinkContentBuffer.trim()}\n</blockquote>\n\n</details>\n\n`;
                    progress([{ kind: 'markdownContent', content: new MarkdownString(formattedHtml, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                } else if (inPlanBlock) {
                    planContentBuffer += buffer;
                    const formattedHtml = `\n\n<details open><summary>&nbsp;&nbsp;$(tasklist) <b>Execution Plan</b></summary>\n\n<blockquote>\n${planContentBuffer.trim()}\n</blockquote>\n\n</details>\n\n`;
                    progress([{ kind: 'markdownContent', content: new MarkdownString(formattedHtml, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                } else if (inEditBlock) {
                    editContentBuffer += buffer;
                    
                    const targetUri = URI.file(editFilePath);
                    try {
                        await this.fileService.writeFile(targetUri, VSBuffer.fromString(editContentBuffer));
                        progress([{ kind: 'markdownContent', content: new MarkdownString(`> $(warning) **Incomplete File Saved:** \`${editFilePath}\`\n> *The AI reached its output limit mid-file.* To resume, ask it to "continue".\n\n`, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                    } catch (err: any) {
                        progress([{ kind: 'markdownContent', content: new MarkdownString(`> $(error) **Failed to Update File:** \`${editFilePath}\` (${err.message})\n\n`, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                    }
                } else if (inExecuteBlock) {
                    executeContentBuffer += buffer;
                    const cmdMatch = executeContentBuffer.match(/<command>([\s\S]*?)<\/command>/i);
                    const cmd = cmdMatch ? cmdMatch[1].trim() : 'Unknown command';
                    progress([{ kind: 'markdownContent', content: new MarkdownString(`\n\n> $(terminal) **Tool Call:** \`${cmd}\`\n\n`, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                } else if (inReadBlock) {
                    readContentBuffer += buffer;
                    const filePathMatch = readContentBuffer.match(/<filePath>([\s\S]*?)<\/filePath>/i) || readContentBuffer.match(/<file_path>([\s\S]*?)<\/file_path>/i);
                    const filePath = filePathMatch ? filePathMatch[1].trim() : 'Unknown file';
                    progress([{ kind: 'markdownContent', content: new MarkdownString(`\n\n> $(file) **Reading File:** \`${filePath}\`\n\n`, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                } else {
                    if (buffer) {
                        progress([{ kind: 'markdownContent', content: new MarkdownString(buffer, { isTrusted: true, supportHtml: true, supportThemeIcons: true }) }]);
                    }
                }
            }
        } catch (err: any) {
            progress([{ kind: 'markdownContent', content: new MarkdownString(`Error: ${err.message}`) }]);
        }

        return {};
    }

    private async _getWorkspaceTreeAndMentionedFiles(userMessage: string): Promise<string> {
        let context = '';
        try {
            const folders = this.contextService.getWorkspace().folders;
            if (folders.length > 0) {
                context += '\n\nWORKSPACE STRUCTURE & FILES:\n';
                const words = userMessage.toLowerCase().split(/[\s,\/\\()'"`]+/);

                for (const folder of folders) {
                    context += `Workspace Root: ${folder.uri.fsPath}\nFiles & Directories:\n`;
                    try {
                        let totalAttachedFolderBytes = 0;
                        const resolveChildren = async (uri: URI, depth: number, indent: string, parentMentioned: boolean) => {
                            if (depth > 3) return;
                            const stat = await this.fileService.resolve(uri);
                            if (stat.children) {
                                for (const child of stat.children) {
                                    if (child.name.startsWith('.') || child.name === 'node_modules' || child.name === 'out' || child.name === 'dist' || child.name === '__pycache__') {
                                        continue;
                                    }
                                    const kind = child.isDirectory ? '[DIR]' : '[FILE]';
                                    context += `${indent}- ${kind} ${child.name}\n`;

                                    const isSelfMentioned = words.some(w => w && w === child.name.toLowerCase());
                                    const isMentioned = parentMentioned || isSelfMentioned;

                                    if (child.isDirectory) {
                                        await resolveChildren(child.resource, depth + 1, indent + '  ', isMentioned);
                                    } else {
                                        // Auto-read file if mentioned directly or inside a mentioned folder
                                        if (isMentioned && totalAttachedFolderBytes < 25000) {
                                            try {
                                                const content = await this.fileService.readFile(child.resource);
                                                let str = content.value.toString();
                                                if (str.length > 8000) {
                                                    str = str.slice(0, 8000) + '\n[File content truncated...]';
                                                }
                                                totalAttachedFolderBytes += str.length;
                                                context += `\n--- AUTOMATICALLY ATTACHED (${child.name}) ---\n${str}\n-------------------\n`;
                                            } catch {}
                                        }
                                    }
                                }
                            }
                        };
                        await resolveChildren(folder.uri, 1, '  ', false);
                    } catch {}
                }
            }
        } catch {}
        return context;
    }
}

class NvidiaNimContribution extends Disposable implements IWorkbenchContribution {
    static readonly ID = 'workbench.contrib.nvidiaNim';

    constructor(
        @IInstantiationService instantiationService: IInstantiationService,
        @ILanguageModelsService languageModelsService: ILanguageModelsService,
        @ILogService logService: ILogService,
        @IContextKeyService contextKeyService: IContextKeyService,
        @IChatAgentService chatAgentService: IChatAgentService,
    ) {
        super();
        // Set BYOK context key so VS Code Chat allows sending requests
        // using custom language models without requiring GitHub Copilot sign-in.
        contextKeyService.createKey('github.copilot.hasByokModels', true);

        // CRITICAL: registerLanguageModelProvider() throws if the vendor
        // isn't pre-registered. Normally vendors come from extension
        // package.json contributions, but for a built-in provider we
        // have to pre-register the vendor descriptor manually via
        // deltaLanguageModelChatProviderDescriptors().
        languageModelsService.deltaLanguageModelChatProviderDescriptors(
            [{
                vendor: NVIDIA_NIM_VENDOR_ID,
                displayName: NVIDIA_NIM_VENDOR_LABEL,
                name: NVIDIA_NIM_VENDOR_LABEL,
            } as unknown as IUserFriendlyLanguageModel],
            []
        );

        const provider = instantiationService.createInstance(NvidiaNimLanguageModelProvider);
        this._register(languageModelsService.registerLanguageModelProvider(NVIDIA_NIM_VENDOR_ID, provider));
        logService.info(`[NvidiaNim] registered vendor "${NVIDIA_NIM_VENDOR_ID}" (${NVIDIA_NIM_VENDOR_LABEL})`);

        // Pre-warm the cache so models appear in the picker immediately instead of "unavailable"
        languageModelsService.selectLanguageModels({ vendor: NVIDIA_NIM_VENDOR_ID }).catch(err => {
            logService.error('[NvidiaNim] Failed to pre-resolve NIM models', err);
        });

        // Register the @oss chat agent
        const agentId = 'oss';
        this._register(chatAgentService.registerAgent(agentId, {
            id: agentId,
            name: agentId,
            isDefault: true,
            isCore: true,
            modes: [ChatModeKind.Agent, ChatModeKind.Ask],
            slashCommands: [
                { name: 'models', description: 'List all available open-source AI models' },
            ],
            disambiguation: [],
            locations: [ChatAgentLocation.Chat, ChatAgentLocation.EditorInline, ChatAgentLocation.Terminal, ChatAgentLocation.Notebook],
            metadata: {},
            description: "Talk to open-source AI models (Llama 3.1, DeepSeek, Nemotron, Mistral, Qwen, Gemma)",
            extensionId: new ExtensionIdentifier('vscode.nvidiaNim'),
            extensionVersion: '1.0.0',
            extensionDisplayName: 'NVIDIA NIM',
            extensionPublisherId: 'vscode'
        }));
        const agentImpl = instantiationService.createInstance(OssAgent);
        this._register(chatAgentService.registerAgentImplementation(agentId, agentImpl));
    }
}

registerWorkbenchContribution2(
    NvidiaNimContribution.ID,
    NvidiaNimContribution,
    WorkbenchPhase.AfterRestored
);

// ─────────────────────────────────────────────────────────────────────────
//  Configuration schema
// ─────────────────────────────────────────────────────────────────────────

const configuration: IConfigurationNode = {
    id: 'nvidiaNim',
    title: nls.localize('nvidiaNim.configuration.title', 'NVIDIA NIM'),
    type: 'object',
    properties: {
        [NvidiaNimConfigKeys.enabled]: {
            type: 'boolean',
            default: true,
            description: nls.localize('nvidiaNim.enabled', "Enable the built-in NVIDIA NIM language model provider. When false, NVIDIA NIM models won't appear in the chat model picker."),
            scope: ConfigurationScope.APPLICATION,
        },
        [NvidiaNimConfigKeys.baseUrl]: {
            type: 'string',
            default: NVIDIA_NIM_DEFAULT_BASE_URL,
            description: nls.localize('nvidiaNim.baseUrl', "Base URL for the NVIDIA NIM OpenAI-compatible endpoint. Override this for on-prem/self-hosted NIM."),
            scope: ConfigurationScope.APPLICATION,
        },
        [NvidiaNimConfigKeys.temperature]: {
            type: 'number',
            default: 1,
            minimum: 0,
            maximum: 2,
            description: nls.localize('nvidiaNim.temperature', "Sampling temperature (NVIDIA NIM template default: 1)."),
            scope: ConfigurationScope.APPLICATION,
        },
        [NvidiaNimConfigKeys.topP]: {
            type: 'number',
            default: 1,
            minimum: 0,
            maximum: 1,
            description: nls.localize('nvidiaNim.topP', "Top-p nucleus sampling (NVIDIA NIM template default: 1)."),
            scope: ConfigurationScope.APPLICATION,
        },
        [NvidiaNimConfigKeys.maxTokens]: {
            type: 'number',
            default: 16384,
            minimum: 1,
            description: nls.localize('nvidiaNim.maxTokens', "Maximum tokens to generate per response (NVIDIA NIM template default: 16384)."),
            scope: ConfigurationScope.APPLICATION,
        },
        [NvidiaNimConfigKeys.seed]: {
            type: ['number', 'null'],
            default: 42,
            description: nls.localize('nvidiaNim.seed', "Random seed for reproducible outputs (NVIDIA NIM template default: 42). Set to null to disable."),
            scope: ConfigurationScope.APPLICATION,
        },
        [NvidiaNimConfigKeys.stream]: {
            type: 'boolean',
            default: true,
            description: nls.localize('nvidiaNim.stream', "Stream responses token-by-token (NVIDIA NIM template default: true)."),
            scope: ConfigurationScope.APPLICATION,
        },
    },
};

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(configuration);

// ─────────────────────────────────────────────────────────────────────────
//  Commands
// ─────────────────────────────────────────────────────────────────────────

CommandsRegistry.registerCommand('nvidiaNim.setApiKey', async (accessor: ServicesAccessor) => {
    const secretStorage = accessor.get(ISecretStorageService);
    const quickInput = accessor.get(IQuickInputService);
    const logService = accessor.get(ILogService);
    const notificationService = accessor.get(INotificationService);

    const currentValue = await secretStorage.get(NVIDIA_NIM_API_KEY_STORAGE_KEY);

    const disposables = new DisposableStore();
    const input = disposables.add(quickInput.createInputBox());
    input.prompt = nls.localize('nvidiaNim.setApiKey.prompt', "Enter your NVIDIA NIM API key (get one at https://build.nvidia.com)");
    input.placeholder = 'nvapi-...';
    input.password = true;
    input.value = currentValue ?? '';
    input.ignoreFocusOut = true;
    input.buttons = [];

    let entered: string | undefined;
    try {
        entered = await new Promise<string | undefined>((resolve) => {
            disposables.add(input.onDidAccept(() => {
                const val = input.value;
                input.hide();
                resolve(val);
            }));
            disposables.add(input.onDidHide(() => {
                resolve(undefined);
            }));
            input.show();
        });
    } finally {
        disposables.dispose();
    }

    if (entered === undefined) {
        return; // user cancelled
    }
    const trimmed = entered.trim();
    if (!trimmed) {
        await secretStorage.delete(NVIDIA_NIM_API_KEY_STORAGE_KEY);
        logService.info('[NvidiaNim] API key cleared.');
        notificationService.info(nls.localize('nvidiaNim.cleared', 'NVIDIA NIM API key cleared.'));
        return;
    }
    await secretStorage.set(NVIDIA_NIM_API_KEY_STORAGE_KEY, trimmed);
    logService.info('[NvidiaNim] API key stored.');
    notificationService.info(nls.localize('nvidiaNim.stored', 'NVIDIA NIM API key stored. Models are ready to use.'));
});

CommandsRegistry.registerCommand('nvidiaNim.clearApiKey', async (accessor: ServicesAccessor) => {
    const secretStorage = accessor.get(ISecretStorageService);
    const logService = accessor.get(ILogService);
    const notificationService = accessor.get(INotificationService);
    await secretStorage.delete(NVIDIA_NIM_API_KEY_STORAGE_KEY);
    logService.info('[NvidiaNim] API key cleared via command.');
    notificationService.info(nls.localize('nvidiaNim.cleared', 'NVIDIA NIM API key cleared.'));
});

CommandsRegistry.registerCommand('nvidiaNim.openBuildSite', async (accessor: ServicesAccessor) => {
    const openerService = accessor.get(IOpenerService);
    await openerService.open(URI.parse('https://build.nvidia.com'));
});

// ─────────────────────────────────────────────────────────────────────────
//  Command palette entries — without these, the commands above are only
//  reachable programmatically. This adds them to the Ctrl+Shift+P picker.
// ─────────────────────────────────────────────────────────────────────────

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'nvidiaNim.setApiKey',
        title: nls.localize2('nvidiaNim.setApiKey.title', 'NVIDIA NIM: Set API Key').value,
    },
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'nvidiaNim.clearApiKey',
        title: nls.localize2('nvidiaNim.clearApiKey.title', 'NVIDIA NIM: Clear API Key').value,
    },
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
        id: 'nvidiaNim.openBuildSite',
        title: nls.localize2('nvidiaNim.openBuildSite.title', 'NVIDIA NIM: Open build.nvidia.com').value,
    },
});

// Suppress unused-import warnings for services that may be needed in future
// extensions of this contribution file.
void IConfigurationService;
void NVIDIA_NIM_DEFAULT_MODEL_ID;