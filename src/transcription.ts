import Groq from 'groq-sdk';
import { config } from './config.js';
import * as fs from 'fs';

const groq = new Groq({
    apiKey: config.groqApiKey,
});

export async function transcribeAudio(filePath: string): Promise<string> {
    if (!config.groqApiKey || config.groqApiKey.startsWith('gsk_placeholder')) {
        throw new Error('Groq API Key is missing or invalid. Please update .env.');
    }

    try {
        const response = await groq.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: 'whisper-large-v3', // Updated to stable model
            response_format: 'json',
            language: 'en',
        });

        return response.text;
    } catch (error: any) {
        console.error('Error transcribing audio with Groq:', error);
        throw new Error(`Transcription failed: ${error.message || error}`);
    }
}
