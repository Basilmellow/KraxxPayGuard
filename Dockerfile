# syntax=docker/dockerfile:1
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && mkdir -p node_modules

# Runtime excludes npm/Yarn and their dependency trees; only Node and runtime libs.
FROM alpine:3.24.2@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
RUN apk upgrade --no-cache && apk add --no-cache libstdc++ ca-certificates \
    && addgroup -g 1000 node && adduser -D -u 1000 -G node node \
    && mkdir /data && chown node:node /data
COPY --from=dependencies /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=80 MODEL_PROVIDER=astropods DATABASE_PATH=/data/payguard.sqlite
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
# Explicit copies keep private local files out even if ignore rules change.
COPY src/ ./src/
COPY public/ ./public/
COPY scripts/container-start.mjs ./scripts/container-start.mjs
USER node
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:80/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/container-start.mjs"]
