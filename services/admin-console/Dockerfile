FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/maple-types ./packages/maple-types
COPY packages/maple-common ./packages/maple-common
COPY proto ./proto
COPY services/admin-console ./services/admin-console
RUN npm install --workspace=@maple/admin-console
RUN npm run build --workspace=@maple/types && npm run build --workspace=@maple/common && npm run build --workspace=@maple/admin-console

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/packages/maple-types/dist ./packages/maple-types/dist
COPY --from=builder /app/packages/maple-types/package.json ./packages/maple-types/
COPY --from=builder /app/packages/maple-common/dist ./packages/maple-common/dist
COPY --from=builder /app/packages/maple-common/package.json ./packages/maple-common/
COPY --from=builder /app/services/admin-console/dist ./services/admin-console/dist
COPY --from=builder /app/services/admin-console/public ./services/admin-console/public
COPY --from=builder /app/services/admin-console/package.json ./services/admin-console/
COPY --from=builder /app/proto ./proto
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 9443
CMD ["node", "services/admin-console/dist/main.js"]
