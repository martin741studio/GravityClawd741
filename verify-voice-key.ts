import { ElevenLabsClient } from 'elevenlabs';
import { config } from './src/config.js';

async function main() {
    console.log('🔍 Testing ElevenLabs API Key...');

    // Masked key for safety
    const maskedKey = config.elevenlabsApiKey
        ? `${config.elevenlabsApiKey.substring(0, 5)}...`
        : 'UNDEFINED';
    console.log(`Key: ${maskedKey}`);

    if (!config.elevenlabsApiKey) {
        console.error('❌ Error: API Key is missing in .env');
        return;
    }

    const client = new ElevenLabsClient({ apiKey: config.elevenlabsApiKey });

    try {
        console.log('📡 Fetching voices...');
        const voices = await client.voices.getAll();
        console.log(`✅ Success! Found ${voices.voices.length} voices.`);

        if (voices.voices.length === 0) {
            console.error('❌ No voices found.');
            return;
        }

        const rachelId = '21m00Tcm4TlvDq8ikWAM';
        const models = ['eleven_turbo_v2_5', 'eleven_multilingual_v2', 'eleven_monolingual_v1'];

        for (const modelId of models) {
            try {
                console.log(`\n🔊 Attempting TTS generation with RACHEL (${rachelId}) and model: ${modelId}...`);
                const audioStream = await client.textToSpeech.convert(rachelId, {
                    text: 'Hello, testing rachel.',
                    model_id: modelId,
                });
                console.log(`✅ Success with Rachel and ${modelId}!`);
                return;
            } catch (modelError: any) {
                console.error(`❌ Failed with Rachel and ${modelId}: ${modelError.statusCode || modelError.message}`);
            }
        }

    } catch (error: any) {
        console.error('❌ Verification Failed:', error);
        if (error.statusCode === 401) {
            console.error('🚫 401 Unauthorized: Your API Key is likely invalid or expired.');
        }
    }
}

main().catch(console.error);
