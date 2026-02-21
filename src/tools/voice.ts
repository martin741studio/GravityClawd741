import { ElevenLabsClient } from 'elevenlabs';
import { config } from '../config.js';
import * as fs from 'fs';
import * as path from 'path';
// import { v4 as uuidv4 } from 'uuid'; // Removed as unused
import { Tool } from './registry.js';
import { Context, InputFile } from 'grammy';

const client = new ElevenLabsClient({ apiKey: config.elevenlabsApiKey });

// Standard "Rachel" voice ID from ElevenLabs (American, Calm)
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

export const speakTool: Tool = {
    name: 'speak',
    description: 'Generates a voice message from text and sends it to the user. Use this when the user asks you to speak, say something, or reply with voice.',
    parameters: {
        type: 'object',
        properties: {
            text: {
                type: 'string',
                description: 'The text content to speak.',
            },
            tone: {
                type: 'string',
                description: 'Optional description of the tone (e.g., "excited", "serious"). Currently just logs the intent.',
            }
        },
        required: ['text'],
    },
    execute: async (args: { text: string, tone?: string }, ctx?: Context) => {
        const maskedKey = config.elevenlabsApiKey ? config.elevenlabsApiKey.substring(0, 5) + '...' : 'MISSING';
        console.log(`[SpeakTool] Executing with key: ${maskedKey}`);

        if (!config.elevenlabsApiKey) {
            return 'Error: ElevenLabs API Key is missing in configuration.';
        }

        if (!ctx) {
            return 'Error: No Telegram context available to send audio.';
        }

        try {
            await ctx.replyWithChatAction('upload_voice');

            const response = await client.textToSpeech.convert(DEFAULT_VOICE_ID, {
                text: args.text,
                model_id: 'eleven_turbo_v2_5',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                }
            });

            // Save to temp file
            const fileName = `voice_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
            const filePath = path.join(process.cwd(), 'temp', fileName);

            // Ensure temp dir exists
            if (!fs.existsSync(path.join(process.cwd(), 'temp'))) {
                fs.mkdirSync(path.join(process.cwd(), 'temp'));
            }

            // Handle stream consumption robustly
            if ((response as any).pipe) {
                const fileStream = fs.createWriteStream(filePath);
                await new Promise<void>((resolve, reject) => {
                    (response as any).pipe(fileStream);
                    fileStream.on('finish', () => resolve());
                    fileStream.on('error', reject);
                });
            } else {
                // If it's a web stream (ReadableStream)
                const arrayBuffer = await (response as any).arrayBuffer();
                fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
            }

            // Send to Telegram
            await ctx.replyWithVoice(new InputFile(filePath));

            // Cleanup
            fs.unlinkSync(filePath);

            return `(Voice message sent containing: "${args.text}")`;

        } catch (error: any) {
            console.error('Error generating voice:', error);
            // Return error to LLM so it knows it failed
            return `Error generating voice message: ${error.message || error}`;
        }
    }
};
