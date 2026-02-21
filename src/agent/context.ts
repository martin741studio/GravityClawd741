import { memoryManager } from '../memory/manager.js';

export interface AgentContext {
    relevantFacts: string[];
    recentHistory: any[];
    summary?: string;
}

export class ContextManager {
    /**
     * Retrieves all relevant context for a given message.
     */
    async getContext(userMessage: string, historyLimit: number = 5): Promise<AgentContext> {
        const relevantFacts = await memoryManager.searchRelevantFacts(userMessage);
        const recentHistory = await memoryManager.getRecentContext(historyLimit);
        const summaryRecord = await memoryManager.getLatestSummary();

        return {
            relevantFacts,
            recentHistory,
            summary: summaryRecord?.content
        };
    }

    /**
     * Formats the context into a string for the system prompt.
     */
    formatContext(context: AgentContext): string {
        const historyText = context.recentHistory.map((h: any) => `${h.role}: ${h.content}`).join('\n');
        const factsText = context.relevantFacts.length > 0
            ? `\nRelevant Memories:\n${context.relevantFacts.map((f: string) => `- ${f}`).join('\n')}`
            : '';
        const summaryText = context.summary ? `\n[Context Summary]: ${context.summary}` : '';

        return `HISTORY:\n${historyText}\n${summaryText}\n${factsText}`;
    }
}
