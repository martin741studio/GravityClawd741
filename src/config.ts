import dotenv from 'dotenv';

// Start with simple checks to avoid extra dependencies for now, as requested "lean".

dotenv.config({ override: true });

export interface Config {
    telegramBotToken: string;
    geminiApiKey: string;
    allowedUserId: number;
    elevenlabsApiKey: string;
    groqApiKey: string;
    openrouterApiKey?: string;
    openaiApiKey?: string;
    pineconeApiKey: string;
    pineconeIndex: string;
    braveSearchApiKey?: string;
    encryptionKey: string;
}

const getEnv = (key: string): string => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return value;
};

export const config: Config = {
    telegramBotToken: getEnv('TELEGRAM_BOT_TOKEN'),
    geminiApiKey: getEnv('GEMINI_API_KEY'),
    allowedUserId: parseInt(getEnv('ALLOWED_USER_ID'), 10),
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
    groqApiKey: process.env.GROQ_API_KEY || '',
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    pineconeApiKey: process.env.PINECONE_API_KEY || '',
    pineconeIndex: process.env.PINECONE_INDEX || 'gravity-claw',
    braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY || '',
    encryptionKey: process.env.ENCRYPTION_KEY || '',
};

console.log(`[Config] Loaded ElevenLabs Key: ${config.elevenlabsApiKey ? config.elevenlabsApiKey.substring(0, 5) + '...' : 'MISSING'}`);

if (isNaN(config.allowedUserId)) {
    throw new Error('ALLOWED_USER_ID must be a number');
}
