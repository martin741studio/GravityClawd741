import { LLM } from './llm.js';
import { registry } from '../tools/registry.js';
import { TRAITS, Trait } from './traits.js';
import { memoryManager } from '../memory/manager.js';

export class SwarmManager {
    /**
     * Spawns a sub-agent with a specific trait to execute a task.
     */
    async spawnSubAgent(task: string, traitId: string, blackboard?: string, depth: number = 0): Promise<string> {
        const trait = TRAITS[traitId] || TRAITS['generalist'];
        console.log(`[Swarm] Spawning sub-agent: ${trait.name} for task: ${task.substring(0, 50)}...`);

        const tools = registry.getAll();
        const llm = new LLM(tools);

        const contextInfo = blackboard ? `\n\nCOLLABORATIVE BLACKBOARD (Previous Findings):\n${blackboard}` : '';
        const depthInfo = depth > 0 ? `\n(Delegation Depth: ${depth})` : '';
        const systemPrompt = `${trait.systemPrompt}${contextInfo}${depthInfo}\n\nTASK: ${task}\n\nYour goal is to complete this specific task and return the final finding or output. Do not engage in conversational filler.`;

        try {
            // Level 18: Sub-agents use 'efficient' tier by default to save costs
            const result = await llm.sendMessage(systemPrompt, { modelPreference: 'efficient' });
            const response = result.response.text();

            // Log sub-agent activity
            await memoryManager.logMessage('system', `Sub-agent (${trait.name}) completed task: ${task.substring(0, 50)}...`);

            return response;
        } catch (error: any) {
            console.error(`[Swarm] Sub-agent execution failed:`, error);
            return `Error: Sub-agent execution failed: ${error.message}`;
        }
    }
}

export const swarmManager = new SwarmManager();
