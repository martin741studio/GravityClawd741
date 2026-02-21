import { Bot } from 'grammy';
import dotenv from 'dotenv'; // Ensure dotenv is loaded first
dotenv.config({ override: true });

import { config } from './config.js';
import { Agent } from './agent/engine.js';
import { getCurrentTimeTool } from './tools/time.js';
import { speakTool } from './tools/voice.js';
import { getWeatherTool } from './tools/weather.js';
import { readUrlTool } from './tools/web.js';
import { searchWebTool } from './tools/search.js';
import { executeCommandTool } from './tools/shell.js';
import { listFilesTool, readFileTool, writeFileTool } from './tools/workspace.js';
import { scrapeFacebookGroupsTool } from './tools/facebook_scraper.js';
import { registry } from './tools/registry.js';
import { transcribeAudio } from './transcription.js';
import * as fs from 'fs';
import { onboarding } from './onboarding.js';
import { schedulerManager } from './scheduler/manager.js';
import { initializeDatabase, sqlite } from './db/index.js';
import express from 'express';

async function main() {
    // 0. Cloud Health Check Server (Level 18 Orbit Stabilizer)
    const app = express();
    const port = process.env.PORT || 8080;
    app.get('/', (req, res) => res.send('Gravity Claw Shield++ v1.1.8'));
    app.listen(Number(port), '0.0.0.0', () => console.log(`[Status] Health Check Server live on 0.0.0.0:${port}`));

    // 1. Initialize Database (FATAL if fails)
    await initializeDatabase();
    console.log('[DB] Orbit Check: Database initialized and ready.');

    // Initialize Bot
    const bot = new Bot(config.telegramBotToken);

    // 2. High-Priority Diagnostic Middleware (Zero Dependency)
    // This MUST be the very first middleware to catch /status before any AI Agent logic triggers.
    bot.use(async (ctx, next) => {
        const text = ctx.message?.text?.trim().toLowerCase() || '';
        if (text === '/status' || text === 'status' || text === '/status@botname') {
            const isRailway = !!process.env.RAILWAY_ENVIRONMENT_NAME || !!process.env.RAILWAY_STATIC_URL;
            const env = isRailway ? 'RAILWAY (Cloud)' : 'LOCAL (MacBook)';
            const dbSource = process.env.DB_PATH || (isRailway ? '/data/memory.db' : 'data/memory.db');
            const version = '1.1.8 (Shield++)';

            let dbStatus = 'Disconnected';
            let msgCount = 0;

            try {
                // Direct SQLite check - zero reliance on MemoryManager or Drizzle here.
                const tableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'").get();
                if (tableCheck) {
                    const row = sqlite.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number };
                    msgCount = row?.count ?? 0;
                    dbStatus = `Connected (${msgCount} messages found)`;
                } else {
                    dbStatus = 'Error: conversations table is missing';
                }
            } catch (error: any) {
                dbStatus = `Critical Error: ${error.message}`;
            }

            const report = [
                `Gravity Claw Status`,
                `-------------------`,
                `Version: ${version}`,
                `Environment: ${env}`,
                `Database Path: ${dbSource}`,
                `Database Status: ${dbStatus}`,
                `System Memory: ${Math.floor(process.memoryUsage().rss / 1024 / 1024)} MB`,
                `Process Uptime: ${Math.floor(process.uptime() / 60)} minutes`,
                `-------------------`,
                `Status: Orbit Locked`
            ].join('\n');

            return await ctx.reply(report);
        }
        await next();
    });

    // 3. User Whitelist Middleware
    bot.use(async (ctx, next) => {
        const userId = ctx.from?.id;
        if (userId !== config.allowedUserId) {
            console.warn(`Blocked message from unauthorized user: ${userId}`);
            return;
        }
        await next();
    });

    // Register tools
    registry.register(getCurrentTimeTool);
    registry.register(speakTool);
    registry.register(getWeatherTool);
    registry.register(listFilesTool);
    registry.register(readFileTool);
    registry.register(writeFileTool);
    registry.register(readUrlTool);
    registry.register(searchWebTool);
    registry.register(executeCommandTool);
    registry.register(scrapeFacebookGroupsTool);

    // Initialize Scheduler
    schedulerManager.setBot(bot);
    schedulerManager.start();

    // Initialize Agent (after tools are registered)
    const agent = new Agent();

    // State for Talk Mode
    let isTalkMode = false;

    // Command Handlers
    bot.command('talk', async (ctx) => {
        isTalkMode = !isTalkMode;
        const status = isTalkMode ? 'enabled' : 'disabled';
        await ctx.reply(`Talk Mode ${status}. ${isTalkMode ? 'I will reply with voice messages.' : 'I will reply with text.'}`);
    });

    bot.command('setup', async (ctx) => {
        await onboarding.handleSetupCommand(ctx);
    });

    bot.command('pulse', async (ctx) => {
        await ctx.reply('Triggering Workspace Heartbeat...');
        await (schedulerManager as any).runHeartbeat();
    });

    bot.command('briefing', async (ctx) => {
        await ctx.reply('Generating your Morning Situational Report...');
        await (schedulerManager as any).runDailyBriefing();
    });

    bot.command('recap', async (ctx) => {
        await ctx.reply('Generating your Evening Recap...');
        await (schedulerManager as any).runEveningRecap();
    });

    bot.command('recs', async (ctx) => {
        await ctx.reply('Analyzing your workspace for recommendations...');
        await (schedulerManager as any).runSmartRecommendations();
    });

    bot.command('cleanup', async (ctx) => {
        const initial = Math.floor(process.memoryUsage().rss / 1024 / 1024);
        await ctx.reply(`Starting memory cleanup... (Initial: ${initial} MB)`);

        // Clear caches
        if (global.gc) {
            global.gc();
        }

        const final = Math.floor(process.memoryUsage().rss / 1024 / 1024);
        await ctx.reply(`Cleanup complete. Current memory: ${final} MB. Saving: ${initial - final} MB.`);
    });

    // Handle text messages
    bot.on('message:text', async (ctx) => {
        await onboarding.handleMessage(ctx, async () => {
            await handleMessage(ctx, ctx.message.text, isTalkMode);
        });
    });

    // Handle photos
    bot.on('message:photo', async (ctx) => {
        await ctx.replyWithChatAction('typing');
        try {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const file = await ctx.api.getFile(photo.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

            const response = await fetch(fileUrl);
            const arrayBuffer = await response.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');
            const mimeType = 'image/jpeg';

            const multimodalPayload = [
                { text: ctx.message.caption || 'What is in this image?' },
                { inlineData: { mimeType, data: base64 } }
            ];

            await handleMessage(ctx, multimodalPayload as any, isTalkMode);
        } catch (error: any) {
            console.error('Error handling photo:', error);
            await ctx.reply(`Error processing photo: ${error.message}`);
        }
    });

    // Handle documents
    bot.on('message:document', async (ctx) => {
        await ctx.replyWithChatAction('typing');
        try {
            const doc = ctx.message.document;
            const allowedMimeTypes = ['application/pdf', 'text/plain', 'text/markdown'];

            if (!allowedMimeTypes.includes(doc.mime_type || '')) {
                return await ctx.reply('I can only process PDFs or text documents for now.');
            }

            const file = await ctx.api.getFile(doc.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

            const response = await fetch(fileUrl);
            const arrayBuffer = await response.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');

            const multimodalPayload = [
                { text: ctx.message.caption || `Summary of this file: ${doc.file_name}` },
                { inlineData: { mimeType: doc.mime_type!, data: base64 } }
            ];

            await handleMessage(ctx, multimodalPayload as any, isTalkMode);
        } catch (error: any) {
            console.error('Error handling document:', error);
            await ctx.reply(`Error processing document: ${error.message}`);
        }
    });

    // Handle voice messages
    bot.on('message:voice', async (ctx) => {
        await ctx.replyWithChatAction('typing');
        try {
            const file = await ctx.getFile();
            const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
            let ext = file.file_path?.split('.').pop() || 'ogg';
            if (ext === 'oga') ext = 'ogg';

            const fileName = `voice_${Date.now()}.${ext}`;
            const path = `temp/${fileName}`;

            if (!fs.existsSync('temp')) fs.mkdirSync('temp');

            const response = await fetch(fileUrl);
            const arrayBuffer = await response.arrayBuffer();
            fs.writeFileSync(path, Buffer.from(arrayBuffer));

            const transcription = await transcribeAudio(path);
            console.log(`[Voice] Transcribed: "${transcription}"`);
            await ctx.reply(`I heard: "${transcription}"`);
            await handleMessage(ctx, transcription, true);

            if (fs.existsSync(path)) fs.unlinkSync(path);
        } catch (error: any) {
            console.error('Error handling voice message:', error);
            await ctx.reply(`Error processing voice message: ${error.message}`);
        }
    });

    async function handleMessage(ctx: any, userMessage: string | any[], forceVoice: boolean = false) {
        await ctx.replyWithChatAction('typing');
        try {
            let finalPayload = userMessage;
            const voiceInstruction = `\n\n[SYSTEM ALERT: VOICE MODE ACTIVE. You MUST use the 'speak' tool for your response. Do not use text only. Ensure your 'speak' content is professional and concise.]`;

            if (forceVoice) {
                if (typeof finalPayload === 'string') {
                    finalPayload += voiceInstruction;
                } else if (Array.isArray(finalPayload)) {
                    const textPart = finalPayload.find(p => p.text);
                    if (textPart) {
                        textPart.text += voiceInstruction;
                    } else {
                        finalPayload.push({ text: voiceInstruction });
                    }
                }
            }

            const response = await agent.run(finalPayload, ctx);
            if (!response.includes('(Voice message sent containing:')) {
                const safeResponse = (response && response.trim().length > 0) ? response : "[No text response]";
                await ctx.reply(safeResponse);
            }
        } catch (error) {
            console.error('Error processing message:', error);
            await ctx.reply('Sorry, I encountered an error.');
        }
    }

    console.log(`Starting Gravity Claw for user ID: ${config.allowedUserId}`);
    await bot.start({
        onStart: (botInfo) => {
            console.log(`Gravity Claw Orbit Established! Bot: @${botInfo.username}`);
        },
    });
}

main().catch(console.error);
