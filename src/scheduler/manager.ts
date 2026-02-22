import cron from 'node-cron';
import { memoryManager } from '../memory/manager.js';
import { registry } from '../tools/registry.js';
import { Agent } from '../agent/engine.js';
import { config } from '../config.js';
import path from 'path';
import * as fs from 'fs';
import { proactiveManager } from '../agent/proactive.js';

export class SchedulerManager {
    private agent: Agent;
    private bot?: any;

    constructor() {
        this.agent = new Agent();
    }

    // Set bot instance for proactive messaging
    setBot(bot: any) {
        this.bot = bot;
    }

    // Start all background jobs
    start() {
        console.log('[Scheduler] Initializing proactive jobs...');

        // 1. Morning Briefing (Daily at 8:00 AM) - Comprehensive Situational Report
        cron.schedule('0 8 * * *', () => this.runDailyBriefing());

        // 2. Workspace Heartbeat (Daily at 9:00 AM) - Quick check for changes
        cron.schedule('0 9 * * *', () => this.runHeartbeat());

        // 3. Memory Summarization (Daily at 3:00 AM)
        cron.schedule('0 3 * * *', () => this.consolidateMemory());

        // 4. Fact Consolidation (Daily at 4:00 AM)
        cron.schedule('0 4 * * *', () => this.runFactConsolidation());

        // 5. Evening Recap (Daily at 9:00 PM) - Summary of the day's work
        cron.schedule('0 21 * * *', () => this.runEveningRecap());

        // 6. Smart Recommendations (Every 6 hours)
        cron.schedule('0 */6 * * *', () => this.runSmartRecommendations());

        // 7. Proactive Workspace Scan (Hourly)
        cron.schedule('0 * * * *', () => proactiveManager.scanWorkspace());

        // 8. System Health Check (Every 30 mins)
        cron.schedule('*/30 * * * *', () => this.runSystemHealthCheck());

        console.log('[Scheduler] Cron jobs scheduled.');
    }

    /**
     * Run proactive system health check and alert if needed.
     */
    async runSystemHealthCheck() {
        const alert = await proactiveManager.checkSystemHealth();
        if (alert && this.bot) {
            await this.bot.api.sendMessage(config.allowedUserId, alert);
        }
    }

    /**
     * Smart Recommendations.
     * Analyzes task.md and context to provide proactive advice.
     */
    async runSmartRecommendations() {
        console.log('[Scheduler] Running Smart Recommendations...');
        try {
            // A. Gather context (tasks + history)
            let taskList = 'No task list found.';
            const taskPath = process.env.TASK_LIST_PATH || path.resolve(process.cwd(), '../.gemini/antigravity/brain/ad92f87c-acfb-4be0-9c23-81116942657a/task.md');
            if (fs.existsSync(taskPath)) {
                taskList = fs.readFileSync(taskPath, 'utf8');
            }

            const recentContext = await memoryManager.getRecentContext(10);
            const summary = await memoryManager.getLatestSummary();

            // B. Generate Recommendation Prompt
            const prompt = `You are Gravity Claw, a high-agency proactive partner. 
            Review the user's current task list and recent conversation.
            
            TASK LIST:
            ${taskList}
            
            RECENT CONTEXT:
            ${summary ? `[PREV SUMMARY]: ${summary.content}` : ''}
            ${recentContext.map((m: any) => `${m.role}: ${m.content}`).join('\n')}
            
            INSTRUCTIONS:
            1. Identify ONE uncompleted task that seems high-priority or where the user might be stuck.
            2. Propose a SPECIFIC action I (the AI) can take right now to help move it forward (e.g., "I can draft that email for you", "I can search for those leads").
            3. If the user hasn't talked for a while, keep it low-pressure. If they are active, be bold.
            
            Response Style: Concise, punchy, helpful. Use Markdown. Start with "💡 **Smart Recommendation**".`;

            const response = await this.agent.run(prompt);

            // C. Send to Telegram
            if (this.bot) {
                await this.bot.api.sendMessage(config.allowedUserId, response, { parse_mode: 'Markdown' });
            }

            // D. Log
            await memoryManager.logMessage('system', `SMART RECOMMENDATION: ${response.substring(0, 100)}...`);

        } catch (error) {
            console.error('[Scheduler] Smart Recommendations failed:', error);
        }
    }

    /**
     * Evening Recap.
     * Summarizes what was accomplished today and what's next.
     */
    async runEveningRecap() {
        console.log('[Scheduler] Generating Evening Recap...');
        try {
            // A. Get activity from the last 14 hours (roughly today)
            // Use 15 instead of 30 to reduce token pressure while still capturing the core of the day
            const messages = await memoryManager.getRecentContext(15);

            // B. Generate Prompt
            const prompt = `You are Gravity Claw. It is evening. Prepare a "Daily Recap" for the user.
            
            RECENT ACTIVITY:
            ${messages.map((m: any) => `${m.role}: ${m.content}`).join('\n')}
            
            INSTRUCTIONS:
            1. **Accomplishments**: List the key things we did today.
            2. **Unfinished Business**: What was started but not finished?
            3. **Tomorrow's Outlook**: Briefly mention what should be the first priority tomorrow.
            
            Keep it warm but professional. Use Markdown.`;

            // C. Truncate prompt if extremely long (Safety Guard)
            // Roughly 4 tokens per char, so 40k chars ~ 10k tokens
            const safePrompt = prompt.length > 40000 ? prompt.substring(0, 40000) + '... [TRUNCATED DUE TO LENGTH]' : prompt;

            const response = await this.agent.run(safePrompt);

            // C. Send to Telegram
            if (this.bot) {
                await this.bot.api.sendMessage(config.allowedUserId, `🌙 **Evening Recap**\n\n${response}`, { parse_mode: 'Markdown' });
            }

            // D. Log it
            await memoryManager.logMessage('system', `EVENING RECAP GENERATED: ${response.substring(0, 100)}...`);

        } catch (error) {
            console.error('[Scheduler] Evening Recap failed:', error);
        }
    }

    /**
     * Comprehensive Morning Briefing.
     * Summarizes tasks, recent memories, and current focus.
     */
    async runDailyBriefing() {
        console.log('[Scheduler] Generating Daily Briefing...');
        try {
            // A. Gather Context
            const summary = await memoryManager.getLatestSummary();
            const recentContext = await memoryManager.getRecentContext(5);

            // B. Read Task List
            let taskList = 'No task list found.';
            const taskPath = path.resolve(process.cwd(), '.gemini/antigravity/brain/ad92f87c-acfb-4be0-9c23-81116942657a/task.md');
            if (fs.existsSync(taskPath)) {
                taskList = fs.readFileSync(taskPath, 'utf8');
            }

            // C. Generate Prompt
            const prompt = `You are Gravity Claw's Chief of Staff. Prepare a high-density "Morning Situational Report" for the user.
            
            HISTORY/FACTS:
            ${summary ? `[LATEST SUMMARY]: ${summary.content}` : ''}
            ${recentContext.map((m: any) => `${m.role}: ${m.content}`).join('\n')}
            
            CURRENT TASK LIST:
            ${taskList}
            
            INSTRUCTIONS:
            1. **Today's Priorities**: Identify the top 3 uncompleted tasks from Level 6-8.
            2. **Workspace Status**: Briefly summarize where we left off based on history.
            3. **Personal Touch**: Acknowledge any reported user stressors or preferences from memory.
            4. **Call to Action**: One specific question to kickstart the day.
            
            STYLE: Professional, concise, proactive. Use Markdown formatting.`;

            const response = await this.agent.run(prompt);

            // D. Send to Telegram
            if (this.bot) {
                await this.bot.api.sendMessage(config.allowedUserId, `☀️ **Morning Situational Report**\n\n${response}`, { parse_mode: 'Markdown' });
                console.log('[Scheduler] Daily Briefing sent.');
            }

            // E. Log it
            await memoryManager.logMessage('system', `DAILY BRIEFING GENERATED: ${response.substring(0, 100)}...`);

        } catch (error) {
            console.error('[Scheduler] Daily Briefing failed:', error);
        }
    }

    private async runFactConsolidation() {
        console.log('[Scheduler] Running Fact Consolidation...');
        try {
            await memoryManager.consolidateFacts();
        } catch (error) {
            console.error('[Scheduler] Fact Consolidation failed:', error);
        }
    }

    async runHeartbeat() {
        console.log('[Scheduler] Running Morning Heartbeat...');
        try {
            const prompt = `It is morning. Perform a "Workspace Heartbeat":
1. Use 'list_files' to see what changed recently in the repository.
2. Search for any urgent reports or infrastructure notes.
3. Prepare a concise 'Morning Briefing' for the user.
4. If something looks urgent, mention it.

Keep the summary professional and focused on the project.`;

            const response = await this.agent.run(prompt);
            console.log('[Scheduler] Heartbeat Response:', response);

            // Log to memory so the user can ask about it later
            await memoryManager.logMessage('system', `PROACTIVE HEARTBEAT: ${response}`);

            // Send to user
            if (this.bot) {
                await this.bot.api.sendMessage(config.allowedUserId, `💓 **Workspace Heartbeat**\n\n${response}`, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            console.error('[Scheduler] Heartbeat failed:', error);
        }
    }

    private async consolidateMemory() {
        console.log('[Scheduler] Consolidating memory...');
        // Trigger the custom pruning logic from Level 5
        try {
            await memoryManager.summarizeHistory(20);
        } catch (error) {
            console.error('[Scheduler] Memory consolidation failed:', error);
        }
    }
}

export const schedulerManager = new SchedulerManager();
