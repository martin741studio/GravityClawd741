import { Tool } from './registry.js';
import { workflowManager } from '../agent/workflows.js';
import { reflector } from '../agent/reflector.js';

/**
 * Tool to initiate a complex multi-step workflow.
 */
export const runWorkflowTool: Tool = {
    name: 'run_workflow',
    description: 'Decomposes a complex request into a multi-step plan and executes it step-by-step using specialized agents. Use this for major projects (e.g., "Build a full landing page", "Run a deep SEO audit").',
    parameters: {
        type: 'object',
        properties: {
            request: {
                type: 'string',
                description: 'The high-level user request to decompose.'
            }
        },
        required: ['request']
    },
    execute: async (args: { request: string }) => {
        try {
            const workflowId = await workflowManager.createPlan(args.request);
            let results = `Starting Workflow #${workflowId}...\n`;

            let completed = false;
            while (!completed) {
                const stepResult = await workflowManager.executeNextStep(workflowId);

                if (stepResult.includes('WAITING_FOR_USER')) {
                    const question = stepResult.split('WAITING_FOR_USER:')[1].trim();
                    return `### Workflow Paused (ID: ${workflowId})\n\nI need more information to proceed with the next step:\n\n**${question}**\n\nPlease reply to this message to provide the details and I will resume the workflow.`;
                }

                if (stepResult === 'Workflow completed.') {
                    completed = true;
                } else {
                    results += `\nStep Finished: ${stepResult.substring(0, 100)}...\n`;
                }
            }

            return `### Workflow Completed!\n${results}`;
        } catch (error: any) {
            return `Error in workflow execution: ${error.message}`;
        }
    }
};

/**
 * Tool to resume a blocked workflow with user input.
 */
export const resumeWorkflowTool: Tool = {
    name: 'resume_workflow',
    description: 'Resumes a blocked workflow with the provided user input. Use this when a workflow is PAUSED and waiting for information.',
    parameters: {
        type: 'object',
        properties: {
            workflowId: {
                type: 'number',
                description: 'The ID of the workflow to resume.'
            },
            input: {
                type: 'string',
                description: 'The information provided by the user.'
            }
        },
        required: ['workflowId', 'input']
    },
    execute: async (args: { workflowId: number, input: string }) => {
        try {
            // Learn from user feedback in the background
            reflector.learnPreference(args.input).catch(console.error);

            let results = `Resuming Workflow #${args.workflowId}...\n`;

            let completed = false;
            let currentInput: string | undefined = args.input;

            while (!completed) {
                const stepResult = await workflowManager.executeNextStep(args.workflowId, currentInput);
                currentInput = undefined; // Only use input for the first resumption call

                if (stepResult.includes('WAITING_FOR_USER')) {
                    const question = stepResult.split('WAITING_FOR_USER:')[1].trim();
                    return `### Workflow Paused Again (ID: ${args.workflowId})\n\nI need even more information:\n\n**${question}**\n\nPlease reply again to continue.`;
                }

                if (stepResult === 'Workflow completed.') {
                    completed = true;
                } else {
                    results += `\nStep Resumed & Finished: ${stepResult.substring(0, 100)}...\n`;
                }
            }

            return `### Workflow Resumed & Completed!\n${results}`;
        } catch (error: any) {
            return `Error in workflow resumption: ${error.message}`;
        }
    }
};
