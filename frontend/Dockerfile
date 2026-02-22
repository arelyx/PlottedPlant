# frontend/Dockerfile
# This is only used to BUILD the static assets.
# The output (dist/) is then copied to Nginx's html directory.

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL
ARG VITE_WS_BASE_URL
ARG VITE_PUBLIC_URL

RUN npm run build

# No runtime stage — the dist/ folder is used as a volume or
# copied into the Nginx container at deploy time.
FROM scratch
COPY --from=builder /app/dist /dist
