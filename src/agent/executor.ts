import { registry } from '../tools/registry.js';
import { Context } from 'grammy';
import { memoryManager } from '../memory/manager.js';

export interface ToolExecutionResult {
    functionResponse: {
        name: string;
        response: { output?: any; error?: string };
        id?: string;
    };
}

export class ToolExecutor {
    /**
     * Executes all requested function calls in parallel.
     */
    async executeAll(functionCalls: any[], ctx?: Context): Promise<ToolExecutionResult[]> {
        console.log(`[Executor] Handling ${functionCalls.length} function call(s)...`);

        return Promise.all(
            functionCalls.map(async (call: { name: string; args: any; id?: string }) => {
                const tool = registry.get(call.name);
                if (!tool) {
                    console.error(`[Executor] Tool not found: ${call.name}`);
                    return {
                        functionResponse: {
                            name: call.name,
                            response: { error: `Tool ${call.name} not found.` },
                            id: call.id
                        }
                    };
                }

                try {
                    console.log(`[Executor] Executing ${call.name}...`);
                    const output = await tool.execute(call.args, ctx);
                    return {
                        functionResponse: {
                            name: call.name,
                            response: { output: output },
                            id: call.id
                        }
                    };
                } catch (error: any) {
                    console.error(`[Executor] Error executing ${call.name}:`, error);
                    return {
                        functionResponse: {
                            name: call.name,
                            response: { error: error.message || String(error) },
                            id: call.id
                        }
                    };
                }
            })
        );
    }
}
