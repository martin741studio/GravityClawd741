import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './src/config.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
    console.log('--- DEBUGGING CONFIGURATION ---');

    // Check Keys (Masked)
    const checkKey = (name: string, val?: string) => {
        if (!val) return console.log(`❌ ${name}: MISSING`);
        const visible = val.slice(0, 5) + '...' + val.slice(-4);
        console.log(`✅ ${name}: Found (${val.length} chars) -> ${visible}`);
        if (val.trim() !== val) console.log(`   ⚠️ WARNING: ${name} has leading/trailing whitespace!`);
    };

    checkKey('GEMINI_API_KEY', config.geminiApiKey);
    checkKey('ELEVENLABS_API_KEY', config.elevenlabsApiKey);
    checkKey('GROQ_API_KEY', config.groqApiKey);

    // Check Gemini Models
    console.log('\n--- CHECKING GEMINI MODELS ---');
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    try {
        // Not all SDK versions expose listModels, but let's try or use a known one.
        // Actually, for embedding failures (404), it's usually the model name.
        console.log('Testing Embedding Model: text-embedding-004');
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        await model.embedContent("test");
        console.log('✅ text-embedding-004: WORKING');
    } catch (e: any) {
        console.log(`❌ text-embedding-004: FAILED (${e.message})`);

        console.log('Testing Alternative: models/embedding-001');
        try {
            const model2 = genAI.getGenerativeModel({ model: "models/embedding-001" });
            await model2.embedContent("test");
            console.log('✅ models/embedding-001: WORKING');
        } catch (e2: any) {
            console.log(`❌ models/embedding-001: FAILED (${e2.message})`);
        }
    }
}

check().catch(console.error);
