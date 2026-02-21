import { ElevenLabsClient } from 'elevenlabs';
import { config } from '../config.js';
import * as fs from 'fs';
import * as path from 'path';
import { Tool } from './registry.js';
import { Context, InputFile } from 'grammy';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
        const maskedKey = config.elevenlabsApiKey ? `${config.elevenlabsApiKey.substring(0, 5)}...${config.elevenlabsApiKey.substring(config.elevenlabsApiKey.length - 4)}` : 'MISSING';
        console.log(`[SpeakTool] Executing with key (Len: ${config.elevenlabsApiKey?.length}): ${maskedKey}`);

        if (!config.elevenlabsApiKey || config.elevenlabsApiKey.length < 10) {
            return 'Error: ElevenLabs API Key is missing or invalid in configuration.';
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
            // CRITICAL: Telegram "Voice Notes" must be OGG/OPUS. 
            // We use ffmpeg to convert from ElevenLabs MP3.
            const oggPath = filePath.replace('.mp3', '.ogg');

            try {
                console.log(`[SpeakTool] Converting ${filePath} to ${oggPath}...`);
                await execAsync(`ffmpeg -i "${filePath}" -c:a libopus "${oggPath}"`);
                console.log(`[SpeakTool] Conversion successful.`);
            } catch (convError: any) {
                console.error('[SpeakTool] ffmpeg conversion failed:', convError);
                throw new Error(`Audio conversion failed. Ensure ffmpeg is installed on the server.`);
            }

            await ctx.replyWithVoice(new InputFile(oggPath));

            // Cleanup
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            if (fs.existsSync(oggPath)) fs.unlinkSync(oggPath);

            return `(Voice message sent containing: "${args.text}")`;

        } catch (error: any) {
            console.error('[SpeakTool] ERROR:', error);
            // Return detailed error to LLM so it can inform the user or fallback to text
            const errorMsg = error.message || String(error);
            return `Error generating voice message: ${errorMsg}. Please fallback to text and inform the user of the technical issue.`;
        }
    }
};
