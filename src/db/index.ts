import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';
import * as path from 'path';
import * as fs from 'fs';

// Force absolute path for Cloud, local relative for development
const isCloud = !!process.env.RAILWAY_ENVIRONMENT_NAME || !!process.env.RAILWAY_STATIC_URL;
const defaultPath = isCloud ? '/data/memory.db' : 'data/memory.db';
const dbPath = process.env.DB_PATH || defaultPath;
const dbDir = path.dirname(dbPath);

let isInitialized = false;

console.log(`[DB] Final Shield v1.1.3: Targeting ${dbPath} (Cloud: ${isCloud})`);

// 1. Ensure Directory exists
try {
    if (!fs.existsSync(dbDir)) {
        console.log(`[DB] Creating directory: ${dbDir}`);
        fs.mkdirSync(dbDir, { recursive: true });
    }
} catch (error: any) {
    console.error(`[DB] FATAL: FAILED TO CREATE DIRECTORY ${dbDir}:`, error.message);
    process.exit(1);
}

// 2. Open Connection
let sqlite: Database.Database;
try {
    sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = DELETE'); // Switch from WAL for cloud volume stability
    console.log('[DB] Connection established.');
} catch (error: any) {
    console.error('[DB] FATAL: FAILED TO OPEN DATABASE:', error.message);
    process.exit(1);
}

// 3. Forced Schema Initialization (Fatal on error)
export async function initializeDatabase() {
    if (isInitialized) return;

    const tables = [
        `CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            metadata TEXT,
            is_pruned INTEGER DEFAULT 0
        );`,
        `CREATE TABLE IF NOT EXISTS facts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            embedding TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            source_message_id INTEGER,
            type TEXT NOT NULL DEFAULT 'chat_fact',
            metadata TEXT,
            FOREIGN KEY (source_message_id) REFERENCES conversations(id)
        );`,
        `CREATE TABLE IF NOT EXISTS summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            last_pruned_id INTEGER NOT NULL,
            timestamp INTEGER NOT NULL
        );`,
        `CREATE TABLE IF NOT EXISTS usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model TEXT NOT NULL,
            prompt_tokens INTEGER NOT NULL,
            completion_tokens INTEGER NOT NULL,
            total_tokens INTEGER NOT NULL,
            cost_usd TEXT,
            timestamp INTEGER NOT NULL
        );`,
        `CREATE TABLE IF NOT EXISTS workflows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            status TEXT NOT NULL,
            plan TEXT,
            current_step INTEGER DEFAULT 0,
            result TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );`,
        `CREATE TABLE IF NOT EXISTS entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            metadata TEXT,
            created_at INTEGER NOT NULL
        );`,
        `CREATE TABLE IF NOT EXISTS relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER NOT NULL,
            predicate TEXT NOT NULL,
            object_id INTEGER NOT NULL,
            metadata TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (subject_id) REFERENCES entities(id),
            FOREIGN KEY (object_id) REFERENCES entities(id)
        );`,
        `CREATE TABLE IF NOT EXISTS _health_check (id INTEGER PRIMARY KEY, ts INTEGER);`
    ];

    console.log('[DB] Enforcing schema shield...');
    for (const sql of tables) {
        try {
            sqlite.exec(sql);
        } catch (error: any) {
            console.error(`[DB] FATAL: Schema Error: ${sql.substring(0, 30)}...`, error.message);
            process.exit(1);
        }
    }

    try {
        const tableExists = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'").get();
        if (tableExists) {
            console.log('[DB] Verified: Table [conversations] is ready.');
            sqlite.exec(`INSERT INTO _health_check (ts) VALUES (${Date.now()});`);
            isInitialized = true;
        } else {
            console.error('[DB] FATAL: Table [conversations] failed to build.');
            process.exit(1);
        }
    } catch (error: any) {
        console.error('[DB] FATAL: Post-init verification failed:', error.message);
        process.exit(1);
    }
}

// Auto-init on first load for safety
initializeDatabase().catch(err => {
    console.error('[DB] AUTO-INIT FAILED:', err);
    process.exit(1);
});

export { sqlite };
export const db = drizzle(sqlite, { schema });
