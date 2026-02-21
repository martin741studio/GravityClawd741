import { Tool } from './registry.js';
import { Context } from 'grammy';
// Note: We'll use a simple regex-based or manual cleaning approach to keep it lean, 
// or common libraries if already in package.json.
// Package.json has 'node-fetch'.

/**
 * Tool to read content from a URL and return a simplified markdown version.
 */
export const readUrlTool: Tool = {
    name: 'read_url',
    description: 'Fetches content from a URL and returns it as simplified text/markdown. Use this to read articles, documentation, or any web page the user provides.',
    parameters: {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                description: 'The full URL to read (e.g., https://example.com/article).'
            }
        },
        required: ['url']
    },
    execute: async (args: { url: string }) => {
        try {
            console.log(`[WebTool] Fetching URL: ${args.url}`);
            const response = await fetch(args.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; GravityClaw/1.0; +https://github.com/martindrendel/741agency)'
                }
            });

            if (!response.ok) {
                return `Error: Failed to fetch URL (Status ${response.status}: ${response.statusText})`;
            }

            const html = await response.text();

            // Very simple HTML to Text/Markdown conversion to keep it lean
            // Remove scripts and styles
            let text = html
                .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
                .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
                .replace(/<[^>]+>/g, ' ') // Strip tags
                .replace(/\s+/g, ' ') // Collapse whitespace
                .trim();

            // Limit length for LLM context
            if (text.length > 10000) {
                text = text.substring(0, 10000) + '... [Content Truncated]';
            }

            return `Content from ${args.url}:\n\n${text}`;
        } catch (error: any) {
            console.error(`[WebTool] Error reading URL:`, error);
            return `Error reading URL: ${error.message}`;
        }
    }
};
