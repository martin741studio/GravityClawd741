import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Tier 2: The Archive (Raw Logs)
export const conversations = sqliteTable('conversations', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    role: text('role').notNull(), // 'user' | 'assistant' | 'system'
    content: text('content').notNull(),
    timestamp: integer('timestamp').notNull(), // Unix timestamp
    metadata: text('metadata'), // JSON string for extra info
    isPruned: integer('is_pruned', { mode: 'boolean' }).default(false),
});

// Tier 3: The Knowledge Graph (Semantic Facts)
export const facts = sqliteTable('facts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    content: text('content').notNull(), // The extracted fact
    embedding: text('embedding').notNull(), // JSON string of vector number[]
    createdAt: integer('created_at').notNull(),
    sourceMessageId: integer('source_message_id').references(() => conversations.id),
    type: text('type').notNull().default('chat_fact'), // 'chat_fact' | 'file_chunk'
    metadata: text('metadata'), // JSON string for { filePath, ... }
});

// Tier 4: The Compressions (Historical Context Summaries)
export const summaries = sqliteTable('summaries', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    content: text('content').notNull(),
    lastPrunedId: integer('last_pruned_id').notNull(),
    timestamp: integer('timestamp').notNull(),
});

// Tier 5: The Knowledge Graph (Entities & Relationships)
export const entities = sqliteTable('entities', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'Person' | 'Project' | 'Place' | 'Organization' | 'Tool'
    description: text('description'),
    metadata: text('metadata'), // JSON string
    createdAt: integer('created_at').notNull(),
});

export const relationships = sqliteTable('relationships', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    subjectId: integer('subject_id').notNull().references(() => entities.id),
    predicate: text('predicate').notNull(), // 'works_at' | 'involved_in' | 'uses' | 'located_at' | 'friend_of'
    objectId: integer('object_id').notNull().references(() => entities.id),
    metadata: text('metadata'), // JSON string
    createdAt: integer('created_at').notNull(),
});

export const usage = sqliteTable('usage', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    model: text('model').notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    totalTokens: integer('total_tokens').notNull(),
    costUsd: text('cost_usd'),
    timestamp: integer('timestamp').notNull(),
});

export const workflows = sqliteTable('workflows', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    status: text('status').notNull(), // 'planned', 'active', 'completed', 'failed', 'blocked'
    plan: text('plan'), // JSON string of steps
    currentStep: integer('current_step').default(0),
    result: text('result'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
});
