FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig*.json ./
COPY services/tool-runner ./services/tool-runner
COPY packages ./packages
COPY proto ./proto
RUN npm install --workspace=@maple/tool-runner
RUN npm run build --workspace=@maple/common
RUN npm run build --workspace=@maple/tool-runner

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/tool-runner/dist ./services/tool-runner/dist
COPY --from=builder /app/services/tool-runner/package.json ./services/tool-runner/
CMD ["node", "services/tool-runner/dist/main.js"]
