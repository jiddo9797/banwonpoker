# banwonpoker: 게임 서버 하나가 화면·WebSocket·API를 같은 주소로 제공한다.

# ── 빌드 ────────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable

# 의존성부터 받아 캐시를 살린다.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY backend/engine/package.json backend/engine/
COPY backend/gto/package.json backend/gto/
COPY backend/postflop/package.json backend/postflop/
COPY backend/server/package.json backend/server/
RUN pnpm install --frozen-lockfile

COPY . .
# 화면(같은 주소의 /ws로 접속하는 프로덕션 빌드)과 서버 번들(파일 하나)
RUN pnpm --filter @banwonpoker/web build \
 && pnpm --filter @banwonpoker/server build

# ── 실행 ────────────────────────────────────────────────
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    STATIC_DIR=/app/public

COPY --from=build /app/backend/server/dist/server.mjs ./server.mjs
COPY --from=build /app/frontend/dist ./public

EXPOSE 8080
# SQLite·음성 파일은 /data(볼륨)에 쌓인다.
CMD ["node", "server.mjs"]
