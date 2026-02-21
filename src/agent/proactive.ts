import { swarmManager } from './swarm.js';
import { db } from '../db/index.js';
import { workflows } from '../db/schema.js';
import { memoryManager } from '../memory/manager.js';
import * as fs from 'fs';
import * as path from 'path';
import { LLM } from './llm.js';

export class ProactiveManager {
    /**
     * Scans the workspace for high-signal triggers.
     */
    async scanWorkspace(): Promise<void> {
        console.log('[Proactive] Monitoring workspace for opportunities...');

        try {
            // 1. Check for "TODO" or "IDEA" in recent files
            const coreFiles = ['src/main.ts', 'README.md', 'task.md'];
            for (const file of coreFiles) {
                if (fs.existsSync(file)) {
                    const content = fs.readFileSync(file, 'utf-8');
                    if (content.includes('TODO:') || content.includes('IDEA:')) {
                        await this.triggerBackgroundResearch(file, content);
                    }
                }
            }
        } catch (error) {
            console.error('[Proactive] Scan failed:', error);
        }
    }

    /**
     * Triggers a quiet background swarm to analyze a finding.
     */
    private async triggerBackgroundResearch(source: string, content: string): Promise<void> {
        const snippet = content.substring(content.indexOf('TODO:'), content.indexOf('TODO:') + 100);
        console.log(`[Proactive] Detected trigger in ${source}: "${snippet}"`);

        // Check if we've already researched this recently to avoid loops
        const recentFacts = await memoryManager.getStrategicLessons();
        if (recentFacts.some(f => f.includes(snippet))) return;

        try {
            const task = `Analyze this TODO/IDEA found in ${source}: "${snippet}". 
Gather 3-5 high-signal findings or a brief implementation plan. 
Store your result as a Strategic Lesson in memory. 
Do NOT notify the user yet.`;

            await swarmManager.spawnSubAgent(task, 'researcher');
            console.log(`[Proactive] Background research completed for: ${source}`);
        } catch (error) {
            console.error('[Proactive] Background research failed:', error);
        }
    }

    /**
     * Proactively checks for system anomalies.
     */
    async checkSystemHealth(): Promise<string | null> {
        const rss = process.memoryUsage().rss;
        const rssMb = rss / 1024 / 1024;
        const LIMIT_MB = 480; // Alert before hitting 512MB Railway hard cap

        if (rssMb > LIMIT_MB) {
            return `SYSTEM ALERT: Physical Memory (RSS) is at ${rssMb.toFixed(1)} MB. I recommend optimization or a restart.`;
        }
        return null;
    }

    /**
     * Detects if the user has an unexpressed intent or idea that needs proactive research.
     */
    async detectIntent(userText: string): Promise<void> {
        if (!userText || userText.length < 10) return;

        const llm = new LLM([]);
        const intentPrompt = `Analyze this message from a user: "${userText}"
        Is the user expressing a new project idea, a curious thought, or a potential task they haven't explicitly asked to start yet?
        If YES and the idea is substantial, return "INTENT: [one sentence summary of the idea]".
        If NO, return "NONE".`;

        try {
            const result = await llm.chat.sendMessage(intentPrompt);
            const text = result.response.text().trim();

            if (text.startsWith('INTENT:')) {
                const intent = text.replace('INTENT:', '').trim();
                console.log(`[Proactive] Detected Intent: ${intent}`);
                // Trigger silent research
                await this.triggerBackgroundResearch('Conversation Intent', intent);
            }
        } catch (error) {
            console.error('[Proactive] Intent detection failed:', error);
        }
    }
}

export const proactiveManager = new ProactiveManager();
