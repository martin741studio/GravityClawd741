import { GoogleGenerativeAI, ChatSession, Part } from '@google/generative-ai';
import { LLMProvider, LLMResult } from './provider.js';
import { Tool } from '../tools/registry.js';
import { config } from '../config.js';
import { MultimodalMessage, isMultimodal } from './multimodal.js';

export class GeminiProvider implements LLMProvider {
    private genAI: GoogleGenerativeAI;
    private modelName: string;
    private tools: Tool[];

    constructor(tools: Tool[], tier: 'flash' | 'pro' = 'flash') {
        this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
        this.modelName = tier === 'pro' ? 'gemini-1.5-pro-latest' : 'gemini-1.5-flash-latest';
        this.tools = tools;
    }

    async sendMessage(message: string | any[] | MultimodalMessage, options?: { history?: any[], systemPrompt?: string }): Promise<LLMResult> {
        const functionDeclarations = this.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters as any,
        }));

        const modelOptions: any = {
            model: this.modelName
        };

        if (options?.systemPrompt) {
            modelOptions.systemInstruction = options.systemPrompt;
        }

        if (functionDeclarations.length > 0) {
            modelOptions.tools = [{ functionDeclarations }];
        }

        const model = this.genAI.getGenerativeModel(modelOptions);

        // Gemini history MUST start with user, and cannot contain 'system' role
        const history = (options?.history || [])
            .filter(m => m.role !== 'system')
            .map(m => {
                if (m.role === 'tool') {
                    // Gemini expects 'function' role for tool responses in history
                    return {
                        role: 'function',
                        parts: [{ functionResponse: { name: m.tool_call_id, response: { content: m.content } } }]
                    };
                }
                if (m.role === 'assistant') {
                    const parts: any[] = [];
                    if (m.content) parts.push({ text: m.content });
                    if (m.tool_calls) {
                        parts.push(...m.tool_calls.map((tc: any) => ({
                            functionCall: {
                                name: tc.function.name,
                                args: JSON.parse(tc.function.arguments)
                            }
                        })));
                    }
                    return { role: 'model', parts };
                }
                return { role: 'user', parts: [{ text: m.content }] };
            });

        const chat = model.startChat({ history });

        let payload: string | Part[] | any[];

        if (isMultimodal(message)) {
            payload = message.map(part => {
                if (part.text) return { text: part.text };
                if (part.inlineData) return { inlineData: part.inlineData };
                return { text: '' }; // fallback
            });
        } else {
            payload = message as any;
        }

        try {
            const result = await chat.sendMessage(payload as any);
            const usage = (result.response as any)?.usageMetadata || null;

            return {
                response: {
                    text: () => result.response.text(),
                    candidates: result.response.candidates
                },
                usage: usage ? {
                    promptTokens: usage.promptTokenCount,
                    completionTokens: usage.candidatesTokenCount,
                    totalTokens: usage.totalTokenCount
                } : undefined,
                model: this.modelName
            };
        } catch (error: any) {
            console.error(`[Gemini:${this.modelName}] Error:`, error.message || error);
            throw error;
        }
    }
}
