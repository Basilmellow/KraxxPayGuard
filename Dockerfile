# syntax=docker/dockerfile:1
FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
ENV NODE_ENV=production HOST=0.0.0.0 PORT=80 MODEL_PROVIDER=astropods DATABASE_PATH=/data/payguard.sqlite
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
# Explicit copies keep private local files out even if ignore rules change.
COPY src/ ./src/
COPY public/ ./public/
COPY scripts/container-start.mjs ./scripts/container-start.mjs
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:80/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/container-start.mjs"]
