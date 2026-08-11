FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY . .
RUN npm run build \
    && npm prune --omit=dev

FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    PORT=8787 \
    CACHE_DB_PATH=/data/cache.sqlite \
    VNDB_MIN_INTERVAL_MS=2000

WORKDIR /app/apps/api

COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
COPY --from=build --chown=node:node /app/apps/web/dist /app/apps/web/dist

RUN mkdir -p /data \
    && chown node:node /data

USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/v1/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
