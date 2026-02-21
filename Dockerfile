## ---- Build stage ----
FROM node:20-slim AS build

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
FROM node:20-slim

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

# Create data directory for SQLite volume mount
RUN mkdir -p /app/data

# Railway injects PORT automatically
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV HACKATHON_TOOLHUB_HOST=127.0.0.1

EXPOSE 3000

CMD ["npm", "run", "start"]
