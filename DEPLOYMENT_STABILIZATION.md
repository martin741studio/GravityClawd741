# Gravity Claw: Deployment Guide (Railway + GitHub)

To get Gravity Claw running 24/7 as a high-agency proactive swarm, follow these steps.

## 1. Push Code to GitHub
Ensure you use a **Private** repository to protect your source code and architecture.

1. **Check Git Status**:
   ```bash
   git init
   git add .
   git commit -m "feat: Gravity Claw Level 18 - Proactive Swarm"
   ```
2. **Connect Remote**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/GravityClaw.git
   git branch -M main
   git push -u origin main
   ```
   > [!WARNING]
   > Verify that your `.env` file is NOT in the git staging area. Check `git status` before committing.

## 2. Setup Railway Project
Railway is the recommended engine for 24/7 execution.

1. **Create Project**: Go to [Railway.app](https://railway.app), click "New Project", and select "Deploy from GitHub repo".
2. **Select Repo**: Choose your `GravityClaw` repository.
3. **Docker Detection**: Railway will find the `Dockerfile` and start the build automatically.

## 3. Configure Persistent Storage (CRITICAL)
Because Gravity Claw uses SQLite for its "Eternal Memory," you must mount a persistent volume.

1. In the Railway dashboard, go to your service settings.
2. Click **Volumes** -> **Add Volume**.
3. Set the **Mount Path** to: `/data`
4. This ensures your `memory.db` and any persistent files are not lost when the bot redeploys.

## 4. Set Environment Variables 🔑
Copy every key from your `.env` file into the Railway **Variables** tab. I've prepared the list for you below based on your current settings:

### CopyThese to Railway:
- `TELEGRAM_BOT_TOKEN`: `[YOUR_TELEGRAM_BOT_TOKEN]`
- `ALLOWED_USER_ID`: `[YOUR_USER_ID]`
- `GEMINI_API_KEY`: `[YOUR_GEMINI_API_KEY]`
- `PINECONE_API_KEY`: `[YOUR_PINECONE_API_KEY]`
- `PINECONE_INDEX`: `gravity-claw-large`
- `OPENAI_API_KEY`: `[YOUR_OPENAI_API_KEY]`
- `BRAVE_SEARCH_API_KEY`: `[YOUR_BRAVE_SEARCH_API_KEY]`
- `ELEVENLABS_API_KEY`: `[YOUR_ELEVENLABS_API_KEY]`
- `GROQ_API_KEY`: `[YOUR_GROQ_API_KEY]`
- `DB_PATH`: `/data/memory.db`
- `ENCRYPTION_KEY`: `[YOUR_ENCRYPTION_KEY]`

## 5. Architecture Promises
- **24/7 Swarm**: Once deployed, the `SchedulerManager` will run background jobs every hour (Workspace Monitor, Health Checks, etc.).
- **Proactive Notifications**: Any autonomous findings will be sent directly to your Telegram thread.
- **Eternal Memory**: Pinecone + SQLite (in the `/data` volume) will keep all historic context searchable.

---
The swarm is now ready to scale.

## 6. Cloud Stabilization & Troubleshooting
If you encounter "No such table" errors or build crashes, these are the proven stabilization patterns implemented in **Version 1.1.1 (Final Shield)**.

### The "No Such Table" Root Cause
This error occurs when the bot's application logic attempts to query the database before the SQLite schema is initialized on the fresh Railway persistent volume.

### The Multi-Layered Solution
1. **Runtime Schema Sync**: The `start.sh` script is configured to execute `npm run db:push -- --force` *inside* the cloud container before the bot starts. This ensures the volume is always in sync with your code.
2. **The "Status Shield" Bypass**: If the database is still initializing, a normal `/status` command might crash. We moved the status handler into the core `Agent.run` method to intercept the command and return a hard-coded diagnostic report without hitting the database.
3. **Fatal Initialization**: The `initializeDatabase` function in `src/db/index.ts` is now fatal. If verification fails, the process exits. This forces Railway to restart the container and re-attempt the `start.sh` sync.
4. **Repository Detoxification**: **CRITICAL**. Never push local `node_modules` to GitHub. It causes binary architecture clashes between your MacBook (ARM/Intel) and the Railway Linux environment. ensure your `.gitignore` is active and purge any accidental node_modules from git history.
5. **Dockerfile Final-Stage Bridge**: In multi-stage Docker builds, the final `runner` stage must explicitly `COPY` the `start.sh` script, `drizzle.config.ts`, and the `src/db` directory to allow runtime migrations.
6. **Cloud-Native Secrets**: Production scripts (`start.sh`) must not require a `.env` file. Railway injects variables directly into the process memory. removing the `.env` check prevents boot-loop crashes.

### Deployment Checklist for New Repos
- [ ] Set `DB_PATH` to `/data/memory.db`.
- [ ] Mount a Railway Volume to `/data`.
- [ ] Use a multi-stage `Dockerfile` with the `start.sh` entry point.
- [ ] Ensure the Agent Core has the Status Shield middleware.
