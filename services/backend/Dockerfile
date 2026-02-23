FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/resources ./resources
COPY --from=build /app/index.ts ./index.ts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
RUN npm install tsx

ENV NODE_ENV=production
ENV MAPLE_ENABLE_JUDGE_UI=false
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["npm", "run", "start"]
