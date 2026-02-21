import { Pinecone } from '@pinecone-database/pinecone';
import { config } from './src/config.js';

async function main() {
    console.log(`🌲 Connecting to Pinecone with configured index: ${config.pineconeIndex}`);

    const pc = new Pinecone({ apiKey: config.pineconeApiKey });
    const index = pc.index(config.pineconeIndex);

    try {
        const stats = await index.describeIndexStats();
        console.log('\n📊 Index Stats:');
        console.log(`Index Name: ${config.pineconeIndex}`);
        console.log(`Total Record Count: ${stats.totalRecordCount}`);
        console.log(`Namespaces:`, stats.namespaces);

        if (stats.totalRecordCount === 0) {
            console.log('\n⚠️ Index is empty!');
        } else {
            console.log('\n✅ Index contains data.');
        }

    } catch (error) {
        console.error('❌ Error fetching stats:', error);
    }
}

main();
