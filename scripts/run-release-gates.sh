#!/usr/bin/env bash

set -euo pipefail

readonly gate="${1:-all}"

run_quality() {
  pnpm install --frozen-lockfile
  pnpm lint
  pnpm --filter @pootown/game-contracts test
  pnpm --filter @pootown/game-core test
  pnpm --filter @pootown/api test
  pnpm --filter @pootown/game-server test
  pnpm --filter ./apps/web test
  pnpm build
}

run_contracts() {
  pnpm --filter @pootown/game-contracts test
  pnpm --filter @pootown/game-core test:parity
}

run_e2e() {
  pnpm --filter @pootown/api test:e2e
  pnpm --filter @pootown/game-server test:integration
  pnpm test:web:vertical
  pnpm --filter @pootown/web test:visual
}

run_security() {
  pnpm --filter @pootown/api test
  pnpm --filter @pootown/api db:migrate:test
  pnpm --filter @pootown/game-server test
  pnpm --filter ./apps/web test
  pnpm audit --audit-level critical --prod
  if git grep -I -n -E \
    'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}' \
    -- ':!pnpm-lock.yaml' ':!tests/fixtures/**' ':!scripts/run-release-gates.sh'; then
    echo "Potential credential material found in tracked release scope." >&2
    return 1
  fi
}

run_reliability() {
  pnpm --filter @pootown/api test:e2e
  pnpm --filter @pootown/game-server test:integration
  pnpm test:web:vertical
}

case "${gate}" in
  quality) run_quality ;;
  contracts) run_contracts ;;
  e2e) run_e2e ;;
  security) run_security ;;
  reliability) run_reliability ;;
  restore) ./scripts/run-backup-restore-drill.sh ;;
  load)
    shift
    if [[ "${1:-}" == "--" ]]; then shift; fi
    ./scripts/run-load-gate.sh "$@"
    ;;
  all)
    run_quality
    run_contracts
    run_e2e
    run_security
    run_reliability
    ./scripts/run-backup-restore-drill.sh
    ./scripts/run-load-gate.sh --players=200 --rooms=50 --duration=30m
    ;;
  *)
    echo "Unknown release gate: ${gate}" >&2
    exit 2
    ;;
esac
