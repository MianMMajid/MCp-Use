FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/maple-types ./packages/maple-types
COPY packages/maple-common ./packages/maple-common
COPY services/secrets-broker ./services/secrets-broker
RUN npm install --workspace=@maple/secrets-broker
RUN npm run build --workspace=@maple/types && npm run build --workspace=@maple/common && npm run build --workspace=@maple/secrets-broker

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/packages/maple-types/dist ./packages/maple-types/dist
COPY --from=builder /app/packages/maple-types/package.json ./packages/maple-types/
COPY --from=builder /app/packages/maple-common/dist ./packages/maple-common/dist
COPY --from=builder /app/packages/maple-common/package.json ./packages/maple-common/
COPY --from=builder /app/services/secrets-broker/dist ./services/secrets-broker/dist
COPY --from=builder /app/services/secrets-broker/package.json ./services/secrets-broker/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 9300
CMD ["node", "services/secrets-broker/dist/main.js"]
