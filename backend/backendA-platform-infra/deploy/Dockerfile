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
RUN npm run sync:runtime-assets
RUN npm run build

## ---- Production stage ----
FROM node:22-slim

WORKDIR /app

# Runtime native deps for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy runtime dependencies and source from build stage
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend ./backend
COPY --from=build /app/frontend ./frontend
COPY --from=build /app/.mcp.json ./.mcp.json
COPY --from=build /app/README.md ./README.md

# Create backend data directory for SQLite volume mount
RUN mkdir -p /app/backend/backendB-core-services/maple-monolith/data

# Railway injects PORT automatically
ENV NODE_ENV=production
ENV MAPLE_ALLOW_NO_AUTH=true
ENV HOST=0.0.0.0
ENV HACKATHON_TOOLHUB_HOST=127.0.0.1
ENV MAPLE_DB_PATH=/app/backend/backendB-core-services/maple-monolith/data/maple.db

EXPOSE 3000

CMD ["bash", "backend/backendA-platform-infra/scripts/hackathon-start.sh"]
