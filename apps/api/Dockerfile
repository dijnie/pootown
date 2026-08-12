FROM node:24.18.0-alpine3.23@sha256:595398b0081eacda8e1c4c5b97b76cd1020e4d58a8ebcb4843b9bca1e79e7436 AS build

RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/game-contracts/package.json packages/game-contracts/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages/game-contracts packages/game-contracts
RUN pnpm --filter @pootown/game-contracts build \
  && pnpm --filter @pootown/api build \
  && pnpm --filter @pootown/api deploy --legacy --prod /output

FROM node:24.18.0-alpine3.23@sha256:595398b0081eacda8e1c4c5b97b76cd1020e4d58a8ebcb4843b9bca1e79e7436 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /output/ ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
