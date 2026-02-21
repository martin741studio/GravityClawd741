import { Pinecone } from '@pinecone-database/pinecone';
import { config } from '../config.js';

let pinecone: Pinecone | null = null;

export async function getPineconeClient() {
    if (!config.pineconeApiKey) {
        console.warn('⚠️ PINECONE_API_KEY is missing. Semantic memory will be disabled.');
        return null;
    }

    if (!pinecone) {
        pinecone = new Pinecone({
            apiKey: config.pineconeApiKey,
        });
    }

    return pinecone;
}

export async function getIndex() {
    const client = await getPineconeClient();
    if (!client) return null;
    return client.index(config.pineconeIndex);
}
