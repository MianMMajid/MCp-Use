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

# Recreate dist->src symlinks for workspace packages (.dockerignore strips dist/)
RUN for pkg in maple-common maple-persistence maple-security; do \
      ln -sfn src "backend/backendB-core-services/shared/packages/${pkg}/dist"; \
    done

# Install frontend runtime dependencies explicitly (root command aliases removed).
RUN npm --prefix frontend/frontendA-it-console/template-runtime ci \
    && npm --prefix frontend/frontendB-desktop-app/template-runtime ci \
    && npm --prefix frontend/frontendC-marketing-download-site/template-runtime ci
RUN npm run sync:runtime-assets
RUN npm run build
RUN npm --prefix frontend/frontendA-it-console/template-runtime run build \
    && npm --prefix frontend/frontendB-desktop-app/template-runtime run build \
    && npm --prefix frontend/frontendC-marketing-download-site/template-runtime run build

## ---- Production stage ----
FROM node:22-slim

WORKDIR /app

# Only install minimal runtime deps (no build tools in production)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-built OpenClaw CLI from build stage.
# Only copy the package dir — Docker COPY dereferences symlinks, which breaks
# the bin script's import.meta.url path resolution for dist/entry.(m)js.
COPY --from=build /usr/local/lib/node_modules/openclaw /usr/local/lib/node_modules/openclaw
RUN set -e; \
    BIN_ENTRY=$(node -p " \
      const p=JSON.parse(require('fs').readFileSync('/usr/local/lib/node_modules/openclaw/package.json','utf8')); \
      typeof p.bin==='string'?p.bin:(p.bin&&p.bin.openclaw)||''"); \
    if [ -n "$BIN_ENTRY" ]; then \
      ln -sf "/usr/local/lib/node_modules/openclaw/$BIN_ENTRY" /usr/local/bin/openclaw; \
    else \
      cd /usr/local/lib/node_modules/openclaw && npm link; \
    fi; \
    chmod +x /usr/local/bin/openclaw; \
    openclaw --version

# Copy pre-built native modules from build stage (avoids needing python3/make/g++ at runtime)
COPY --from=build --chown=1000:1000 /app/package.json ./package.json
COPY --from=build --chown=1000:1000 /app/package-lock.json ./package-lock.json
COPY --from=build --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=build --chown=1000:1000 /app/backend ./backend
COPY --from=build --chown=1000:1000 /app/frontend ./frontend
COPY --from=build --chown=1000:1000 /app/.mcp.json ./.mcp.json
COPY --from=build --chown=1000:1000 /app/README.md ./README.md

# Create non-root user (GID/UID 1000 may already exist in node:22-slim, so use -f to avoid errors)
RUN groupadd -f -g 1000 maple && (useradd -u 1000 -g 1000 -s /bin/sh -m maple 2>/dev/null || true)

ENV NODE_ENV=production
ENV MAPLE_ALLOW_NO_AUTH=false
ENV HOST=0.0.0.0
ENV HACKATHON_TOOLHUB_HOST=127.0.0.1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD node -e "fetch('https://localhost:3000/health',{method:'GET',headers:{}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER 1000:1000

CMD ["node", "backend/backendB-core-services/gateway-api/service/src/main.js"]
