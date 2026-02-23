FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/maple-types ./packages/maple-types
COPY packages/maple-common ./packages/maple-common
COPY services/model-router ./services/model-router
RUN npm install --workspace=@maple/model-router
RUN npm run build --workspace=@maple/types && npm run build --workspace=@maple/common && npm run build --workspace=@maple/model-router

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/packages/maple-types/dist ./packages/maple-types/dist
COPY --from=builder /app/packages/maple-types/package.json ./packages/maple-types/
COPY --from=builder /app/packages/maple-common/dist ./packages/maple-common/dist
COPY --from=builder /app/packages/maple-common/package.json ./packages/maple-common/
COPY --from=builder /app/services/model-router/dist ./services/model-router/dist
COPY --from=builder /app/services/model-router/package.json ./services/model-router/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 9100
CMD ["node", "services/model-router/dist/main.js"]
