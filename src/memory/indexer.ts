import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { db } from '../db/index.js';
import { facts } from '../db/schema.js';
import { generateEmbedding } from './embeddings.js';
import { getIndex } from './pinecone.js';

// Configuration
const WORKSPACE_ROOT = path.resolve(process.cwd(), '..'); // Scan the entire 741agency workspace
const IGNORE_PATTERNS = [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
    '**/.DS_Store',
    '**/package-lock.json',
    '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg', // Images
    'memory.db', 'memory.db-journal', // DB files
];

// Supported extensions
const EXTENSIONS = ['.ts', '.js', '.json', '.md', '.txt', '.html', '.css', '.php'];

async function main() {
    console.log('🔍 Scanning workspace...');

    const pineconeIndex = await getIndex();
    if (!pineconeIndex) {
        console.warn('⚠️ Pinecone not configured. Skipping cloud indexing.');
    } else {
        console.log('🌲 Pinecone connected.');
    }

    const files = await glob('**/*.*', {
        cwd: WORKSPACE_ROOT,
        ignore: IGNORE_PATTERNS,
        nodir: true,
    });

    const relevantFiles = files.filter((f: string) => EXTENSIONS.includes(path.extname(f)));
    console.log(`Found ${relevantFiles.length} relevant files. Processing in batches...`);

    // Process in small batches to avoid heap overflow
    const BATCH_SIZE = 5;
    for (let i = 0; i < relevantFiles.length; i += BATCH_SIZE) {
        const batch = relevantFiles.slice(i, i + BATCH_SIZE);
        console.log(`[Indexer] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(relevantFiles.length / BATCH_SIZE)}...`);
        await Promise.all(batch.map(file => processFile(file, pineconeIndex)));

        // Brief pause for GC to catch up
        if (global.gc) global.gc();
    }

    console.log('✅ Indexing complete!');
}

async function processFile(relativePath: string, index: any) {
    const filePath = path.join(WORKSPACE_ROOT, relativePath);
    console.log(`Processing: ${relativePath}`);

    try {
        let content = fs.readFileSync(filePath, 'utf-8');
        if (!content.trim()) return;

        // Special handling for HTML files: Strip tags to improve RAG quality
        if (path.extname(filePath) === '.html') {
            content = content
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style blocks
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script blocks
                .replace(/<[^>]+>/g, ' ') // Remove all tags
                .replace(/\s+/g, ' ') // Collapse whitespace
                .trim();
        }

        // Chunking Strategy (Simple paragraph/line based for now)
        // For code, we might want to split by functions, but simple chunking works surprisingly well for RAG.
        const chunks = splitIntoChunks(content, 1000); // 1000 chars ~ 250 tokens

        for (const [i, chunk] of chunks.entries()) {
            // Check if already indexed? (Optimization for later: calculate hash)
            // For now, simple insert.

            let embedding;
            try {
                if (!chunk.trim()) continue;
                embedding = await generateEmbedding(chunk);
            } catch (err) {
                console.error(`[Indexer] Error embedding chunk ${i} of ${relativePath}:`, err);
                continue;
            }

            if (!embedding || embedding.length === 0) {
                console.warn(`[Indexer] Warning: Empty embedding generated for chunk ${i} in ${relativePath}`);
                continue;
            }

            // 1. Store in SQLite (Legacy/Backup)
            await db.insert(facts).values({
                content: chunk,
                embedding: JSON.stringify(embedding),
                createdAt: Date.now(),
                type: 'file_chunk',
                metadata: JSON.stringify({
                    filePath: relativePath,
                    chunkIndex: i,
                    totalChunks: chunks.length
                }),
            });

            // 2. Store in Pinecone
            if (index) {
                try {
                    const upsertRequest = [
                        {
                            id: `file_${sanitizeId(relativePath)}_${i}`,
                            // Convert Float32Array to number[] for Pinecone compatibility
                            values: Array.from(embedding),
                            metadata: {
                                type: 'file_chunk',
                                filePath: relativePath,
                                content: chunk,
                                chunkIndex: i,
                                totalChunks: chunks.length
                            }
                        }
                    ];

                    await index.upsert({ records: upsertRequest });
                } catch (pineconeError) {
                    console.error(`[Indexer] Pinecone Upsert Failed for ${relativePath} chunk ${i}:`, pineconeError);
                    console.log('Failing Vector ID:', `file_${sanitizeId(relativePath)}_${i}`);
                }
            }
        }

    } catch (error) {
        console.error(`Error processing ${relativePath}:`, error);
    }
}

function sanitizeId(str: string) {
    return str.replace(/[^a-zA-Z0-9]/g, '_');
}

function splitIntoChunks(text: string, maxSize: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    const lines = text.split('\n');
    for (const line of lines) {
        if ((currentChunk + line).length > maxSize) {
            chunks.push(currentChunk);
            currentChunk = '';
        }
        currentChunk += line + '\n';
    }
    if (currentChunk.trim()) {
        chunks.push(currentChunk);
    }
    return chunks;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
