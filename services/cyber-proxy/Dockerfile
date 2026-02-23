FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/maple-types ./packages/maple-types
COPY packages/maple-common ./packages/maple-common
COPY services/cyber-proxy ./services/cyber-proxy
RUN npm install --workspace=@maple/cyber-proxy
RUN npm run build --workspace=@maple/types && npm run build --workspace=@maple/common && npm run build --workspace=@maple/cyber-proxy

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/packages/maple-types/dist ./packages/maple-types/dist
COPY --from=builder /app/packages/maple-types/package.json ./packages/maple-types/
COPY --from=builder /app/packages/maple-common/dist ./packages/maple-common/dist
COPY --from=builder /app/packages/maple-common/package.json ./packages/maple-common/
COPY --from=builder /app/services/cyber-proxy/dist ./services/cyber-proxy/dist
COPY --from=builder /app/services/cyber-proxy/package.json ./services/cyber-proxy/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "services/cyber-proxy/dist/main.js"]
