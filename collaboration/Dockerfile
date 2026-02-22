# collaboration/Dockerfile

# ── Build stage ──
FROM node:20-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ── Runtime stage ──
FROM node:20-alpine

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json package-lock.json ./
RUN npm ci --production && npm cache clean --force

COPY --from=builder /build/dist/ ./dist/

USER appuser

# Hocuspocus WS port + internal HTTP command port
EXPOSE 1234 1235

CMD ["node", "dist/index.js"]
