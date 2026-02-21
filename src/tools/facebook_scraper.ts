import { Tool } from './registry.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const SKILL_DIR = path.resolve(process.cwd(), '../.agent/skills/fb-group-scraper/scripts');

/**
 * Tool to scrape Facebook groups for posts containing matching keywords.
 * Bridges the fb-group-scraper skill into Gravity Claw.
 */
export const scrapeFacebookGroupsTool: Tool = {
    name: 'scrape_facebook_groups',
    description: 'Scrapes specified Facebook groups for posts matching keywords. Returns a list of matching posts with links and snippets. Use for market research or lead generation.',
    parameters: {
        type: 'object',
        properties: {
            groups: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of Facebook group URLs to scrape.'
            },
            keywords: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of keywords to search for in posts.'
            }
        },
        required: ['groups', 'keywords']
    },
    execute: async (args: { groups: string[], keywords: string[] }) => {
        try {
            console.log(`[FBScraper] Starting crawl for ${args.groups.length} groups with keywords: ${args.keywords.join(', ')}`);

            // 1. Update config.json in the skill directory
            const configPath = path.join(SKILL_DIR, 'config.json');
            const config = {
                groups: args.groups,
                include_keywords: args.keywords,
                exclude_keywords: []
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // 2. Execute the scraper script
            // Using FB_NON_INTERACTIVE=true and FB_HEADLESS=true for automation
            const command = 'node fb_job_radar.js';
            const { stdout, stderr } = await execAsync(command, {
                cwd: SKILL_DIR,
                env: {
                    ...process.env,
                    FB_NON_INTERACTIVE: 'true',
                    FB_HEADLESS: 'true'
                },
                timeout: 300000 // 5 minute timeout for safety
            });

            if (stderr && !stdout) {
                console.error(`[FBScraper] Scraper execution error: ${stderr}`);
            }

            // 3. Read and parse output
            const outputPath = path.join(SKILL_DIR, 'out.json');
            if (!fs.existsSync(outputPath)) {
                return 'Error: Scraper finished but output file (out.json) was not found.';
            }

            const rawResults = fs.readFileSync(outputPath, 'utf8');
            const results = JSON.parse(rawResults);

            if (!Array.isArray(results) || results.length === 0) {
                return 'Crawl completed successfully, but no matching posts were found in the specified groups.';
            }

            // 4. Format results for the LLM
            const formattedResults = results.map((res: any, index: number) => {
                const date = res.foundAt ? new Date(res.foundAt).toLocaleDateString() : 'Unknown Date';
                return `${index + 1}. **Post Link**: ${res.postUrl}\n   **Date**: ${date}\n   **Snippet**: ${res.snippet.substring(0, 200)}...`;
            }).join('\n\n');

            return `Successfully scraped ${results.length} leads from Facebook:\n\n${formattedResults}\n\n[Full results saved in out.json and out.csv]`;

        } catch (error: any) {
            console.error(`[FBScraper] Tool error:`, error);
            return `Error executing Facebook scraper: ${error.message}`;
        }
    }
};
