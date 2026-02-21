import { LLMProvider, LLMResult } from './provider.js';
import { GeminiProvider } from './gemini_provider.js';
import { OpenRouterProvider } from './openrouter_provider.js';
import { OpenAIProvider } from './openai_provider.js';
import { Tool } from '../tools/registry.js';
import { config } from '../config.js';
import { MultimodalMessage } from './multimodal.js';

export class FailoverProvider implements LLMProvider {
    constructor(private providers: { name: string, provider: LLMProvider }[]) { }

    async sendMessage(message: string | any[] | MultimodalMessage, options?: { modelPreference?: 'high' | 'efficient' }): Promise<LLMResult> {
        let lastError: any = null;
        for (const { name, provider } of this.providers) {
            try {
                return await provider.sendMessage(message, options);
            } catch (error: any) {
                const errorMsg = error.message.toLowerCase();
                console.warn(`[LLM] ${name} failed:`, error.message);
                lastError = error;

                // If it's a quota, rate limit, or resource exhaustion error, we DEFINITELY skip to the next
                if (
                    errorMsg.includes('quota') ||
                    errorMsg.includes('rate_limit') ||
                    errorMsg.includes('429') ||
                    errorMsg.includes('exhausted') ||
                    errorMsg.includes('404')
                ) {
                    continue;
                }

                // For other errors, we continue anyway to try other providers
                continue;
            }
        }
        throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
    }
}

export class LLM {
    public chat: LLMProvider;

    async sendMessage(message: string | any[] | MultimodalMessage, options?: { modelPreference?: 'high' | 'efficient' }): Promise<LLMResult> {
        return this.chat.sendMessage(message, options);
    }

    constructor(tools: Tool[]) {
        const providers: { name: string, provider: LLMProvider }[] = [];

        // 1. Primary Model: Gemini (Handles "Easy Requests" as main model)
        providers.push({
            name: 'Gemini (Flash)',
            provider: new GeminiProvider(tools)
        });

        // 2. Secondary/Backfall: OpenAI
        if (config.openaiApiKey) {
            providers.push({
                name: 'OpenAI (GPT-4o)',
                provider: new OpenAIProvider(tools, config.openaiApiKey, 'gpt-4o')
            });
        }

        // 3. Tertiary/Backfall: OpenRouter
        if (config.openrouterApiKey) {
            providers.push({
                name: 'OpenRouter (Claude)',
                provider: new OpenRouterProvider(tools, config.openrouterApiKey, 'anthropic/claude-3.5-sonnet')
            });
        }

        console.log(`[LLM] Initializing with ${providers.length} providers (Gemini Primary).`);
        this.chat = new FailoverProvider(providers);
    }
}
