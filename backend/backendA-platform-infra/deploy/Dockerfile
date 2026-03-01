## ---- Build stage ----
FROM node:22-slim AS build

WORKDIR /app

ARG OPENCLAW_VERSION=2026.2.21-2

# Install build dependencies for native modules (better-sqlite3, @discordjs/opus)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates python3 make g++ git \
    && rm -rf /var/lib/apt/lists/*

# Install OpenClaw CLI in the build stage (needs native build tools)
RUN git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/" \
    && git config --global --add url."https://github.com/".insteadOf "git@github.com:" \
    && npm install -g "openclaw@${OPENCLAW_VERSION}" \
    && openclaw --version

# Install ALL deps (including devDependencies needed for build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run template:install
RUN npm run sync:runtime-assets
RUN npm run build
RUN npm run build:frontendA && npm run build:frontendB && npm run build:frontendC

## ---- Production stage ----
FROM node:22-slim

WORKDIR /app

# Only install minimal runtime deps (no build tools in production)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-built OpenClaw CLI from build stage (avoids needing python3/make/g++)
COPY --from=build /usr/local/lib/node_modules/openclaw /usr/local/lib/node_modules/openclaw
COPY --from=build /usr/local/bin/openclaw /usr/local/bin/openclaw

# Copy pre-built native modules from build stage (avoids needing python3/make/g++ at runtime)
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend ./backend
COPY --from=build /app/frontend ./frontend
COPY --from=build /app/.mcp.json ./.mcp.json
COPY --from=build /app/README.md ./README.md

# Create non-root user (GID/UID 1000 may already exist in node:22-slim, so use -f to avoid errors)
RUN groupadd -f -g 1000 maple && (useradd -u 1000 -g 1000 -s /bin/sh -m maple 2>/dev/null || true) \
    && chown -R 1000:1000 /app

ENV NODE_ENV=production
ENV MAPLE_ALLOW_NO_AUTH=false
ENV HOST=0.0.0.0
ENV HACKATHON_TOOLHUB_HOST=127.0.0.1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD node -e "fetch('https://localhost:3000/health',{method:'GET',headers:{}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER 1000:1000

CMD ["node", "backend/backendB-core-services/gateway-api/service/src/main.js"]
