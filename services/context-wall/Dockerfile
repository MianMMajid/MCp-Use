FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/maple-types ./packages/maple-types
COPY packages/maple-common ./packages/maple-common
COPY packages/maple-security ./packages/maple-security
COPY packages/maple-risk-engine ./packages/maple-risk-engine
COPY services/context-wall ./services/context-wall
RUN npm install --workspace=@maple/context-wall
RUN npm run build --workspace=@maple/types && npm run build --workspace=@maple/common && npm run build --workspace=@maple/security && npm run build --workspace=@maple/risk-engine && npm run build --workspace=@maple/context-wall

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/packages/maple-types/dist ./packages/maple-types/dist
COPY --from=builder /app/packages/maple-types/package.json ./packages/maple-types/
COPY --from=builder /app/packages/maple-common/dist ./packages/maple-common/dist
COPY --from=builder /app/packages/maple-common/package.json ./packages/maple-common/
COPY --from=builder /app/packages/maple-security/dist ./packages/maple-security/dist
COPY --from=builder /app/packages/maple-security/package.json ./packages/maple-security/
COPY --from=builder /app/packages/maple-risk-engine/dist ./packages/maple-risk-engine/dist
COPY --from=builder /app/packages/maple-risk-engine/package.json ./packages/maple-risk-engine/
COPY --from=builder /app/services/context-wall/dist ./services/context-wall/dist
COPY --from=builder /app/services/context-wall/package.json ./services/context-wall/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 9000
CMD ["node", "services/context-wall/dist/main.js"]
