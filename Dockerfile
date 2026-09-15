# LienStore — production image (Next.js 16 standalone output + embedded SQLite database).
#
# The image is self-contained: on first start the app creates /app/data/lienstore.db and imports the
# seed catalogue (120 products, categories, pages, posts). Mount /app/data as a volume so orders,
# customers and admin edits survive upgrades. No native modules: SQLite comes from Node's `node:sqlite`.
#
# Build:  docker build -t lienstore:local .
# Run:    docker run -p 3000:3000 -v lienstore-data:/app/data -e ADMIN_PASSWORD=... -e ADMIN_SESSION_SECRET=... lienstore:local
ARG NODE_VERSION=24-slim

# ---------- deps ----------
FROM node:${NODE_VERSION} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---------- build ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# `next build` renders sitemap.xml, which opens a throw-away SQLite DB seeded from data/seed.json.
RUN npm run build

# ---------- run ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
# node:sqlite still prints an "experimental" notice on Node 24; silence it.
ENV NODE_OPTIONS=--disable-warning=ExperimentalWarning
# SQLite database (persist via volume) and the seed catalogue shipped inside the image.
ENV LIEN_DB_PATH=/app/data/lienstore.db
ENV LIEN_SEED_PATH=/app/seed/seed.json
ENV LIEN_OS_DRUG_IMPORT_PATH=/app/seed/os-drug-import-2026-09-14.json
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/data/seed.json ./seed/seed.json
COPY --from=builder --chown=node:node /app/data/os-drug-import-2026-09-14.json ./seed/os-drug-import-2026-09-14.json
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
