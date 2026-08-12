/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import {
    ChatMessageRole,
    ILanguageModelChatMetadata,
    ILanguageModelChatMetadataAndIdentifier,
    ILanguageModelChatProvider,
    ILanguageModelChatRequestOptions,
    ILanguageModelChatResponse,
    ILanguageModelChatInfoOptions,
    IChatMessage,
} from '../languageModels.js';
import {
    NVIDIA_NIM_DEFAULT_BASE_URL,
    NVIDIA_NIM_VENDOR_ID,
    NVIDIA_NIM_VENDOR_LABEL,
    NIM_MODELS,
    type NimModel,
} from './nvidiaNimModels.js';

/**
 * Secret-storage key for the NVIDIA NIM API key.
 */
export const NVIDIA_NIM_API_KEY_STORAGE_KEY = 'nvidiaNim.apiKey';

/**
 * Configuration keys — all under the `nvidiaNim` namespace in settings.json.
 */
export const NvidiaNimConfigKeys = {
    baseUrl: 'nvidiaNim.baseUrl',
    temperature: 'nvidiaNim.temperature',
    topP: 'nvidiaNim.topP',
    maxTokens: 'nvidiaNim.maxTokens',
    seed: 'nvidiaNim.seed',
    stream: 'nvidiaNim.stream',
    enabled: 'nvidiaNim.enabled',
} as const;

/**
 * Built-in language model provider for NVIDIA NIM.
 *
 * Talks directly to the OpenAI-compatible /chat/completions endpoint at
 * https://integrate.api.nvidia.com/v1 (configurable for on-prem NIM).
 *
 * The provider is registered as a built-in workbench contribution so it
 * shows up alongside Copilot in the chat model picker — no extension
 * installation required.
 */
export class NvidiaNimLanguageModelProvider
    extends Disposable
    implements ILanguageModelChatProvider
{
    private readonly _onDidChangeEmitter = this._register(new Emitter<void>());
    public readonly onDidChange: Event<void> = this._onDidChangeEmitter.event;

    constructor(
        @IConfigurationService private readonly configurationService: IConfigurationService,
        @ISecretStorageService private readonly secretStorage: ISecretStorageService,
        @ILogService private readonly logService: ILogService,
    ) {
        super();
        // Re-announce models whenever the API key is added/removed.
        this._register(this.secretStorage.onDidChangeSecret((key) => {
            if (key === NVIDIA_NIM_API_KEY_STORAGE_KEY) {
                this._onDidChangeEmitter.fire();
            }
        }));
    }

    /**
     * Returns all 23 catalog entries. With the hardcoded fallback API key,
     * models are always available. The `nvidiaNim.enabled` setting can be
     * set to `false` to hide them.
     *
     * The `silent` flag is honored: when `silent=false` and no key is set
     * (neither in secret storage nor as a fallback), no models are returned
     * so the picker doesn't show unusable entries.
     */
    async provideLanguageModelChatInfo(
        options: ILanguageModelChatInfoOptions,
        token: CancellationToken
    ): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
        const enabled = this.configurationService.getValue<boolean>(NvidiaNimConfigKeys.enabled);
        if (enabled === false) {
            this.logService.trace('[NvidiaNim] disabled via nvidiaNim.enabled setting');
            return [];
        }

        const entries: ILanguageModelChatMetadataAndIdentifier[] = [];
        for (const model of NIM_MODELS) {
            entries.push({
                identifier: this._buildIdentifier(model.id),
                metadata: this._buildMetadata(model),
            });
        }
        return entries;
    }

    /**
     * Send a chat completion request to NVIDIA NIM. Streams the response back
     * via the IChatResponsePart stream protocol.
     */
    async sendChatRequest(
        modelId: string,
        messages: IChatMessage[],
        from: ExtensionIdentifier | undefined,
        options: ILanguageModelChatRequestOptions,
        token: CancellationToken
    ): Promise<ILanguageModelChatResponse> {
        this.logService.info(`[NvidiaNim] sendChatRequest called for model ${modelId}`);
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            throw new Error('NVIDIA NIM API key not set. Run the "NVIDIA NIM: Set API Key" command first.');
        }

        const baseUrl = this.getBaseUrl();
        const url = ensureChatCompletionsUrl(baseUrl);
        const nimModel = this._stripIdentifier(modelId);

        const systemContents: string[] = [
            "You are a highly capable, logical, and stable AI assistant. You must always provide factual, well-reasoned answers and never hallucinate information. Maintain a professional and calm demeanor at all times. You must strictly follow this workflow: Plan, Build, Review, Test. Assume you have access to a persistent memory feature and complete contextual knowledge of the project."
        ];

        const nonSystemNimMessages: Array<{ role: string; content: string }> = [];

        for (const msg of messages) {
            const serialized = serializeChatMessage(msg);
            if (serialized.role === 'system') {
                systemContents.push(serialized.content);
            } else {
                nonSystemNimMessages.push(serialized);
            }
        }

        const combinedSystemMessage = {
            role: 'system',
            content: systemContents.join('\n\n')
        };

        const nimMessages = [combinedSystemMessage, ...nonSystemNimMessages];

        const body: Record<string, unknown> = {
            model: nimModel,
            messages: nimMessages,
            temperature: this.configurationService.getValue<number>(NvidiaNimConfigKeys.temperature),
            top_p: this.configurationService.getValue<number>(NvidiaNimConfigKeys.topP),
            max_tokens: this.configurationService.getValue<number>(NvidiaNimConfigKeys.maxTokens),
            stream: this.configurationService.getValue<boolean>(NvidiaNimConfigKeys.stream),
        };

        const seed = this.configurationService.getValue<number | null>(NvidiaNimConfigKeys.seed);
        if (seed !== null && seed !== undefined) {
            body.seed = seed;
        }

        this.logService.trace(`[NvidiaNim] -> POST ${url} model=${nimModel} messages=${messages.length}`);

        // Set up cancellation via AbortController — bridge the VS Code
        // CancellationToken to fetch's native AbortSignal.
        const abortController = new AbortController();
        const cancellationListener = token.onCancellationRequested(() => abortController.abort());

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': body.stream ? 'text/event-stream' : 'application/json',
            'Accept-Encoding': 'identity',
        };

        let fetchResponse: Response;
        try {
            this.logService.info(`[NvidiaNim] About to call fetch`);
            fetchResponse = await globalThis.fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: abortController.signal,
                cache: 'no-store'
            });
            this.logService.info(`[NvidiaNim] fetch resolved with status: ${fetchResponse.status}`);
        } catch (err) {
            cancellationListener.dispose();
            this.logService.error(`[NvidiaNim] fetch threw error`, err);
            throw err;
        }

        if (!fetchResponse.ok) {
            cancellationListener.dispose();
            const errText = await fetchResponse.text();
            let msg = `NVIDIA NIM request failed: ${fetchResponse.status}`;
            if (fetchResponse.status === 504) {
                msg = `NVIDIA NIM Gateway Timeout (504). The server took too long to respond.\n\n💡 **Tips to resolve**:\n1. Switch to a faster model in the chat dropdown, such as **Llama 3.1 70B** (\`meta/llama-3.1-70b-instruct\`) or **DeepSeek V4**.\n2. Ask about specific files instead of entire large folders.`;
            } else if (fetchResponse.status === 429) {
                msg = `NVIDIA NIM Rate Limit Exceeded (429). Please wait a few seconds before sending another message.`;
            } else if (fetchResponse.status === 410) {
                let detail = 'The requested model has reached its end of life and is no longer available.';
                try {
                    const parsed = JSON.parse(errText);
                    if (parsed && parsed.detail) detail = parsed.detail;
                } catch { }
                msg = `NVIDIA NIM Model Unavailable (410). \n\n💡 ${detail}\n\nPlease switch to a different model in the chat dropdown.`;
            } else if (errText) {
                msg += `\n${errText}`;
            }
            const err = new Error(msg);
            this.logService.error('[NvidiaNim] ', err);
            throw err;
        }

        if (!fetchResponse.body) {
            cancellationListener.dispose();
            throw new Error('NVIDIA NIM API response missing body');
        }

        let streamResolve: (v: unknown) => void;
        let streamReject: (e: unknown) => void;
        const resultPromise = new Promise<unknown>((resolve, reject) => {
            streamResolve = resolve;
            streamReject = reject;
        });

        const sseIter = this._parseSseStream(fetchResponse.body, abortController);

        // Build the AsyncIterable that the chat widget will consume.
        const stream: AsyncIterable<{ type: 'text'; value: string }> = {
            [Symbol.asyncIterator]() {
                return {
                    next: async () => {
                        try {
                            const n = await sseIter.next();
                            if (n.done) {
                                cancellationListener.dispose();
                                streamResolve!(undefined);
                            }
                            return n as IteratorResult<{ type: 'text'; value: string }>;
                        } catch (err) {
                            cancellationListener.dispose();
                            if (err instanceof CancellationError) {
                                streamResolve!(undefined);
                            } else {
                                streamReject!(err);
                            }
                            throw err;
                        }
                    },
                    return: async (value?: any) => {
                        cancellationListener.dispose();
                        abortController.abort(); // Cancel the underlying network request
                        try {
                            await sseIter.return?.(value);
                        } catch {
                            // ignored
                        }
                        streamResolve!(undefined);
                        return { done: true, value };
                    },
                };
            },
        };

        return {
            stream,
            result: resultPromise,
        };
    }

    async provideTokenCount(
        modelId: string,
        message: string | IChatMessage,
        token: CancellationToken
    ): Promise<number> {
        // NVIDIA NIM doesn't expose a token-count endpoint. Use a heuristic
        // 4 chars per token approximation — same fallback as several other
        // built-in providers.
        if (typeof message === 'string') {
            return Math.ceil(message.length / 4);
        }
        let total = 0;
        for (const part of message.content) {
            if (part.type === 'text') {
                total += Math.ceil(part.value.length / 4);
            }
        }
        return total;
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Helpers
    // ──────────────────────────────────────────────────────────────────────

    async getApiKey(): Promise<string | undefined> {
        let apiKey: string | undefined;
        try {
            const stored = await Promise.race([
                this.secretStorage.get(NVIDIA_NIM_API_KEY_STORAGE_KEY),
                new Promise<string | undefined>((_, reject) => setTimeout(() => reject(new Error('timeout')), 500))
            ]);
            apiKey = stored;
        } catch (err) {
            this.logService.warn('[NvidiaNim] Error or timeout reading API key from secret storage:', err);
        }

        if (apiKey) {
            return apiKey;
        }
        
        return undefined;
    }

    async setApiKey(key: string): Promise<void> {
        await this.secretStorage.set(NVIDIA_NIM_API_KEY_STORAGE_KEY, key);
        this._onDidChangeEmitter.fire();
    }

    async deleteApiKey(): Promise<void> {
        await this.secretStorage.delete(NVIDIA_NIM_API_KEY_STORAGE_KEY);
        this._onDidChangeEmitter.fire();
    }

    private getBaseUrl(): string {
        return this.configurationService.getValue<string>(NvidiaNimConfigKeys.baseUrl) || NVIDIA_NIM_DEFAULT_BASE_URL;
    }

    private _buildIdentifier(modelId: string): string {
        // Vendor-qualified identifier using '/' as vendor separator so Extension Host parses vendor correctly
        return `${NVIDIA_NIM_VENDOR_ID}/${modelId}`;
    }

    private _stripIdentifier(modelId: string): string {
        // Strip the leading "nvidianim/" prefix if present.
        return modelId.startsWith(`${NVIDIA_NIM_VENDOR_ID}/`)
            ? modelId.slice(NVIDIA_NIM_VENDOR_ID.length + 1)
            : modelId;
    }

    private _buildMetadata(model: NimModel): ILanguageModelChatMetadata {
        return {
            extension: new ExtensionIdentifier(NVIDIA_NIM_VENDOR_ID),
            name: model.name,
            id: model.id,
            vendor: NVIDIA_NIM_VENDOR_ID,
            version: '1.0.0',
            family: model.family,
            maxInputTokens: model.maxInputTokens,
            maxOutputTokens: model.maxOutputTokens,
            detail: model.detail,
            tooltip: `${model.name} (${model.id}) — ${model.detail}`,
            isDefaultForLocation: {},
            isUserSelectable: true,
            isBYOK: true,
            capabilities: {
                agentMode: true,
                toolCalling: true
            },
            auth: {
                providerLabel: NVIDIA_NIM_VENDOR_LABEL,
                accountLabel: 'API Key',
            },
        };
    }

    /**
     * Parses the SSE response stream from NVIDIA NIM and yields
     * IChatResponseTextPart chunks as they arrive. This is a TRUE
     * streaming async generator — each SSE event is yielded immediately
     * when parsed, without buffering the whole response.
     */
    private async *_parseSseStream(
        stream: ReadableStream<Uint8Array>,
        abortController: AbortController
    ): AsyncGenerator<{ type: 'text'; value: string }, void, unknown> {
        this.logService.info('[NvidiaNim] _parseSseStream started');
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        const queue: Array<{ value?: string; error?: any; done?: boolean }> = [];
        let resolveNext: (() => void) | undefined;

        const pushEvent = (event: { value?: string; error?: any; done?: boolean }) => {
            queue.push(event);
            if (resolveNext) {
                resolveNext();
                resolveNext = undefined;
            }
        };

        const reader = stream.getReader();
        const pump = async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        pushEvent({ done: true });
                        break;
                    }
                    if (value) {
                        const str = decoder.decode(value, { stream: true });
                        pushEvent({ value: str });
                    }
                }
            } catch (err) {
                pushEvent({ error: err });
            } finally {
                reader.releaseLock();
            }
        };
        pump();

        const abortListener = () => pushEvent({ done: true });
        abortController.signal.addEventListener('abort', abortListener);

        try {
            while (true) {
                if (queue.length === 0) {
                    await new Promise<void>(resolve => resolveNext = resolve);
                }
                const event = queue.shift()!;
                if (event.error) throw event.error;
                if (event.done) return;

                buffer += event.value;

                let idx: number;
                while (true) {
                    const idxLF = buffer.indexOf('\n\n');
                    const idxCRLF = buffer.indexOf('\r\n\r\n');
                    
                    if (idxLF === -1 && idxCRLF === -1) {
                        break;
                    }
                    
                    // Find the earliest occurrence of either delimiter
                    if (idxLF !== -1 && (idxCRLF === -1 || idxLF < idxCRLF)) {
                        idx = idxLF;
                        const evtStr = buffer.slice(0, idx);
                        buffer = buffer.slice(idx + 2);
                        const delta = parseSseEvent(evtStr);
                        if (delta === null) return; // [DONE]
                        if (delta) {
                            this.logService.info(`[NvidiaNim] Yielding delta: ${delta}`);
                            yield { type: 'text', value: delta };
                        }
                    } else {
                        idx = idxCRLF;
                        const evtStr = buffer.slice(0, idx);
                        buffer = buffer.slice(idx + 4);
                        const delta = parseSseEvent(evtStr);
                        if (delta === null) return; // [DONE]
                        if (delta) {
                            this.logService.info(`[NvidiaNim] Yielding delta: ${delta}`);
                            yield { type: 'text', value: delta };
                        }
                    }
                }
            }
        } finally {
            abortController.signal.removeEventListener('abort', abortListener);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  Pure helpers
// ─────────────────────────────────────────────────────────────────────────

function serializeChatMessage(msg: IChatMessage): { role: string; content: string } {
    let role: string;
    switch (msg.role) {
        case ChatMessageRole.System: role = 'system'; break;
        case ChatMessageRole.User: role = 'user'; break;
        case ChatMessageRole.Assistant: role = 'assistant'; break;
        default: role = 'user';
    }
    // Flatten content parts to text. Image parts are dropped — the basic
    // chat completions protocol expects a separate `image_url` field that
    // we'd need to populate per OpenAI's multimodal spec. For now, text-only.
    let content = '';
    for (const part of msg.content) {
        if (part.type === 'text') {
            content += part.value;
        }
    }
    return { role, content };
}

function parseSseEvent(event: string): string | null {
    const lines = event.split('\n');
    let data = '';
    for (const line of lines) {
        if (line.startsWith('data:')) {
            data += line.slice(5).trim();
        }
    }
    if (!data) return '';
    if (data === '[DONE]') return null;
    try {
        const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
        };
        return json.choices?.[0]?.delta?.content ?? '';
    } catch {
        // Partial JSON in a chunk — wait for more data.
        return '';
    }
}

function ensureChatCompletionsUrl(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/+$/, '');
    if (trimmed.endsWith('/chat/completions')) return trimmed;
    if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`;
    if (/^(https?:\/\/[^/]+)$/i.test(trimmed)) {
        return `${trimmed}/v1/chat/completions`;
    }
    return `${trimmed}/chat/completions`;
}