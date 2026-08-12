# Pootown web

The web app is a Next.js frontend for the authoritative NestJS API and Colyseus
game server. Authentication is email/password with rotating server sessions.
The browser does not sign transactions, own settlement amounts, or communicate
with a blockchain/indexer runtime.

Required public build variables:

```text
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_GAME_SERVER_URL=wss://game.example.com
```

Both values must be canonical origins without credentials, path, query, or
fragment. No secret, token, ticket, or private key belongs in a public build
variable.

```bash
pnpm --filter @pootown/web test
pnpm --filter @pootown/web lint
pnpm --filter @pootown/web build
```

The production image is built from `apps/web/Dockerfile` and uses the Next.js
standalone output.
