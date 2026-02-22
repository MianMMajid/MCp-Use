## ---- Build stage ----
FROM node:22-slim AS build

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install ALL deps (including devDependencies needed for build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

## ---- Production stage ----
FROM node:22-slim

WORKDIR /app

# Runtime native deps for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built output and runtime files from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/resources ./resources

# Keep index.ts so hackathon-start.sh uses mcp-use dev (serves custom routes).
# mcp-use start in v2.x only serves MCP protocol + health, not custom Hono routes.
COPY --from=build /app/index.ts ./index.ts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json

# Create data directory for SQLite volume mount
RUN mkdir -p /app/data

# Install tsx for dev mode TypeScript execution
RUN npm install tsx

# Railway injects PORT automatically
ENV NODE_ENV=production
ENV MAPLE_ALLOW_NO_AUTH=true
ENV HOST=0.0.0.0
ENV HACKATHON_TOOLHUB_HOST=127.0.0.1

EXPOSE 3000

CMD ["npm", "run", "start"]
