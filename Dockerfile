# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/tooling/package.json packages/tooling/
COPY packages/cli/package.json packages/cli/
RUN npm ci --ignore-scripts

# Stage 2: Build
FROM deps AS build
COPY . .
RUN npm run build -w @tapython-tool-hub/shared && \
    npm run build -w @tapython-tool-hub/tooling && \
    npm run build -w @tapython-tool-hub/web && \
    npm run build -w @tapython-tool-hub/api

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
ENV SERVE_STATIC=true
ENV API_HOST=0.0.0.0
ENV API_PORT=8787

# Copy only production dependencies
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/tooling/package.json packages/tooling/
RUN npm ci --omit=dev --ignore-scripts

# Copy built artifacts
COPY --from=build /app/apps/api/dist apps/api/dist/
COPY --from=build /app/apps/api/src apps/api/src/
COPY --from=build /app/dist dist/
COPY --from=build /app/data data/
COPY --from=build /app/apps/web/dist apps/web/dist/

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8787/api/health || exit 1

CMD ["node", "apps/api/dist/server.js"]
