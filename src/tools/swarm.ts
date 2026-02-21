import { Tool } from './registry.js';
import { swarmManager } from '../agent/swarm.js';
import { TRAITS } from '../agent/traits.js';

/**
 * Tool to delegate a complex task to a specialized sub-agent.
 */
export const delegateTaskTool: Tool = {
    name: 'delegate_task',
    description: 'Delegates a complex sub-task to a specialized sub-agent (e.g., researcher, coder, seo). Use this when you need deep work on a specific topic while you continue managing the main conversation.',
    parameters: {
        type: 'object',
        properties: {
            task: {
                type: 'string',
                description: 'The specific task or prompt for the sub-agent.'
            },
            trait: {
                type: 'string',
                enum: Object.keys(TRAITS),
                description: 'The role/trait of the sub-agent.'
            }
        },
        required: ['task', 'trait']
    },
    execute: async (args: { task: string; trait: string }, ctx?: any) => {
        try {
            // Level 18: Passing along recursion depth if available in context
            const depth = ctx?.delegationDepth || 0;
            const result = await swarmManager.spawnSubAgent(args.task, args.trait, undefined, depth + 1);
            return `### Sub-Agent (${args.trait}) Output (Recursive Depth: ${depth + 1}):\n${result}`;
        } catch (error: any) {
            return `Error in delegation: ${error.message}`;
        }
    }
};
