#!/bin/bash
set -e

# Binary path check (Ensure node modules are available for push)
if [ ! -d "node_modules" ]; then
    echo "[BOOT] Error: node_modules not found in production stage."
    exit 1
fi

# Push Schema to Database
echo "[BOOT] Synchronizing database schema..."
npm run db:push -- --force

# Start
echo "[BOOT] Starting Gravity Claw..."
node dist/main.js
