import { LLMProvider, LLMResult } from './provider.js';
import { Tool } from '../tools/registry.js';
import { MultimodalMessage, isMultimodal } from './multimodal.js';
import fetch from 'node-fetch';

export class OpenAIProvider implements LLMProvider {
    private apiKey: string;
    private model: string;
    private history: any[] = [];
    private tools: Tool[];

    constructor(tools: Tool[], apiKey: string, model: string = 'gpt-4o') {
        this.apiKey = apiKey;
        this.model = model;
        this.tools = tools;

        // System context
        this.history.push({
            role: 'system',
            content: 'You are Gravity Claw, a helpful personal AI assistant. You run locally on my machine. Use tools when needed.'
        });
    }

    async sendMessage(message: string | any[] | MultimodalMessage): Promise<LLMResult> {
        if (isMultimodal(message)) {
            const content = message.map(part => {
                if (part.text) return { type: 'text', text: part.text };
                if (part.inlineData) {
                    return {
                        type: 'image_url',
                        image_url: {
                            url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                        }
                    };
                }
                return { type: 'text', text: '' };
            });
            this.history.push({ role: 'user', content });
        } else if (Array.isArray(message)) {
            for (const item of message) {
                if (item.functionResponse) {
                    this.history.push({
                        role: 'tool',
                        tool_call_id: item.functionResponse.id || item.functionResponse.name,
                        content: typeof item.functionResponse.response.output === 'string'
                            ? item.functionResponse.response.output
                            : JSON.stringify(item.functionResponse.response.output)
                    });
                }
            }
        } else {
            this.history.push({ role: 'user', content: message });
        }

        const openAiTools = this.tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: this.history,
                    tools: openAiTools
                })
            });

            const data: any = await response.json();

            if (data.error) {
                throw new Error(`OpenAI Error: ${data.error.message || JSON.stringify(data.error)}`);
            }

            const choice = data.choices[0];
            const assistantMsg = choice.message;

            this.history.push(assistantMsg);

            return {
                response: {
                    text: () => assistantMsg.content || '',
                    candidates: [{
                        content: {
                            parts: assistantMsg.tool_calls ? assistantMsg.tool_calls.map((tc: any) => ({
                                functionCall: {
                                    name: tc.function.name,
                                    args: JSON.parse(tc.function.arguments),
                                    id: tc.id
                                }
                            })) : [{ text: assistantMsg.content }]
                        }
                    }]
                },
                usage: data.usage ? {
                    promptTokens: data.usage.prompt_tokens,
                    completionTokens: data.usage.completion_tokens,
                    totalTokens: data.usage.total_tokens
                } : undefined,
                model: this.model
            };
        } catch (error: any) {
            console.error('[OpenAI] Error:', error);
            throw error;
        }
    }
}
