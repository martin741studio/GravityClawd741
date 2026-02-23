import { Tool } from '../tools/registry.js';
import { MultimodalMessage } from './multimodal.js';

export interface LLMResponse {
    text: () => string;
    candidates?: any[];
}

export interface LLMUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface LLMResult {
    response: LLMResponse;
    usage?: LLMUsage;
    model?: string;
}

export interface LLMProvider {
    sendMessage(message: string | any[] | MultimodalMessage, options?: { modelPreference?: 'high' | 'efficient', history?: any[], systemPrompt?: string }): Promise<LLMResult>;
}
