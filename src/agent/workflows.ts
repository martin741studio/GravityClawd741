import { db } from '../db/index.js';
import { workflows } from '../db/schema.js';
import { LLM } from './llm.js';
import { swarmManager } from './swarm.js';
import { reflector } from './reflector.js';
import { memoryManager } from '../memory/manager.js';
import { eq } from 'drizzle-orm';

export interface WorkflowStep {
    id: number;
    description: string;
    trait: string;
    dependencies: number[];
}

export class WorkflowManager {
    /**
     * Decomposes a complex request into a multi-step plan.
     */
    async createPlan(task: string): Promise<number> {
        const lessons = await memoryManager.getStrategicLessons();
        const bestPractices = lessons.length > 0
            ? `\nGleaned Best Practices & Preferences:\n- ${lessons.join('\n- ')}`
            : '';

        const llm = new LLM([]); // Generalist for planning
        const planningPrompt = `You are a Project Manager. Decompose the following user request into a multi-step plan for specialized agents.
User Request: ${task}
${bestPractices}

Available Traits:
- researcher: Deep web research and fact-finding.
- coder: Writing, debugging, and refactoring code.
- seo: Domain audits, keyword research, and link building.
- generalist: Default assistant for summaries and formatting.

Return a JSON array of steps:
{
  "name": "Project Name",
  "steps": [
    { "id": 1, "description": "Specific task for this step", "trait": "researcher", "dependencies": [] }
  ]
}

DO NOT include any filler text. Only valid JSON.`;

        // Level 18: Use 'high' tier (Ultra) for project planning
        const result = await llm.sendMessage(planningPrompt, { modelPreference: 'high' });
        const planJson = result.response.text();
        const plan = JSON.parse(planJson);

        const [workflow] = await db.insert(workflows).values({
            name: plan.name,
            status: 'planned',
            plan: JSON.stringify(plan.steps),
            currentStep: 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }).returning();

        return workflow.id;
    }

    /**
     * Executes the next available step in a workflow.
     */
    async executeNextStep(workflowId: number, userInput?: string): Promise<string> {
        const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
        if (!workflow) throw new Error('Workflow not found');

        const steps: WorkflowStep[] = JSON.parse(workflow.plan || '[]');
        const currentIdx = workflow.currentStep || 0;

        if (currentIdx >= steps.length) {
            await db.update(workflows).set({ status: 'completed', updatedAt: Date.now() }).where(eq(workflows.id, workflowId));
            // Trigger background reflection
            reflector.reflect(workflowId).catch(console.error);
            return 'Workflow completed.';
        }

        const step = steps[currentIdx];
        await db.update(workflows).set({ status: 'active', updatedAt: Date.now() }).where(eq(workflows.id, workflowId));

        const taskDescription = userInput
            ? `${step.description}\n\nUSER PROVIDED INPUT: ${userInput}`
            : step.description;

        try {
            // Sequential Memory: Pass the existing result (findings from previous steps) as the blackboard
            const blackboard = workflow.result || '';
            let subAgentResult = await swarmManager.spawnSubAgent(taskDescription, step.trait, blackboard);

            // Level 15: Smart Course Correction (Self-Review)
            if (!subAgentResult.startsWith('REQUEST_USER_INPUT:')) {
                const reviewerLLM = new LLM([]);
                const reviewPrompt = `You are a Quality Assurance Reviewer for Gravity Claw.
Analyze the following result from a sub-agent (${step.trait}) for the task: "${step.description}"

SUB-AGENT RESULT:
${subAgentResult}

Is this result sufficient, accurate, and complete based on the task description?
If YES, return "VALID".
If NO, return "FIX: [specific instructions for the sub-agent on how to improve]".`;

                // Level 18: Use 'high' tier for validation/double-checking
                const reviewResp = await reviewerLLM.sendMessage(reviewPrompt, { modelPreference: 'high' });
                const reviewText = reviewResp.response.text().trim();

                if (reviewText.startsWith('FIX:')) {
                    console.log(`[Workflow] Course Correction Triggered: ${reviewText}`);
                    const fixInstructions = reviewText.replace('FIX:', '').trim();
                    // Refined retry
                    const retryTask = `${taskDescription}\n\nFEEDBACK FROM REVIEWER: ${fixInstructions}\nPLEASE FIX YOUR PREVIOUS RESPONSE AND PROVIDE A HIGHER QUALITY RESULT.`;
                    subAgentResult = await swarmManager.spawnSubAgent(retryTask, step.trait, blackboard);
                }
            }

            // Detect user input request after potential retry
            if (subAgentResult.startsWith('REQUEST_USER_INPUT:')) {
                const question = subAgentResult.replace('REQUEST_USER_INPUT:', '').trim();
                await db.update(workflows).set({
                    status: 'blocked',
                    result: (workflow.result || '') + `\n\n### Step ${currentIdx + 1} (BLOCKED): ${step.trait}\nQueston: ${question}`,
                    updatedAt: Date.now()
                }).where(eq(workflows.id, workflowId));
                return `WAITING_FOR_USER: ${question}`;
            }

            // Update workflow state for success
            await db.update(workflows).set({
                currentStep: currentIdx + 1,
                status: 'active', // keep active for next step
                result: (workflow.result || '') + `\n\n### Step ${currentIdx + 1}: ${step.trait}\n${subAgentResult}`,
                updatedAt: Date.now()
            }).where(eq(workflows.id, workflowId));

            return subAgentResult;
        } catch (error: any) {
            await db.update(workflows).set({ status: 'failed', updatedAt: Date.now() }).where(eq(workflows.id, workflowId));
            throw error;
        }
    }
}

export const workflowManager = new WorkflowManager();
