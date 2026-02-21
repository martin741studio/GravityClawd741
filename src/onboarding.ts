import { memoryManager } from './memory/manager.js';
import { Context } from 'grammy';

interface SetupState {
    step: number;
    answers: Record<string, string>;
}

// In-memory state (resets on restart, which is fine for a setup flow)
const sessions = new Map<number, SetupState>();

const QUESTIONS = [
    { key: 'name', text: "1. **What should I call you?** (Your name)" },
    { key: 'role', text: "2. **What do you do?** (Profession/Role)" },
    { key: 'location', text: "3. **Where are you based?** (City/Timezone)" },
    { key: 'goals', text: "4. **What are your main goals or active projects right now?**" },
    { key: 'interests', text: "5. **What topics are you interested in?**" },
    { key: 'communication', text: "6. **How do you like to communicate?** (Short/Long, Formal/Casual)" },
    { key: 'tools', text: "7. **What tools do you use daily?**" },
    { key: 'people', text: "8. **Who are the important people I should know about?** (Partners, Team, Family)" },
];

export class OnboardingManager {

    isSetupActive(userId: number): boolean {
        return sessions.has(userId);
    }

    async handleSetupCommand(ctx: Context) {
        const userId = ctx.from?.id;
        if (!userId) return;

        sessions.set(userId, { step: 0, answers: {} });

        await ctx.reply("**Welcome to Gravity Claw Setup!**\n\nI'm going to ask you 8 quick questions to build my Core Memory about you.\nType `skip` to skip any question.\n\n" + QUESTIONS[0].text, { parse_mode: "Markdown" });
    }

    async handleMessage(ctx: Context, next: () => Promise<void>) {
        const userId = ctx.from?.id;
        if (!userId) return next();

        const session = sessions.get(userId);
        if (!session) return next(); // Not in setup mode

        const text = ctx.message?.text?.trim();
        if (!text) return next();

        // Check for cancel
        if (text.toLowerCase() === '/cancel') {
            sessions.delete(userId);
            await ctx.reply("Setup cancelled.");
            return;
        }

        // Process Answer
        const currentQ = QUESTIONS[session.step];

        if (text.toLowerCase() !== 'skip') {
            // Store as a core fact
            const fact = `User's ${currentQ.key} is: ${text}`;
            await memoryManager.storeFact(fact);
            session.answers[currentQ.key] = text;
        }

        // Advance
        session.step++;

        if (session.step >= QUESTIONS.length) {
            // Done
            sessions.delete(userId);
            await ctx.reply("**Setup Complete!**\n\nI have stored these facts in my local Core Memory (SQLite). I will remember them forever (even if you restart me).", { parse_mode: "Markdown" });
        } else {
            // Next Question
            await ctx.reply(QUESTIONS[session.step].text, { parse_mode: "Markdown" });
        }
    }
}

export const onboarding = new OnboardingManager();
