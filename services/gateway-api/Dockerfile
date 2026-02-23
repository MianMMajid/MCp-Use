FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/maple-types ./packages/maple-types
COPY packages/maple-common ./packages/maple-common
COPY packages/maple-persistence ./packages/maple-persistence
COPY packages/maple-security ./packages/maple-security
COPY packages/maple-risk-engine ./packages/maple-risk-engine
COPY proto ./proto
COPY services/gateway-api ./services/gateway-api
RUN npm install --workspace=@maple/gateway-api
RUN npm run build --workspace=@maple/types && npm run build --workspace=@maple/common && npm run build --workspace=@maple/persistence && npm run build --workspace=@maple/security && npm run build --workspace=@maple/risk-engine && npm run build --workspace=@maple/gateway-api

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/packages/maple-types/dist ./packages/maple-types/dist
COPY --from=builder /app/packages/maple-types/package.json ./packages/maple-types/
COPY --from=builder /app/packages/maple-common/dist ./packages/maple-common/dist
COPY --from=builder /app/packages/maple-common/package.json ./packages/maple-common/
COPY --from=builder /app/packages/maple-persistence/dist ./packages/maple-persistence/dist
COPY --from=builder /app/packages/maple-persistence/package.json ./packages/maple-persistence/
COPY --from=builder /app/packages/maple-security/dist ./packages/maple-security/dist
COPY --from=builder /app/packages/maple-security/package.json ./packages/maple-security/
COPY --from=builder /app/packages/maple-risk-engine/dist ./packages/maple-risk-engine/dist
COPY --from=builder /app/packages/maple-risk-engine/package.json ./packages/maple-risk-engine/
COPY --from=builder /app/services/gateway-api/dist ./services/gateway-api/dist
COPY --from=builder /app/services/gateway-api/package.json ./services/gateway-api/
COPY --from=builder /app/proto ./proto
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 8443
CMD ["node", "services/gateway-api/dist/main.js"]
