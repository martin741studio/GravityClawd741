import { db } from '../db/index.js';
import { workflows } from '../db/schema.js';
import { memoryManager } from '../memory/manager.js';
import { LLM } from './llm.js';
import { eq } from 'drizzle-orm';

export class Reflector {
    /**
     * Analyzes a completed workflow to extract strategic lessons.
     */
    async reflect(workflowId: number): Promise<void> {
        console.log(`[Reflector] Analyzing Workflow #${workflowId}...`);

        try {
            const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
            if (!workflow || workflow.status !== 'completed') return;

            const llm = new LLM([]); // Using generalist/high-reasoning for reflection
            const reflectionPrompt = `You are a Meta-Cognitive Analyst for Gravity Claw. 
Analyze the following completed workflow and extract "Strategic Lessons".

Workflow Name: ${workflow.name}
Full Result:
${workflow.result}

Extract the following in a concise summary:
1. SUCCESSFUL PATTERNS: What tool sequences or agent hand-offs worked well?
2. USER PREFERENCES: What did we learn about how the user wants things done?
3. OPTIMIZATION: How can we do this faster or better next time?

Format each lesson as a single, stand-alone "Fact" that can be stored in long-term memory.
Separate lessons with '---'.`;

            const result = await llm.chat.sendMessage(reflectionPrompt);
            const lessons = result.response.text().split('---');

            for (const lesson of lessons) {
                const cleaned = lesson.trim();
                if (cleaned.length > 20) {
                    await memoryManager.storeFact(cleaned, undefined, 'strategic_lesson', {
                        workflowId: workflowId,
                        workflowName: workflow.name
                    });
                    console.log(`[Reflector] Learned: ${cleaned.substring(0, 50)}...`);
                }
            }

            console.log(`[Reflector] Reflection complete for Workflow #${workflowId}.`);
        } catch (error) {
            console.error(`[Reflector] Failed to reflect on Workflow #${workflowId}:`, error);
        }
    }

    /**
     * Extracts user preferences from a specific interaction.
     */
    async learnPreference(input: string): Promise<void> {
        if (input.length < 10) return;

        try {
            const llm = new LLM([]);
            const prefPrompt = `Analyze the following user input for communication preferences or procedural instructions.
User Input: "${input}"

If this input contains a preference (e.g., "Keep it short", "Use more data", "I don't like emojis"), extract it as a stand-alone fact.
If it is just data (e.g., "The URL is example.com"), ignore it.

Return ONLY the extracted preference as a string, or "NONE".`;

            const result = await llm.chat.sendMessage(prefPrompt);
            const preference = result.response.text().trim();

            if (preference !== 'NONE' && preference.length > 5) {
                await memoryManager.storeFact(preference, undefined, 'user_preference');
                console.log(`[Reflector] Learned Preference: ${preference}`);
            }
        } catch (error) {
            console.error('[Reflector] Failed to learn preference:', error);
        }
    }
}

export const reflector = new Reflector();
