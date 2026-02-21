import { db, sqlite } from '../db/index.js';
import { facts, conversations, summaries, entities, relationships, usage } from '../db/schema.js';
import { generateEmbedding, cosineSimilarity } from './embeddings.js';
import { eq, desc, and, lte, or } from 'drizzle-orm';
import { config } from '../config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getIndex } from './pinecone.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { MultimodalMessage, isMultimodal, getMediaHash } from '../agent/multimodal.js';

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export class MemoryManager {
    // 1. Log Conversation (Hybrid)
    async logMessage(role: 'user' | 'assistant' | 'system', content: string | MultimodalMessage, metadata?: any) {
        let textContent = '';
        if (typeof content === 'string') {
            textContent = content;
        } else if (isMultimodal(content)) {
            textContent = content.find(p => p.text)?.text || '[Media Attachment]';
            // Trigger background multimodal indexing
            this.indexMedia(content, role).catch(console.error);
        }

        if (!textContent || textContent.trim().length === 0) return;

        try {
            // A. Store in SQLite (Immediate Buffer)
            const result = await db.insert(conversations).values({
                role,
                content: encrypt(textContent),
                timestamp: Date.now(),
                metadata: metadata ? encrypt(JSON.stringify(metadata)) : null,
            }).returning({ id: conversations.id });
            const messageId = result[0].id;

            // B. Store in Pinecone (Async Long-Term)
            this.syncToPinecone(textContent, messageId, role, metadata).catch(console.error);

            // C. Extract Facts (Async Core Memory)
            if (textContent.split(' ').length > 3) {
                this.memorize(textContent, messageId).catch(console.error);
            }

            // D. Check for Summarization (Async)
            this.checkPruningTrigger().catch(console.error);

        } catch (error) {
            console.error('Failed to log message:', error);
        }
    }

    // INTERNAL: Check if we need to summarize
    private async checkPruningTrigger() {
        const unpruned = await db.select().from(conversations)
            .where(eq(conversations.isPruned, false));

        if (unpruned.length > 20) {
            console.log(`[Memory] Pruning trigger hit: ${unpruned.length} messages.`);
            await this.summarizeHistory(10);
        }
    }

    async summarizeHistory(count: number) {
        try {
            // 1. Get the oldest messages to prune
            const toPrune = await db.select().from(conversations)
                .where(eq(conversations.isPruned, false))
                .orderBy(conversations.timestamp)
                .limit(count);

            if (toPrune.length < 2) return;

            const lastId = toPrune[toPrune.length - 1].id;
            const historyText = toPrune.map((m: any) => `${m.role}: ${decrypt(m.content)}`).join('\n');

            // 2. Get previous summary
            const prevSummary = await this.getLatestSummary();
            const prevText = prevSummary ? `Previous Summary: ${decrypt(prevSummary.content)}\n\n` : '';

            // 3. Generate new summary
            const prompt = `You are a conversation compressor. 
Summarize the following conversation history into a concise but information-dense summary. 
Include key decisions, topics discussed, and project status.
If a previous summary exists, incorporate its key points into the NEW summary.

${prevText}
New Messages to compress:
${historyText}

Return ONLY the summary text. No preamble. Keep it under 250 words.`;

            const result = await model.generateContent(prompt);
            const newSummary = result.response.text().trim();

            // 4. Save to DB
            await db.insert(summaries).values({
                content: encrypt(newSummary),
                lastPrunedId: lastId,
                timestamp: Date.now()
            });

            // 5. Mark as pruned
            for (const msg of toPrune) {
                await db.update(conversations)
                    .set({ isPruned: true })
                    .where(eq(conversations.id, msg.id));
            }

            console.log(`[Memory] Successfully summarized ${toPrune.length} messages. New summary length: ${newSummary.length}`);

        } catch (error) {
            console.error('[Memory] Summarization failed:', error);
        }
    }

    async getLatestSummary() {
        const latest = await db.select().from(summaries)
            .orderBy(desc(summaries.timestamp))
            .limit(1);
        return latest[0] || null;
    }

    // INTERNAL: Sync to Pinecone
    async syncToPinecone(content: string, id: number, role: string, metadata?: any) {
        if (!content || content.trim().length === 0) return;

        const index = await getIndex();
        if (!index) return;

        try {
            const embedding = await generateEmbedding(content);
            if (!embedding || embedding.length === 0) return;

            // Pinecone SDK v3+ requires { records: [...] }
            await index.upsert({
                records: [{
                    id: `msg_${id}`,
                    values: embedding,
                    metadata: {
                        type: 'message',
                        role,
                        content,
                        timestamp: Date.now(),
                        ...metadata
                    }
                }]
            });
            // console.log(`[Memory] Synced to Pinecone: msg_${id}`);
        } catch (error) {
            console.error('[Memory] Pinecone sync failed:', error);
        }
    }

    // INTERNAL: Analyze and extract facts (SQLite)
    async memorize(content: string, sourceId: number) {
        try {
            const prompt = `Analyze the following message and extract any core, permanent facts that are worth remembering for the future.
            Focus on user preferences, biographical info, specific requests, or important context.
            Do not extract trivial conversational filler.
            
            Message: "${content}"
            
            Return ONLY a JSON array of strings. Example: ["User lives in Bali", "User prefers dark mode"].
            If nothing worth saving, return [].`;

            const result = await model.generateContent(prompt);
            const text = result.response.text();

            // Clean markdown json
            const jsonStr = text.replace(/```json|```/g, '').trim();
            const extractedFacts = JSON.parse(jsonStr);

            if (Array.isArray(extractedFacts)) {
                for (const fact of extractedFacts) {
                    await this.storeFact(fact, sourceId);
                }
            }

            // NEW: Knowledge Graph Extraction
            this.extractGraph(content, sourceId).catch(console.error);
        } catch (error) {
            // Silently fail or log debug
            // console.debug('Memorization skipped/failed:', error);
        }
    }

    // 2. Search Semantic Memory (Hybrid)
    async searchRelevantFacts(query: string, limit: number = 5): Promise<string[]> {
        const results: string[] = [];
        try {
            const queryEmbedding = await generateEmbedding(query);

            // A. Search Core Facts (SQLite - Streaming Search)
            interface ScoredFact { content: string; score: number; type: string; }
            const scoredFacts: ScoredFact[] = [];

            // Use lower-level iterate to avoid loading all facts into a giant array
            const stmt = sqlite.prepare("SELECT content, embedding, type FROM facts ORDER BY id DESC LIMIT 500");
            for (const fact of stmt.iterate() as IterableIterator<any>) {
                try {
                    const embedding = JSON.parse(fact.embedding) as number[];
                    const content = decrypt(fact.content);
                    const score = cosineSimilarity(queryEmbedding, embedding);

                    if (score > 0.65) {
                        scoredFacts.push({
                            content,
                            score,
                            type: fact.type
                        });
                    }
                } catch (e) {
                    continue;
                }
            }

            const topFacts = scoredFacts
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
                .map(f => {
                    const prefix = f.type === 'media_context' ? '[VISUAL MEMORY]' :
                        f.type === 'user_preference' ? '[PREFERENCE]' : '[FACT]';
                    return `${prefix} ${f.content}`;
                });
            results.push(...topFacts);

            // B. Search Long-Term History (Pinecone)
            const index = await getIndex();
            if (index) {
                const pineconeResult = await index.query({
                    vector: queryEmbedding,
                    topK: 5,
                    includeMetadata: true
                });

                const memories = pineconeResult.matches
                    .filter(m => m.score && m.score > 0.60)
                    .map(m => {
                        const meta = m.metadata as any;
                        if (meta.type === 'file_chunk') {
                            return `[FILE: ${meta.filePath}] ${meta.content}`;
                        }
                        return `[CHAT] ${meta.role}: ${meta.content}`;
                    });
                results.push(...memories);
            }

        } catch (error) {
            console.error('Failed to search memory:', error);
        }
        return results;
    }

    // 3. Store extracted fact (SQLite)
    async storeFact(content: string, sourceMessageId?: number, type: string = 'chat_fact', metadata?: any) {
        try {
            const embedding = await generateEmbedding(content);
            await db.insert(facts).values({
                content: encrypt(content),
                embedding: JSON.stringify(embedding),
                createdAt: Date.now(),
                sourceMessageId,
                type,
                metadata: metadata ? JSON.stringify(metadata) : null
            });
            console.log(`[Memory] Stored ${type}: "${content.substring(0, 50)}..."`);
        } catch (error) {
            console.error(`Failed to store ${type}:`, error);
        }
    }

    // 4. Get recent conversation history (SQLite)
    async consolidateFacts() {
        console.log('[Memory] Starting Fact Consolidation...');
        try {
            // 1. Fetch all raw facts
            const allFacts = await db.select().from(facts).where(eq(facts.type, 'chat_fact'));
            if (allFacts.length < 5) return; // Not enough to consolidate

            const factList = allFacts.map((f: any) => `[ID: ${f.id}] ${f.content}`).join('\n');

            // 2. LLM Analysis: Find duplicates or contradictions
            const prompt = `You are a Memory Specialist. Below is a list of extracted facts from a user's conversation.
Your goal is to find facts that are redundant, similar, or contradictory, and propose a consolidated list.

Input Facts:
${factList}

Rules:
1. Merge similar info (e.g., "User lives in Bali" and "User is based in Bali").
2. Retain the most detail.
3. Resolve contradictions (use the most recent if timestamp/logic suggests it).
4. Return ONLY a JSON array of objects: [{"mergeIds": [ID1, ID2], "newFact": "Consolidated Fact"}, {"deleteIds": [ID3], "reason": "redundant"}]
5. If no changes needed, return [].

Return ONLY the JSON.`;

            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const operations = JSON.parse(text.replace(/```json|```/g, '').trim());

            if (!Array.isArray(operations) || operations.length === 0) {
                console.log('[Memory] No consolidation operations suggested.');
                return;
            }

            // 3. Apply operations
            for (const op of operations) {
                if (op.mergeIds) {
                    // Create new consolidated fact
                    await this.storeFact(op.newFact);
                    // Delete old ones
                    for (const id of op.mergeIds) {
                        await db.delete(facts).where(eq(facts.id, id));
                    }
                } else if (op.deleteIds) {
                    for (const id of op.deleteIds) {
                        await db.delete(facts).where(eq(facts.id, id));
                    }
                }
            }
            console.log(`[Memory] Fact consolidation complete. Operations processed: ${operations.length}`);

        } catch (error) {
            console.error('[Memory] Fact consolidation failed:', error);
        }
    }

    async extractGraph(content: string, sourceId: number) {
        try {
            const prompt = `Analyze the following message and extract a structured Knowledge Graph.
Identify Entities (People, Projects, Places, Organizations, Tools) and their Relationships.

Message: "${content}"

Return ONLY a JSON object with this structure:
{
  "entities": [{"name": "Ray", "type": "Person", "description": "Client representative"}],
  "relationships": [{"subject": "Ray", "predicate": "works_at", "object": "741agency"}]
}

Valid Types: Person, Project, Place, Organization, Tool.
Valid Predicates: works_at, involved_in, uses, located_at, friend_of, part_of, owns.

If nothing found, return {"entities":[], "relationships":[]}.`;

            const result = await model.generateContent(prompt);
            const text = result.response.text();

            const jsonStr = text.replace(/```json|```/g, '').trim();
            const graph = JSON.parse(jsonStr);

            if (!graph.entities || !Array.isArray(graph.entities)) return;

            const entityIdMap: Record<string, number> = {};

            // 1. Process Entities
            for (const ent of graph.entities) {
                const existing = await db.select().from(entities)
                    .where(eq(entities.name, ent.name))
                    .limit(1);

                if (existing.length > 0) {
                    entityIdMap[ent.name] = existing[0].id;
                } else {
                    const inserted = await db.insert(entities).values({
                        name: ent.name,
                        type: ent.type,
                        description: ent.description || null,
                        createdAt: Date.now()
                    }).returning({ id: entities.id });
                    entityIdMap[ent.name] = inserted[0].id;
                    console.log(`[Memory] New Entity: ${ent.name} (${ent.type})`);
                }
            }

            // 2. Process Relationships
            if (graph.relationships && Array.isArray(graph.relationships)) {
                for (const rel of graph.relationships) {
                    const subId = entityIdMap[rel.subject];
                    const objId = entityIdMap[rel.object];

                    if (subId && objId) {
                        await db.insert(relationships).values({
                            subjectId: subId,
                            predicate: rel.predicate,
                            objectId: objId,
                            createdAt: Date.now()
                        });
                        console.log(`[Memory] New Link: ${rel.subject} --(${rel.predicate})--> ${rel.object}`);
                    }
                }
            }

        } catch (error) {
            // console.debug('Graph extraction failed:', error);
        }
    }

    // 4. Get recent conversation history (SQLite)
    async getRecentContext(limit: number = 10) {
        // ... (existing logic)
        const recent = await db.select().from(conversations)
            .where(eq(conversations.isPruned, false))
            .orderBy(desc(conversations.timestamp))
            .limit(limit);

        const history = recent.reverse().map((m: any) => ({
            ...m,
            content: decrypt(m.content)
        }));

        // B. Prepend latest summary if exists
        const summary = await this.getLatestSummary();
        if (summary) {
            return [
                { role: 'system', content: `[HISTORICAL CONTEXT SUMMARY]: ${decrypt(summary.content)}` },
                ...history
            ];
        }

        return history;
    }

    /**
     * Log LLM usage for cost and performance monitoring.
     */
    async logUsage(modelName: string, promptTokens: number, completionTokens: number, totalTokens: number) {
        try {
            // Rough cost estimation in USD per 1M tokens (Level 7 logic)
            // gpt-4o: $2.50 input / $10.00 output
            // gemini-1.5-flash: Free (within limits) or $0.075 / $0.30
            let cost = 0;
            if (modelName.includes('gpt-4o')) {
                cost = (promptTokens * 2.5 + completionTokens * 10) / 1000000;
            } else if (modelName.includes('claude')) {
                cost = (promptTokens * 3.0 + completionTokens * 15) / 1000000;
            } else if (modelName.includes('gemini')) {
                cost = (promptTokens * 0.075 + completionTokens * 0.3) / 1000000;
            }

            const pTokens = promptTokens || 0;
            const cTokens = completionTokens || 0;
            const tTokens = totalTokens || (pTokens + cTokens);

            await db.insert(usage).values({
                timestamp: Date.now(),
                model: modelName,
                promptTokens: pTokens,
                completionTokens: cTokens,
                totalTokens: tTokens,
                costUsd: cost.toFixed(6)
            });

            console.log(`[Usage] Logged ${tTokens} tokens for ${modelName} (~$${cost.toFixed(6)})`);
        } catch (error) {
            console.error('[Usage] Failed to log usage:', error);
        }
    }

    /**
     * Retrieves recent strategic lessons and user preferences.
     */
    async getStrategicLessons(): Promise<string[]> {
        try {
            const results = await db.select()
                .from(facts)
                .where(or(
                    eq(facts.type, 'strategic_lesson'),
                    eq(facts.type, 'user_preference')
                ))
                .orderBy(desc(facts.createdAt))
                .limit(10);

            return results.map((r: any) => decrypt(r.content));
        } catch (error) {
            console.error('[Memory] Failed to fetch lessons:', error);
            return [];
        }
    }

    /**
     * Workers: Multimodal Indexing
     * Uses the LLM to "see" media and index its description.
     */
    async indexMedia(message: MultimodalMessage, role: string) {
        for (const part of message) {
            if (!part.inlineData) continue;

            const hash = getMediaHash(part);
            if (!hash) continue;

            // Check deduplication
            const existing = await db.select().from(facts)
                .where(and(eq(facts.type, 'media_context'), eq(facts.metadata, JSON.stringify({ hash }))))
                .limit(1);

            if (existing.length > 0) {
                console.log(`[Memory] Media already indexed (hash: ${hash.substring(0, 8)}). Skipping.`);
                continue;
            }

            try {
                const prompt = `You are a Visual Intelligence agent. 
Analyze the provided media (${part.inlineData.mimeType}) and provide a detailed, information-dense description.
Focus on:
1. Entities: People, places, things.
2. Text: OCR any readable text.
3. Context: What is the purpose of this media? (e.g., "A receipt for coffee", "A system architecture diagram").

Return ONLY the description.`;

                // Use Gemini Vision
                const multimodalPayload = [
                    { text: prompt },
                    part
                ];
                const result = await model.generateContent(multimodalPayload as any);
                const description = result.response.text().trim();

                console.log(`[Memory] Indexed Media: "${description.substring(0, 50)}..."`);

                // Store as fact and in Pinecone
                await this.storeFact(description, undefined, 'media_context', { hash, mimeType: part.inlineData.mimeType });

                // Pinecone Sync
                const index = await getIndex();
                if (index) {
                    const embedding = await generateEmbedding(description);
                    await (index as any).upsert([{
                        id: `media_${hash}`,
                        values: embedding,
                        metadata: {
                            type: 'media_memory',
                            role,
                            content: description,
                            hash,
                            timestamp: Date.now()
                        }
                    }]);
                }

            } catch (error) {
                console.error('[Memory] Media indexing failed:', error);
            } finally {
                // EXPLICIT BUFFER CLEANUP: Zero out the buffer reference to help GC
                (part.inlineData as any).data = null;
            }
        }
    }
}

export const memoryManager = new MemoryManager();
