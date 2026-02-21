# Build stage
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Run stage
FROM node:20-slim

WORKDIR /app

# Install ffmpeg for audio conversion
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Install production dependencies only if needed
# or just copy node_modules from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/start.sh ./start.sh
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/db ./src/db

# Create data directory for SQLite
RUN mkdir -p /data

# Default environment variables
ENV NODE_ENV=production
ENV DB_PATH=/data/memory.db

# Expose port (if any, though it's a bot)
# EXPOSE 3000

# Ensure start script is executable
RUN chmod +x ./start.sh

CMD ["./start.sh"]
