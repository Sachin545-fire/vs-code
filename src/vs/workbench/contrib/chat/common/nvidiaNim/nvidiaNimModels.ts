/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * NVIDIA NIM model catalog — 23 curated models from https://build.nvidia.com/models
 *
 * Categories: 1 flagship + 14 coding/agentic + 8 vision/multimodal
 *
 * This module is consumed by the built-in NVIDIA NIM language model provider
 * (see nvidiaNimLanguageModelProvider.ts) and by the configuration schema
 * (see nvidiaNim.contribution.ts).
 */

export interface NimModel {
    readonly id: string;
    readonly name: string;
    readonly family: string;
    readonly maxInputTokens: number;
    readonly maxOutputTokens: number;
    readonly toolCalling: boolean;
    readonly vision: boolean;
    readonly thinking: boolean;
    readonly detail: string;
}

export const NVIDIA_NIM_VENDOR_ID = 'nvidianim';
export const NVIDIA_NIM_VENDOR_LABEL = 'NVIDIA NIM';
export const NVIDIA_NIM_DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const NVIDIA_NIM_DEFAULT_MODEL_ID = 'meta/llama-3.1-70b-instruct';

/**
 * Built-in model catalog. The provider will register every entry with the
 * ILanguageModelsService so they all appear in the chat model picker.
 */
export const NIM_MODELS: readonly NimModel[] = [
    // ──────────────────────────────────────────────────────────────────────
    //  FLAGSHIP DEFAULT
    // ──────────────────────────────────────────────────────────────────────
    {
        id: 'meta/llama-3.1-70b-instruct',
        name: 'Llama 3.1 70B',
        family: 'llama-3.1',
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        toolCalling: true,
        vision: false,
        thinking: false,
        detail: 'Flagship LLM for agentic workflows, coding, and long-horizon reasoning',
    },

    // ──────────────────────────────────────────────────────────────────────
    //  BEST FOR CODING / AGENTIC WORKFLOWS (text-only)
    // ──────────────────────────────────────────────────────────────────────
    {
        id: 'deepseek-ai/deepseek-coder-6.7b-instruct',
        name: 'DeepSeek Coder 6.7B',
        family: 'deepseek',
        maxInputTokens: 16384,
        maxOutputTokens: 4096,
        toolCalling: true,
        vision: false,
        thinking: false,
        detail: 'Excellent coding capabilities for rapid iteration',
    },
    {
        id: 'deepseek-ai/deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        family: 'deepseek-v4',
        maxInputTokens: 1032192,
        maxOutputTokens: 16384,
        toolCalling: true,
        vision: false,
        thinking: true,
        detail: '1M-token context, fast coding tier',
    },
    {
        id: 'nvidia/nemotron-3-super-120b-a12b',
        name: 'Nemotron 3 Super 120B',
        family: 'nemotron-3',
        maxInputTokens: 1032192,
        maxOutputTokens: 16384,
        toolCalling: true,
        vision: false,
        thinking: true,
        detail: '1M ctx, agentic + tool-calling MoE',
    },
    {
        id: 'nvidia/nemotron-3-ultra-550b-a55b',
        name: 'Nemotron 3 Ultra 550B',
        family: 'nemotron-3',
        maxInputTokens: 1032192,
        maxOutputTokens: 16384,
        toolCalling: true,
        vision: false,
        thinking: true,
        detail: '1M ctx, frontier reasoning',
    },
    {
        id: 'nvidia/nemotron-3-nano-30b-a3b',
        name: 'Nemotron 3 Nano 30B',
        family: 'nemotron-3',
        maxInputTokens: 1032192,
        maxOutputTokens: 16384,
        toolCalling: true,
        vision: false,
        thinking: false,
        detail: '1M ctx, fast + cheap',
    },
    {
        id: 'mistralai/mistral-nemotron',
        name: 'Mistral Nemotron',
        family: 'mistral-nemotron',
        maxInputTokens: 114688,
        maxOutputTokens: 16384,
        toolCalling: true,
        vision: false,
        thinking: false,
        detail: 'Agentic + function calling',
    },
    {
        id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
        name: 'Llama 3.3 Nemotron Super 49B v1.5',
        family: 'llama-3.3-nemotron',
        maxInputTokens: 114688,
        maxOutputTokens: 16384,
        toolCalling: true,
        vision: false,
        thinking: false,
        detail: 'High-efficiency reasoning + tool calling',
    },
    {
        id: 'meta/llama-3.1-8b-instruct',
        name: 'Llama 3.1 8B Instruct',
        family: 'llama-3.1',
        maxInputTokens: 122880,
        maxOutputTokens: 8192,
        toolCalling: true,
        vision: false,
        thinking: false,
        detail: 'Lightweight, fast, cheap',
    },
    {
        id: 'qwen/qwen3-next-80b-a3b-instruct',
        name: 'Qwen3-Next 80B Instruct',
        family: 'qwen3-next',
        maxInputTokens: 245760,
        maxOutputTokens: 16384,
        toolCalling: true,
        vision: false,
        thinking: false,
        detail: 'Ultra-long 256K context',
    },
    {
        id: 'stepfun-ai/step-3.7-flash',
        name: 'Step 3.7 Flash',
        family: 'step-3.7',
        maxInputTokens: 114688,
        maxOutputTokens: 16384,
        toolCalling: true,
        vision: false,
        thinking: false,
        detail: 'Sparse MoE coding',
    },
    {
        id: 'poolside/laguna-xs-2.1',
        name: 'Poolside Laguna XS 2.1',
        family: 'laguna',
        maxInputTokens: 114688,
        maxOutputTokens: 16384,
        toolCalling: true,
        vision: false,
        thinking: false,
        detail: 'Coding specific model',
    },
    {
        id: 'z-ai/glm-5.2',
        name: 'GLM 5.2',
        family: 'glm',
        maxInputTokens: 128000,
        maxOutputTokens: 16384,
        toolCalling: true,
        vision: false,
        thinking: false,
        detail: 'General purpose model',
    },
    {
        id: 'google/gemma-4-31b-it',
        name: 'Gemma 4 31B IT',
        family: 'gemma-4',
        maxInputTokens: 122880,
        maxOutputTokens: 8192,
        toolCalling: true,
        vision: false,
        thinking: true,
        detail: 'Dense reasoning, coding + agentic',
    },

    // ──────────────────────────────────────────────────────────────────────
    //  BEST FOR VISION / IMAGE UNDERSTANDING (multimodal)
    // ──────────────────────────────────────────────────────────────────────
    {
        id: 'meta/llama-3.2-90b-vision-instruct',
        name: 'Llama 3.2 90B Vision',
        family: 'llama-3.2-vision',
        maxInputTokens: 122880,
        maxOutputTokens: 8192,
        toolCalling: true,
        vision: true,
        thinking: false,
        detail: 'Best image reasoning quality',
    },
    {
        id: 'meta/llama-3.2-11b-vision-instruct',
        name: 'Llama 3.2 11B Vision',
        family: 'llama-3.2-vision',
        maxInputTokens: 122880,
        maxOutputTokens: 8192,
        toolCalling: true,
        vision: true,
        thinking: false,
        detail: 'Lightweight multimodal',
    },
    {
        id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
        name: 'Nemotron 3 Nano Omni 30B',
        family: 'nemotron-3-omni',
        maxInputTokens: 122880,
        maxOutputTokens: 8192,
        toolCalling: true,
        vision: true,
        thinking: true,
        detail: 'Omni-modal: image + video + speech + text',
    },
    {
        id: 'nvidia/nemotron-nano-12b-v2-vl',
        name: 'Nemotron Nano 12B v2 VL',
        family: 'nemotron-nano-vl',
        maxInputTokens: 122880,
        maxOutputTokens: 8192,
        toolCalling: false,
        vision: true,
        thinking: false,
        detail: 'Multi-image + video understanding',
    },
    {
        id: 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
        name: 'Nemotron Nano VL 8B v1',
        family: 'nemotron-nano-vl',
        maxInputTokens: 122880,
        maxOutputTokens: 8192,
        toolCalling: false,
        vision: true,
        thinking: false,
        detail: 'Image Q&A, small footprint',
    },
    {
        id: 'thinkingmachines/inkling',
        name: 'Inkling',
        family: 'inkling',
        maxInputTokens: 114688,
        maxOutputTokens: 16384,
        toolCalling: true,
        vision: true,
        thinking: true,
        detail: 'Mamba-hybrid MoE multimodal reasoning',
    },
    {
        id: 'minimaxai/minimax-m3',
        name: 'MiniMax M3',
        family: 'minimax-m3',
        maxInputTokens: 229376,
        maxOutputTokens: 16384,
        toolCalling: true,
        vision: true,
        thinking: false,
        detail: 'Multimodal MoE vision-language',
    },
    {
        id: 'google/paligemma',
        name: 'PaliGemma',
        family: 'paligemma',
        maxInputTokens: 4096,
        maxOutputTokens: 4096,
        toolCalling: false,
        vision: true,
        thinking: false,
        detail: 'Compact vision-language model',
    },
];

export function getNimModelById(id: string): NimModel | undefined {
    return NIM_MODELS.find((m) => m.id === id);
}
