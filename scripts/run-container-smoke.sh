#!/usr/bin/env bash

set -euo pipefail

readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly compose_project="pootown-container-smoke"
exec 9>"/tmp/${compose_project}.lock"
if ! flock -n 9; then
  echo "Another Pootown container smoke is already running." >&2
  exit 1
fi
readonly temporary_directory="$(mktemp -d -t pootown-container-smoke-XXXXXX)"
readonly api_port=3101
readonly game_server_port=2667
readonly web_port=3100

cleanup() {
  docker compose -p "${compose_project}" -f compose.deploy.yml down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "${temporary_directory}"
}
trap cleanup EXIT

for port in "${api_port}" "${game_server_port}" "${web_port}"; do
  if ss -ltn "sport = :${port}" | tail -n +2 | grep -q .; then
    echo "Required smoke-test port ${port} is already in use." >&2
    exit 1
  fi
done

openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 \
  -out "${temporary_directory}/internal-private.pem" 2>/dev/null
openssl ec -in "${temporary_directory}/internal-private.pem" -pubout \
  -out "${temporary_directory}/internal-public.pem" 2>/dev/null

export POOTOWN_IMAGE_TAG="${POOTOWN_IMAGE_TAG:-verification}"
export POOTOWN_POSTGRES_PASSWORD="container-smoke-password"
export POOTOWN_MIGRATION_DATABASE_URL="postgresql://postgres:container-smoke-password@postgres:5432/pootown"
export POOTOWN_API_DATABASE_PASSWORD="container-smoke-api-password"
export POOTOWN_REALTIME_DATABASE_PASSWORD="container-smoke-realtime-password"
export POOTOWN_API_DATABASE_URL="postgresql://api_runtime:container-smoke-api-password@postgres:5432/pootown"
export POOTOWN_REALTIME_DATABASE_URL="postgresql://realtime_runtime:container-smoke-realtime-password@postgres:5432/pootown"
export POOTOWN_WEB_ORIGIN="http://127.0.0.1:${web_port}"
export POOTOWN_API_PORT="${api_port}"
export POOTOWN_GAME_SERVER_PORT="${game_server_port}"
export POOTOWN_WEB_PORT="${web_port}"
export POOTOWN_PUBLIC_API_URL="http://127.0.0.1:${api_port}"
export POOTOWN_PUBLIC_GAME_SERVER_URL="ws://127.0.0.1:${game_server_port}"
export AUTH_ACCESS_TOKEN_SECRET="container-smoke-access-secret-0000000000000000"
export AUTH_REFRESH_TOKEN_SECRET="container-smoke-refresh-secret-000000000000000"
export AUTH_ACCESS_TOKEN_TTL_SECONDS=3600
export INTERNAL_JWT_ISSUER="pootown-container-smoke"
export INTERNAL_JWT_AUDIENCE="pootown-container-smoke-internal"
export INTERNAL_JWT_PUBLIC_KEY="$(<"${temporary_directory}/internal-public.pem")"
export INTERNAL_SERVICE_PRIVATE_KEY="$(<"${temporary_directory}/internal-private.pem")"

cd "${repository_root}"
docker compose -p "${compose_project}" -f compose.deploy.yml config --quiet
if ! docker compose -p "${compose_project}" -f compose.deploy.yml up -d --no-build; then
  docker compose -p "${compose_project}" -f compose.deploy.yml logs migrate api game-server web >&2
  exit 1
fi

readonly migration_container="$(docker compose -p "${compose_project}" -f compose.deploy.yml ps --all --quiet migrate)"
if [[ -z "${migration_container}" ]] || [[ "$(docker wait "${migration_container}")" != "0" ]]; then
  docker compose -p "${compose_project}" -f compose.deploy.yml logs migrate >&2
  exit 1
fi

wait_for_endpoint() {
  local endpoint="$1"
  for _attempt in $(seq 1 90); do
    if curl --fail --silent --show-error "${endpoint}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_for_endpoint "http://127.0.0.1:${api_port}/health/ready"
wait_for_endpoint "http://127.0.0.1:${game_server_port}/health/ready"
wait_for_endpoint "http://127.0.0.1:${web_port}/"

docker compose -p "${compose_project}" -f compose.deploy.yml exec -T \
  -e PGPASSWORD="${POOTOWN_API_DATABASE_PASSWORD}" postgres \
  psql -h postgres -U api_runtime -d pootown -Atc 'SELECT current_user' \
  | grep -Fx 'api_runtime'
docker compose -p "${compose_project}" -f compose.deploy.yml exec -T \
  -e PGPASSWORD="${POOTOWN_REALTIME_DATABASE_PASSWORD}" postgres \
  psql -h postgres -U realtime_runtime -d pootown -Atc 'SELECT current_user' \
  | grep -Fx 'realtime_runtime'

readonly postgres_container="$(docker compose -p "${compose_project}" -f compose.deploy.yml ps --quiet postgres)"
docker exec -i "${postgres_container}" psql -v ON_ERROR_STOP=1 -U postgres -d pootown >/dev/null <<'SQL'
INSERT INTO game.game_definitions
  (id, policy_version, display_name, maximum_players, entry_coin, time_limit_ms,
   policy_snapshot, policy_hash)
VALUES
  ('load_classic', 1, 'Container Classic', 4, 100, 3600000,
   '{"rules":"classic"}', decode(repeat('98', 32), 'hex')),
  ('load_short', 1, 'Container Short', 4, 100, 1000,
   '{"rules":"classic","loadTerminal":true}', decode(repeat('97', 32), 'hex'));
SQL

readonly postgres_address="$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "${postgres_container}")"
printf '0,0,1\n0,0,1\n0,0,1\n' >"${temporary_directory}/database-observations.txt"
env \
  LOAD_API_URL="http://127.0.0.1:${api_port}" \
  LOAD_GAME_SERVER_URL="ws://127.0.0.1:${game_server_port}" \
  LOAD_GAME_SERVER_ORIGIN="${POOTOWN_WEB_ORIGIN}" \
  LOAD_DATABASE_URL="postgresql://postgres:container-smoke-password@${postgres_address}:5432/pootown" \
  LOAD_ACCESS_SECRET="${AUTH_ACCESS_TOKEN_SECRET}" \
  LOAD_PLAYERS=4 LOAD_ROOMS=1 LOAD_DURATION_SECONDS=8 LOAD_TERMINAL_ROOMS=1 \
  LOAD_DATABASE_CPU_PATH="${temporary_directory}/database-observations.txt" \
  LOAD_DATABASE_CPU_CORES=1 \
  LOAD_GIT_COMMIT="$(git rev-parse HEAD)" \
  LOAD_SOURCE_MANIFEST_SHA256='container-smoke' \
  LOAD_INVOCATION='./scripts/run-container-smoke.sh' \
  LOAD_REPORT_PATH="${temporary_directory}/load-report.json" \
  pnpm --dir tests/load test >/dev/null

readonly credentials='{"contractVersion":1,"email":"container-smoke@example.test","password":"container-smoke-password"}'
if ! curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  -H 'x-contract-version: 1' \
  --data "${credentials}" \
  "http://127.0.0.1:${api_port}/v1/auth/register" >/dev/null; then
  docker compose -p "${compose_project}" -f compose.deploy.yml logs api >&2
  exit 1
fi
if ! curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  -H 'x-contract-version: 1' \
  --data "${credentials}" \
  "http://127.0.0.1:${api_port}/v1/auth/login" >/dev/null; then
  docker compose -p "${compose_project}" -f compose.deploy.yml logs api >&2
  exit 1
fi

echo "Container smoke passed for PostgreSQL roles, migrations, auth, web, realtime play, and settlement."
