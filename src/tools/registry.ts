import { Context } from 'grammy';
import { searchWebTool } from './search.js';
import { speakTool } from './voice.js';
import { executeCommandTool } from './shell.js';
import { scrapeFacebookGroupsTool } from './facebook_scraper.js';
import { delegateTaskTool } from './swarm.js';
import { runWorkflowTool, resumeWorkflowTool } from './workflow.js';

export interface Tool {
    name: string;
    description: string;
    parameters: any; // JSON Schema
    execute: (args: any, ctx?: Context) => Promise<string>;
}

export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    register(tool: Tool) {
        this.tools.set(tool.name, tool);
    }

    get(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    getAll(): Tool[] {
        return Array.from(this.tools.values());
    }
}

export const registry = new ToolRegistry();

// Initial registration of built-in tools
registry.register(searchWebTool);
registry.register(speakTool);
registry.register(executeCommandTool);
registry.register(scrapeFacebookGroupsTool);
registry.register(delegateTaskTool);
registry.register(runWorkflowTool);
registry.register(resumeWorkflowTool);
