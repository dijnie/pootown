FROM node:24.18.0-alpine3.23@sha256:595398b0081eacda8e1c4c5b97b76cd1020e4d58a8ebcb4843b9bca1e79e7436 AS build
RUN apk add --no-cache python3 make g++ \
  && corepack enable \
  && corepack prepare pnpm@11.13.1 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/game-server/package.json apps/game-server/package.json
COPY packages/game-contracts/package.json packages/game-contracts/package.json
COPY packages/game-core/package.json packages/game-core/package.json
RUN pnpm install --frozen-lockfile
COPY apps/game-server apps/game-server
COPY packages/game-contracts packages/game-contracts
COPY packages/game-core packages/game-core
RUN pnpm --filter @pootown/game-contracts build \
  && pnpm --filter @pootown/game-core build \
  && pnpm --filter @pootown/game-server build \
  && pnpm --filter @pootown/game-server deploy --legacy --prod /output

FROM node:24.18.0-alpine3.23@sha256:595398b0081eacda8e1c4c5b97b76cd1020e4d58a8ebcb4843b9bca1e79e7436 AS runtime
ENV NODE_ENV=production
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx
WORKDIR /app
COPY --from=build --chown=node:node /output/ ./
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:2567/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
