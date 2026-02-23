import { LLMProvider, LLMResult } from './provider.js';
import { Tool } from '../tools/registry.js';
// OpenRouter uses standard OpenAI-like fetching for chat completions
import fetch from 'node-fetch';

export class OpenRouterProvider implements LLMProvider {
    private apiKey: string;
    private model: string;
    private history: any[] = [];
    private tools: Tool[];

    constructor(tools: Tool[], apiKey: string, model: string = 'openai/gpt-4o') {
        this.apiKey = apiKey;
        this.model = model;
        this.tools = tools;

        // System context
        this.history.push({
            role: 'system',
            content: 'You are Gravity Claw, a helpful personal AI assistant. You run locally on my machine. Use tools when needed.'
        });
    }

    async sendMessage(message: string | any[] | MultimodalMessage, options?: { history?: any[], systemPrompt?: string }): Promise<LLMResult> {
        let messages = options?.history ? [...options.history] : [];

        if (options?.systemPrompt && !messages.find(m => m.role === 'system')) {
            messages.unshift({ role: 'system', content: options.systemPrompt });
        }

        if (typeof message === 'string') {
            messages.push({ role: 'user', content: message });
        } else if (Array.isArray(message)) {
            // Check if it's already a formatted messages array from executor
            if (message.length > 0 && (message[0] as any).role) {
                messages.push(...(message as any[]));
            } else if (isMultimodal(message)) {
                const content = (message as MultimodalMessage).map(part => {
                    if (part.text) return { type: 'text', text: part.text };
                    if (part.inlineData) return { type: 'image_url', image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` } };
                    return null;
                }).filter(Boolean);
                messages.push({ role: 'user', content });
            } else {
                // Handle tool results
                for (const item of message) {
                    if (item.functionResponse) {
                        messages.push({
                            role: 'tool',
                            tool_call_id: item.functionResponse.id || item.functionResponse.name,
                            content: typeof item.functionResponse.response.output === 'string'
                                ? item.functionResponse.response.output
                                : JSON.stringify(item.functionResponse.response.output || item.functionResponse.response.error)
                        });
                    }
                }
            }
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'HTTP-Referer': 'https://github.com/martin741studio/741agency',
                'X-Title': 'Gravity Claw',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                messages: messages,
                tools: this.tools.length > 0 ? this.tools.map(tool => ({
                    type: 'function',
                    function: {
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.parameters
                    }
                })) : undefined
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenRouter API error: ${error}`);
        }

        const data: any = await response.json();
        const choice = data.choices[0];
        const assistantMsg = choice.message;

        return {
            response: {
                text: () => assistantMsg.content || '',
                candidates: [{
                    content: {
                        parts: assistantMsg.tool_calls ?
                            assistantMsg.tool_calls.map((tc: any) => ({ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments), id: tc.id } })) :
                            [{ text: assistantMsg.content }]
                    }
                }]
            },
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            } : undefined,
            model: data.model
        };
    }
}

