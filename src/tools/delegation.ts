import { swarmManager } from '../agent/swarm.js';

export interface DelegateSubtaskParams {
    task: string;
    trait: string;
    instructions: string;
}

/**
 * Tool to allow an agent to delegate a sub-task to another specialist.
 */
export async function delegateSubtask(params: DelegateSubtaskParams, currentDepth: number = 0): Promise<string> {
    const MAX_DEPTH = 3;
    if (currentDepth >= MAX_DEPTH) {
        return "ERROR: Maximum delegation depth reached. Please consolidate and return what you have.";
    }

    console.log(`[Swarm] Recursive Delegation (Depth ${currentDepth + 1}): Delegating "${params.task}" to ${params.trait}`);

    // Pass along instructions as part of the task description for the sub-agent
    const finalTask = `${params.task}\n\nSPECIAL INSTRUCTIONS FROM PARENT AGENT:\n${params.instructions}`;

    try {
        // We call swarmManager.spawnSubAgent directly, passing the incremented depth
        const result = await swarmManager.spawnSubAgent(finalTask, params.trait, undefined, currentDepth + 1);
        return `DELEGATION_RESULT from ${params.trait}:\n${result}`;
    } catch (error: any) {
        return `DELEGATION_ERROR: ${error.message}`;
    }
}
