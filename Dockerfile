FROM node:20-slim

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Build the MCP server
RUN npm run build

# Create data directory for SQLite volume mount
RUN mkdir -p /app/data

# Railway injects PORT automatically
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV HACKATHON_TOOLHUB_HOST=127.0.0.1

EXPOSE 3000

CMD ["npm", "run", "start"]
