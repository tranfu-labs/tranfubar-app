FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4317 \
    STORE_BACKEND=sqlite \
    SQLITE_PATH=/data/usage.sqlite

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates sqlite3 tini \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data \
  && chown -R node:node /data

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev --package-lock=false; fi \
  && npm cache clean --force

COPY --chown=node:node . .

USER node

EXPOSE 4317
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 4317}/healthz`).then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["tini", "--", "node", "server/index.js"]
