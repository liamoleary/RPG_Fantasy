# ── build ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Railway exposes the deployed commit as a build variable; .dockerignore drops
# .git and node:alpine has no git binary, so this ARG is the only way the build
# can know its own SHA. Without it the id falls back to a timestamp, which still
# works but says nothing about which commit a tester was on.
ARG RAILWAY_GIT_COMMIT_SHA=""
ENV RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA

RUN npm run build

# ── run ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server

EXPOSE 8080
CMD ["node", "server/index.js"]
