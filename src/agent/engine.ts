import { LLM } from './llm.js';
import { registry } from '../tools/registry.js';
import { Context } from 'grammy';
import { memoryManager } from '../memory/manager.js';
import { ContextManager } from './context.js';
import { ToolExecutor } from './executor.js';
import { TRAITS } from './traits.js';
import { MultimodalMessage } from './multimodal.js';
import { proactiveManager } from './proactive.js';
import { sqlite } from '../db/index.js';
import { config } from '../config.js';

export class Agent {
    private llm: LLM;
    private contextManager: ContextManager;
    private executor: ToolExecutor;

    constructor() {
        const tools = registry.getAll();
        this.llm = new LLM(tools);
        this.contextManager = new ContextManager();
        this.executor = new ToolExecutor();
    }

    async run(userMessage: string | MultimodalMessage, ctx?: Context, traitId: string = 'generalist'): Promise<string> {
        const isMulti = Array.isArray(userMessage);
        const userText = isMulti
            ? (userMessage as MultimodalMessage).find(p => p.text)?.text || ''
            : userMessage as string;

        // EMERGENCY OVERRIDE for /status (Bypass database dependencies)
        if (userText.trim().toLowerCase().startsWith('/status') || userText.trim().toLowerCase() === 'status') {
            return await this.handleEmergencyStatus();
        }

        try {
            // 1. Memory & Context
            memoryManager.logMessage('user', userText).catch(console.error);
            proactiveManager.detectIntent(userText).catch(console.error);
            const context = await this.contextManager.getContext(userText);
            const formattedContext = this.contextManager.formatContext(context);

            const trait = TRAITS[traitId] || TRAITS['generalist'];

            const systemPrompt = `${trait.systemPrompt}
Time: ${new Date().toLocaleString()}

${formattedContext}

INSTRUCTIONS:
- You have access to tools. Use them proactively to solve the user's problems.
- If you use 'speak', accompany it with text.
- Be concise, bold, and helpful.`;

            // Initialize local history for this turn
            const sharedHistory: any[] = [
                { role: 'system', content: systemPrompt }
            ];

            let userPayload: string | any[];
            if (isMulti) {
                userPayload = (userMessage as MultimodalMessage).map(p => {
                    if (p.text) return { text: p.text };
                    if (p.inlineData) return { inlineData: p.inlineData };
                    return null;
                }).filter(Boolean);
            } else {
                userPayload = userMessage;
            }

            // 2. Initial Request
            let result = await this.llm.chat.sendMessage(userPayload as any, {
                history: sharedHistory.filter(m => m.role !== 'system'),
                systemPrompt: systemPrompt
            });

            // Sync history with user message
            if (typeof userPayload === 'string') {
                sharedHistory.push({ role: 'user', content: userPayload });
            } else {
                sharedHistory.push({ role: 'user', content: userPayload }); // Simplified for Gemini/OpenAI compatibility
            }

            if (result.usage && result.model) {
                memoryManager.logUsage(result.model, result.usage.promptTokens, result.usage.completionTokens, result.usage.totalTokens).catch(console.error);
            }

            // 3. Agentic Tool Loop
            let loopCount = 0;
            const MAX_LOOPS = 5;

            while (loopCount < MAX_LOOPS) {
                const response = result.response;
                const parts = response.candidates?.[0]?.content?.parts || [];

                // Track assistant parts in shared history
                sharedHistory.push({
                    role: 'assistant',
                    content: response.text() || null,
                    tool_calls: (parts as any).filter((p: any) => p.functionCall).map((p: any) => ({
                        id: p.functionCall.id || p.functionCall.name,
                        type: 'function',
                        function: {
                            name: p.functionCall.name,
                            arguments: JSON.stringify(p.functionCall.args)
                        }
                    }))
                });

                const functionCalls = parts
                    .filter((part: any) => part.functionCall)
                    .map((part: any) => part.functionCall);

                if (functionCalls.length === 0) {
                    const text = response.text();
                    if (text) {
                        memoryManager.logMessage('assistant', text).catch(console.error);
                    }
                    return text;
                }

                // Execute Tools
                const functionResponses = await this.executor.executeAll(functionCalls, ctx);

                // Add tool responses to history
                for (const toolRes of functionResponses) {
                    sharedHistory.push({
                        role: 'tool',
                        tool_call_id: toolRes.functionResponse.id || toolRes.functionResponse.name,
                        content: typeof toolRes.functionResponse.response.output === 'string'
                            ? toolRes.functionResponse.response.output
                            : JSON.stringify(toolRes.functionResponse.response.output || toolRes.functionResponse.response.error)
                    });
                }

                // Feedback Loop - Pass full shared history
                result = await this.llm.chat.sendMessage(functionResponses as any, {
                    history: sharedHistory,
                    systemPrompt: systemPrompt
                });
                if (result.usage && result.model) {
                    memoryManager.logUsage(result.model, result.usage.promptTokens, result.usage.completionTokens, result.usage.totalTokens).catch(console.error);
                }

                loopCount++;
            }

            return "Error: Maximum agent loop iterations reached.";

        } catch (error: any) {
            console.error("[Agent] CRITICAL ERROR:", error);
            return `I encountered an error: ${error.message || 'Unknown error'}`;
        }
    }

    private async handleEmergencyStatus(): Promise<string> {
        const isRailway = !!process.env.RAILWAY_ENVIRONMENT_NAME || !!process.env.RAILWAY_STATIC_URL;
        const env = isRailway ? 'RAILWAY (Cloud)' : 'LOCAL (MacBook)';
        const dbPath = process.env.DB_PATH || (isRailway ? '/data/memory.db' : 'data/memory.db');
        const version = '1.1.8 (Shield++)';
        const mem = Math.floor(process.memoryUsage().rss / 1024 / 1024);

        let dbStatus = 'Disconnected';
        let msgCount = 0;
        let todayUsage = { prompt: 0, completion: 0, cost: 0 };
        const activeProviders = [];

        // 1. Check Providers
        if (config.geminiApiKey) activeProviders.push('Gemini');
        if (config.openaiApiKey) activeProviders.push('OpenAI');
        if (config.openrouterApiKey) activeProviders.push('OpenRouter');

        try {
            // 2. Database & Message Count
            const tableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'").get();
            if (tableCheck) {
                const row = sqlite.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number };
                msgCount = row?.count ?? 0;
                dbStatus = `Connected (${msgCount} messages found)`;

                // 3. Usage Check (Today)
                const todayStart = new Date().setHours(0, 0, 0, 0);
                const usageCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usage'").get();
                if (usageCheck) {
                    const stats = sqlite.prepare(`
                        SELECT 
                            SUM(prompt_tokens) as prompt, 
                            SUM(completion_tokens) as completion,
                            SUM(CAST(cost_usd as REAL)) as cost
                        FROM usage 
                        WHERE timestamp >= ?
                    `).get(todayStart) as { prompt: number, completion: number, cost: number };

                    if (stats) {
                        todayUsage.prompt = stats.prompt || 0;
                        todayUsage.completion = stats.completion || 0;
                        todayUsage.cost = stats.cost || 0;
                    }
                }
            } else {
                dbStatus = 'Error: Table missing from shield';
            }
        } catch (error: any) {
            dbStatus = `Emergency Failed: ${error.message}`;
        }

        return [
            `Gravity Claw Status Shield`,
            `-------------------`,
            `Version: ${version}`,
            `Environment: ${env}`,
            `Memory Usage: ${mem} MB`,
            `Database: ${dbStatus}`,
            `Active LLM Fallback: ${activeProviders.join(' -> ') || 'None'}`,
            `-------------------`,
            `Today's Usage (UTC):`,
            `- Tokens: ${todayUsage.prompt} prompt / ${todayUsage.completion} comp`,
            `- Est. Cost: $${todayUsage.cost.toFixed(4)}`,
            `-------------------`,
            `Shield Level: Platinum Override`
        ].join('\n');
    }
}
