FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/maple-types ./packages/maple-types
COPY packages/maple-common ./packages/maple-common
COPY packages/maple-persistence ./packages/maple-persistence
COPY services/audit-writer ./services/audit-writer
RUN npm install --workspace=@maple/audit-writer
RUN npm run build --workspace=@maple/types
RUN npm run build --workspace=@maple/common
RUN npm run build --workspace=@maple/persistence
RUN npm run build --workspace=@maple/audit-writer

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/packages/maple-types/dist ./packages/maple-types/dist
COPY --from=builder /app/packages/maple-types/package.json ./packages/maple-types/
COPY --from=builder /app/packages/maple-common/dist ./packages/maple-common/dist
COPY --from=builder /app/packages/maple-common/package.json ./packages/maple-common/
COPY --from=builder /app/packages/maple-persistence/dist ./packages/maple-persistence/dist
COPY --from=builder /app/packages/maple-persistence/package.json ./packages/maple-persistence/
COPY --from=builder /app/services/audit-writer/dist ./services/audit-writer/dist
COPY --from=builder /app/services/audit-writer/package.json ./services/audit-writer/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 9400
CMD ["node", "services/audit-writer/dist/main.js"]
