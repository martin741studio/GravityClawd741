import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const dbPath = process.env.DB_PATH || 'data/memory.db';
const dbDir = path.dirname(dbPath);

console.log(`[Migrator] Preparing database at: ${dbPath}`);

if (!fs.existsSync(dbDir)) {
    console.log(`[Migrator] Creating directory: ${dbDir}`);
    fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);

try {
    console.log('[Migrator] Running schema initialization...');
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            metadata TEXT,
            is_pruned INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS facts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            embedding TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            source_message_id INTEGER,
            type TEXT NOT NULL DEFAULT 'chat_fact',
            metadata TEXT,
            FOREIGN KEY (source_message_id) REFERENCES conversations(id)
        );
        CREATE TABLE IF NOT EXISTS summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            last_pruned_id INTEGER NOT NULL,
            timestamp INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model TEXT NOT NULL,
            prompt_tokens INTEGER NOT NULL,
            completion_tokens INTEGER NOT NULL,
            total_tokens INTEGER NOT NULL,
            cost_usd TEXT,
            timestamp INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workflows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            status TEXT NOT NULL,
            plan TEXT,
            current_step INTEGER DEFAULT 0,
            result TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            metadata TEXT,
            createdAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER NOT NULL,
            predicate TEXT NOT NULL,
            object_id INTEGER NOT NULL,
            metadata TEXT,
            createdAt INTEGER NOT NULL,
            FOREIGN KEY (subject_id) REFERENCES entities(id),
            FOREIGN KEY (object_id) REFERENCES entities(id)
        );
        CREATE TABLE IF NOT EXISTS _health_check (
            id INTEGER PRIMARY KEY,
            ts INTEGER
        );
    `);

    // Write-test
    sqlite.exec(`INSERT INTO _health_check (ts) VALUES (${Date.now()});`);
    console.log('[Migrator] Schema initialized and DB is WRITABLE.');
    sqlite.close();
    process.exit(0);
} catch (error) {
    console.error('[Migrator] CRITICAL ERROR during migration:', error);
    process.exit(1);
}
