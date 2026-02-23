import { LLMProvider, LLMResult } from './provider.js';
import { GeminiProvider } from './gemini_provider.js';
import { OpenRouterProvider } from './openrouter_provider.js';
import { OpenAIProvider } from './openai_provider.js';
import { Tool } from '../tools/registry.js';
import { config } from '../config.js';
import { MultimodalMessage } from './multimodal.js';

export class FailoverProvider implements LLMProvider {
    constructor(private providers: { name: string, provider: LLMProvider }[]) { }

    async sendMessage(message: string | any[] | MultimodalMessage, options?: { modelPreference?: 'high' | 'efficient', history?: any[], systemPrompt?: string }): Promise<LLMResult> {
        const errors: string[] = [];
        for (const { name, provider } of this.providers) {
            try {
                return await provider.sendMessage(message, options);
            } catch (error: any) {
                const errorMsg = error.message || String(error);
                console.warn(`[LLM] ${name} failed:`, errorMsg);
                errors.push(`${name}: ${errorMsg}`);

                // Continue to next provider regardless of error type for maximum resilience
                continue;
            }
        }
        throw new Error(`All LLM providers failed:\n${errors.join('\n')}`);
    }
}

export class LLM {
    public chat: FailoverProvider;

    async sendMessage(message: string | any[] | MultimodalMessage, options?: { modelPreference?: 'high' | 'efficient', history?: any[], systemPrompt?: string }): Promise<LLMResult> {
        return this.chat.sendMessage(message, options);
    }

    constructor(tools: Tool[]) {
        const providers: { name: string, provider: LLMProvider }[] = [];

        // 1. Primary: OpenRouter (Claude/GPT-4o via aggregator)
        if (config.openrouterApiKey && !config.openrouterApiKey.includes('placeholder')) {
            providers.push({
                name: 'OpenRouter (Claude)',
                provider: new OpenRouterProvider(tools, config.openrouterApiKey, 'anthropic/claude-3.5-sonnet')
            });
        }

        // 2. High-Tier Fallback: Gemini 1.5 Pro (Ultra equivalent)
        if (config.geminiApiKey) {
            providers.push({
                name: 'Gemini 1.5 Pro',
                provider: new GeminiProvider(tools, 'pro')
            });
        }

        // 3. Efficiency/Speed Fallback: Gemini 1.5 Flash
        if (config.geminiApiKey) {
            providers.push({
                name: 'Gemini 1.5 Flash',
                provider: new GeminiProvider(tools, 'flash')
            });
        }

        // 4. Tertiary/Final Fallback: OpenAI
        if (config.openaiApiKey && !config.openaiApiKey.startsWith('sk-proj-placeholder')) {
            providers.push({
                name: 'OpenAI (GPT-4o)',
                provider: new OpenAIProvider(tools, config.openaiApiKey, 'gpt-4o')
            });
        }

        console.log(`[LLM] Initializing with ${providers.length} providers in Failover Chain.`);
        this.chat = new FailoverProvider(providers);
    }
}
