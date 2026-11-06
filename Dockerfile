FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:frontend

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
ENV CF_MONITOR_DB=/data/cf-monitor.sqlite
ENV ASSETS_DIR=/app/dist
COPY --from=build /app/dist ./dist
COPY src ./src
COPY public ./public
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "src/runtime/node-host.js"]
