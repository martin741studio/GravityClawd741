import { Tool } from './registry.js';
import { config } from '../config.js';

/**
 * Tool to search the web using Brave Search API.
 */
export const searchWebTool: Tool = {
    name: 'search_web',
    description: 'Searches the web for real-time information, news, or specific queries using the Brave Search API. Returns a list of results with titles, snippets, and links.',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query to look up.'
            }
        },
        required: ['query']
    },
    execute: async (args: { query: string }) => {
        const apiKey = config.braveSearchApiKey;
        if (!apiKey) {
            return 'Error: BRAVE_SEARCH_API_KEY is not set in environment variables. Please add it to your .env file.';
        }

        try {
            console.log(`[WebTool] Searching Brave for: ${args.query}`);
            const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(args.query)}&count=5`, {
                method: 'GET',
                headers: {
                    'X-Subscription-Token': apiKey,
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip'
                }
            });

            if (!response.ok) {
                return `Error: Brave Search API failed (Status ${response.status}: ${response.statusText})`;
            }

            const data: any = await response.json();

            if (!data.web || !data.web.results || data.web.results.length === 0) {
                return 'No search results found for this query via Brave.';
            }

            const results = data.web.results.map((res: any, index: number) => {
                return `${index + 1}. **${res.title}**\n   Link: ${res.url}\n   Snippet: ${res.description}`;
            });

            return `Brave Search results for "${args.query}":\n\n${results.join('\n\n')}\n\n[Tip: Use 'read_url' to dive deeper into any of these links.]`;
        } catch (error: any) {
            console.error(`[WebTool] Search error:`, error);
            return `Error performing Brave search: ${error.message}`;
        }
    }
};
