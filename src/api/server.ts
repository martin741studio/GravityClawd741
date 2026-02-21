import express from 'express';
import * as path from 'path';
import { db } from '../db/index.js';
import { workflows, usage } from '../db/schema.js';
import { desc } from 'drizzle-orm';

export class LiveCanvasServer {
    private app = express();
    private port = process.env.PORT || 3000;

    constructor() {
        this.setupRoutes();
        this.setupStatic();
    }

    private setupRoutes() {
        // API Status
        this.app.get('/api/status', async (req, res) => {
            try {
                const activeWorkflows = await db.select().from(workflows).orderBy(desc(workflows.updatedAt)).limit(5);
                const recentUsage = await db.select().from(usage).orderBy(desc(usage.timestamp)).limit(10);

                res.json({
                    uptime: process.uptime(),
                    status: 'online',
                    workflows: activeWorkflows,
                    usage: recentUsage
                });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // Health check
        this.app.get('/health', (req, res) => {
            res.send('Gravity Claw is healthy.');
        });
    }

    private setupStatic() {
        const publicPath = path.resolve(process.cwd(), 'public');
        this.app.use(express.static(publicPath));

        // Serve index.html for any other route
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(publicPath, 'index.html'));
        });
    }

    public start() {
        this.app.listen(this.port, () => {
            console.log(`[Canvas] Live Dashboard active at http://localhost:${this.port}`);
        });
    }
}

export const canvasServer = new LiveCanvasServer();
