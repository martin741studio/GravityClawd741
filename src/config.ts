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

// Resilient fallback for provider keys
const getProviderKey = (primary: string, fallbacks: string[]): string | undefined => {
    if (process.env[primary]) return process.env[primary];
    for (const fallback of fallbacks) {
        if (process.env[fallback]) {
            console.log(`[Config] Using fallback env var for ${primary}: ${fallback}`);
            return process.env[fallback];
        }
    }
    return undefined;
};

export const config: Config = {
    telegramBotToken: getEnv('TELEGRAM_BOT_TOKEN'),
    geminiApiKey: getEnv('GEMINI_API_KEY'),
    allowedUserId: parseInt(getEnv('ALLOWED_USER_ID'), 10),
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
    groqApiKey: process.env.GROQ_API_KEY || '',
    openrouterApiKey: getProviderKey('OPENROUTER_API_KEY', ['OPENROUTER_KEY', 'OR_API_KEY', 'OPENROUTER_TOKEN']),
    openaiApiKey: getProviderKey('OPENAI_API_KEY', ['OPENAI_KEY', 'OA_API_KEY', 'OPENAI_TOKEN']),
    pineconeApiKey: process.env.PINECONE_API_KEY || '',
    pineconeIndex: process.env.PINECONE_INDEX || 'gravity-claw',
    braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY || '',
    encryptionKey: process.env.ENCRYPTION_KEY || '',
};

console.log(`[Config] Provider Check:`);
console.log(`- Gemini: ENABLED`);
console.log(`- OpenAI: ${config.openaiApiKey ? 'ENABLED' : 'MISSING'}`);
console.log(`- OpenRouter: ${config.openrouterApiKey ? 'ENABLED' : 'MISSING'}`);
console.log(`- ElevenLabs: ${config.elevenlabsApiKey ? 'ENABLED' : 'MISSING'}`);

if (isNaN(config.allowedUserId)) {
    throw new Error('ALLOWED_USER_ID must be a number');
}
