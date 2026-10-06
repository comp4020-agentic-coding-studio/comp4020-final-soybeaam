# syntax = docker/dockerfile:1

# Node + Fastify, SQLite via the built-in node:sqlite (no native build step,
# keeps the image small enough for the 256 MB machine). See PROCESS.md for
# the stack decision record. Serves HTTP on 0.0.0.0:$PORT (fly.toml sets
# PORT) and publishes README.md at /readme/ (spec/README.md says what's
# checked). Data lives at /data, the one path that survives a restart.

FROM node:24-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

COPY src/ src/
COPY README.md ./

ENV NODE_OPTIONS=--experimental-sqlite
ENV DATA_DIR=/data

EXPOSE 8080
CMD ["node", "src/server.js"]
