import { Tool } from './registry.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);
const WORKSPACE_ROOT = path.resolve(process.cwd(), '..');

/**
 * Tool to execute shell commands within the workspace securely.
 */
export const executeCommandTool: Tool = {
    name: 'execute_command',
    description: 'Executes a shell command in the workspace root. Use this for git operations, build scripts, or checking system status.',
    parameters: {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                description: 'The shell command to execute.'
            }
        },
        required: ['command']
    },
    execute: async (args: { command: string }) => {
        try {
            console.log(`[ShellTool] Executing command: ${args.command}`);

            // NEW: Strict Command Allowlist (Level 7 Security)
            const ALLOWED_PREFIXES = ['git ', 'npm ', 'ls', 'cat ', 'grep ', 'find ', 'pwd', 'whoami', 'du ', 'df ', 'node ', 'npm run ', './start.sh'];
            const cmd = args.command.trim();
            const isAllowed = ALLOWED_PREFIXES.some(prefix => cmd.startsWith(prefix));

            if (!isAllowed) {
                return `Error: Command policy violation. Your command "${cmd.split(' ')[0]}" is not in the security allowlist. Registered safe prefixes: ${ALLOWED_PREFIXES.join(', ')}`;
            }

            // Basic safety: Prevent some obviously destructive commands
            const dangerousPatterns = ['rm -rf /', 'mkfs', '> /dev/sda'];
            if (dangerousPatterns.some(pattern => args.command.includes(pattern))) {
                return 'Error: Terminated for safety. Command contains a blacklisted pattern.';
            }

            const { stdout, stderr } = await execAsync(args.command, {
                cwd: WORKSPACE_ROOT,
                maxBuffer: 1024 * 1024, // 1MB buffer
                timeout: 30000 // 30s timeout
            });

            let output = '';
            if (stdout) output += stdout;
            if (stderr) output += `\nSTDERR:\n${stderr}`;

            if (!output.trim()) return 'Command executed successfully (no output).';

            return output.trim();
        } catch (error: any) {
            console.error(`[ShellTool] Execution error:`, error);
            return `Execution error:\n${error.stdout || ''}\n${error.stderr || ''}\n${error.message}`;
        }
    }
};
