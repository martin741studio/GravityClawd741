import { Tool } from './registry.js';
import * as fs from 'fs';
import * as path from 'path';
import { Context } from 'grammy';

const WORKSPACE_ROOT = path.resolve(process.cwd(), '..'); // Assuming GravityClaw is in 741agency/GravityClaw

/**
 * Tool to list files in a directory within the workspace.
 */
export const listFilesTool: Tool = {
    name: 'list_files',
    description: 'Lists files and directories in a given path within the workspace. Use this to explore the project structure.',
    parameters: {
        type: 'object',
        properties: {
            directoryPath: {
                type: 'string',
                description: 'The relative path from the workspace root (741agency) to list.',
                default: '.'
            }
        }
    },
    execute: async (args: { directoryPath?: string }) => {
        try {
            const relPath = args.directoryPath || '.';
            const targetPath = path.resolve(WORKSPACE_ROOT, relPath);

            // Safety check: Ensure we stay within the workspace
            if (!targetPath.startsWith(WORKSPACE_ROOT)) {
                return 'Error: Access denied. Path is outside of the workspace.';
            }

            if (!fs.existsSync(targetPath)) {
                return `Error: Path does not exist: ${relPath}`;
            }

            const stats = fs.statSync(targetPath);
            if (!stats.isDirectory()) {
                return `Error: Path is a file, not a directory: ${relPath}`;
            }

            const items = fs.readdirSync(targetPath);
            const detailedItems = items.map(item => {
                const itemPath = path.join(targetPath, item);
                const itemStats = fs.statSync(itemPath);
                return `${itemStats.isDirectory() ? '[DIR]' : '[FILE]'} ${item}`;
            });

            return `Contents of ${relPath}:\n${detailedItems.join('\n')}`;
        } catch (error: any) {
            return `Error listing files: ${error.message}`;
        }
    }
};

/**
 * Tool to read a specific file from the workspace.
 */
export const readFileTool: Tool = {
    name: 'read_file',
    description: 'Reads the content of a specific file within the workspace. Use this to examine code or documents.',
    parameters: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'The relative path from the workspace root (741agency) to the file.'
            }
        },
        required: ['filePath']
    },
    execute: async (args: { filePath: string }) => {
        try {
            const targetPath = path.resolve(WORKSPACE_ROOT, args.filePath);

            // Safety check: Ensure we stay within the workspace
            if (!targetPath.startsWith(WORKSPACE_ROOT)) {
                return 'Error: Access denied. Path is outside of the workspace.';
            }

            if (!fs.existsSync(targetPath)) {
                return `Error: File does not exist: ${args.filePath}`;
            }

            const stats = fs.statSync(targetPath);
            if (stats.isDirectory()) {
                return `Error: Path is a directory, not a file: ${args.filePath}`;
            }

            // Limit file size for LLM context safety (e.g., 50KB)
            if (stats.size > 50 * 1024) {
                return `Error: File is too large (${Math.round(stats.size / 1024)}KB). Please use search or read smaller chunks.`;
            }

            const content = fs.readFileSync(targetPath, 'utf-8');
            return `Content of ${args.filePath}:\n\n${content}`;
        } catch (error: any) {
            return `Error reading file: ${error.message}`;
        }
    }
};

/**
 * Tool to write or overwrite a file in the workspace.
 */
export const writeFileTool: Tool = {
    name: 'write_file',
    description: 'Creates or overwrites a file with specific content within the workspace. Use this to help the user draft code or notes.',
    parameters: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'The relative path from the workspace root (741agency) to the file.'
            },
            content: {
                type: 'string',
                description: 'The full text content to write to the file.'
            }
        },
        required: ['filePath', 'content']
    },
    execute: async (args: { filePath: string, content: string }) => {
        try {
            const targetPath = path.resolve(WORKSPACE_ROOT, args.filePath);

            // Safety check: Ensure we stay within the workspace
            if (!targetPath.startsWith(WORKSPACE_ROOT)) {
                return 'Error: Access denied. Path is outside of the workspace.';
            }

            // Create directory if it doesn't exist
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(targetPath, args.content, 'utf-8');
            return `Successfully wrote file: ${args.filePath}`;
        } catch (error: any) {
            return `Error writing file: ${error.message}`;
        }
    }
};

