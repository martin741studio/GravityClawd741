import { GoogleGenerativeAI, ChatSession, Part } from '@google/generative-ai';
import { LLMProvider, LLMResult } from './provider.js';
import { Tool } from '../tools/registry.js';
import { config } from '../config.js';
import { MultimodalMessage, isMultimodal } from './multimodal.js';

export class GeminiProvider implements LLMProvider {
    private chatFlash: ChatSession;
    private chatPro: ChatSession;
    private modelFlash: any;
    private modelPro: any;

    constructor(tools: Tool[]) {
        const genAI = new GoogleGenerativeAI(config.geminiApiKey);

        const functionDeclarations = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters as any,
        }));

        // Efficient Tier (Updated to resolve 404)
        const flashOptions: any = { model: 'gemini-2.0-flash' };
        const proOptions: any = { model: 'gemini-2.0-pro-exp-02-05' };

        if (functionDeclarations.length > 0) {
            flashOptions.tools = [{ functionDeclarations }];
            proOptions.tools = [{ functionDeclarations }];
        }

        this.modelFlash = genAI.getGenerativeModel(flashOptions);
        this.modelPro = genAI.getGenerativeModel(proOptions);

        const initialHistory = [
            {
                role: 'user',
                parts: [{ text: 'You are Gravity Claw, a helpful personal AI assistant. You run locally on my machine. You have access to tools to help the user.' }],
            },
            {
                role: 'model',
                parts: [{ text: 'Understood. I am Gravity Claw. I am ready to help.' }],
            },
        ];

        this.chatFlash = this.modelFlash.startChat({ history: initialHistory });
        this.chatPro = this.modelPro.startChat({ history: initialHistory });
    }

    async sendMessage(message: string | any[] | MultimodalMessage, options?: { modelPreference?: 'high' | 'efficient' }): Promise<LLMResult> {
        const preference = options?.modelPreference || 'efficient';
        const chat = preference === 'high' ? this.chatPro : this.chatFlash;
        const modelName = preference === 'high' ? 'gemini-2.0-pro-exp-02-05' : 'gemini-2.0-flash';

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
            model: modelName
        };
    }
}
