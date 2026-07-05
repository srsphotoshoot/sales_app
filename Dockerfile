# --- Stage 1: build the React/Vite frontend ---
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
# VITE_ vars are inlined into the JS bundle at build time, not read at runtime —
# passed in via fly.toml [build.args] / --build-arg.
ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

# --- Stage 2: production runtime (server + built frontend only) ---
FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps
COPY server ./server
COPY --from=builder /app/dist ./dist

EXPOSE 4000
CMD ["node", "server/server.cjs"]
