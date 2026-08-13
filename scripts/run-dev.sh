#!/usr/bin/env bash

set -euo pipefail

readonly postgres_container="pootown-postgres"
readonly postgres_database="${POOTOWN_POSTGRES_DB:-pootown}"
readonly postgres_user="${POOTOWN_POSTGRES_USER:-postgres}"
readonly postgres_password="${POOTOWN_POSTGRES_PASSWORD:-pootown-local}"
readonly postgres_port="${POOTOWN_POSTGRES_PORT:-5433}"
readonly database_name="${postgres_database}_dev"
database_url="$(node -e '
  const [user, password, port, database] = process.argv.slice(1);
  process.stdout.write(`postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${encodeURIComponent(database)}`);
' "${postgres_user}" "${postgres_password}" "${postgres_port}" "${database_name}")"
readonly database_url
readonly api_port="${POOTOWN_API_PORT:-3001}"
readonly game_server_port="${POOTOWN_GAME_SERVER_PORT:-2567}"
readonly web_port="${POOTOWN_WEB_PORT:-3000}"
readonly web_origin="http://127.0.0.1:${web_port}"

exec 9>"/tmp/pootown-dev.lock"
if ! flock -n 9; then
  echo "Another Pootown development environment is already running." >&2
  exit 1
fi

temporary_directory="$(mktemp -d -t pootown-dev-XXXXXX)"
api_pid=""
game_server_pid=""
web_pid=""

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  local started_app_process=""

  for pid in "${web_pid}" "${game_server_pid}" "${api_pid}"; do
    if [[ -n "${pid}" ]]; then
      started_app_process="yes"
      kill -TERM -- "-${pid}" 2>/dev/null || true
    fi
  done
  for pid in "${web_pid}" "${game_server_pid}" "${api_pid}"; do
    if [[ -n "${pid}" ]]; then
      wait "${pid}" 2>/dev/null || true
    fi
  done

  rm -rf "${temporary_directory}"
  if [[ -n "${started_app_process}" ]]; then
    echo "Stopped Pootown app processes. PostgreSQL remains available; run 'pnpm db:down' to stop it."
  fi
  exit "${exit_code}"
}
request_shutdown() {
  exit 0
}
trap cleanup EXIT
trap request_shutdown INT TERM

for command in curl docker flock openssl pnpm setsid ss; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command}" >&2
    exit 1
  fi
done

for port in "${api_port}" "${game_server_port}" "${web_port}"; do
  if [[ ! "${port}" =~ ^[0-9]+$ ]] || ((port < 1 || port > 65535)); then
    echo "Invalid development port: ${port}" >&2
    exit 1
  fi
  if ss -ltn "sport = :${port}" | tail -n +2 | grep -q .; then
    echo "Port ${port} is already in use. Stop its owner before running pnpm dev." >&2
    exit 1
  fi
done
if [[ "${api_port}" == "${game_server_port}" || "${api_port}" == "${web_port}" || \
      "${game_server_port}" == "${web_port}" ]]; then
  echo "API, game server, and web development ports must be unique." >&2
  exit 1
fi

echo "Starting local PostgreSQL and applying migrations..."
pnpm db:up
if ! docker exec "${postgres_container}" psql -At -U "${postgres_user}" -d "${postgres_database}" \
  -c "SELECT datname FROM pg_database" | grep -Fxq "${database_name}"; then
  docker exec "${postgres_container}" createdb -U "${postgres_user}" "${database_name}"
fi
pnpm --filter @pootown/game-contracts build
pnpm --filter @pootown/game-core build
pnpm --filter @pootown/api build
pnpm --filter @pootown/game-server build
pnpm --filter @pootown/api db:migrate "${database_url}"

docker exec -i "${postgres_container}" psql -v ON_ERROR_STOP=1 -U "${postgres_user}" \
  -d "${database_name}" >/dev/null <<'SQL'
INSERT INTO game.game_definitions
  (id, policy_version, display_name, maximum_players, entry_coin, time_limit_ms,
   policy_snapshot, policy_hash)
VALUES
  ('classic_100', 1, 'Classic', 4, 100, 3600000,
   '{"rules":"classic"}', decode(repeat('99', 32), 'hex')),
  ('short_100', 1, 'Short Match', 4, 100, 3000,
   '{"rules":"classic"}', decode(repeat('97', 32), 'hex'))
ON CONFLICT (id, policy_version) DO NOTHING;
SQL

openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 \
  -out "${temporary_directory}/internal-private.pem" 2>/dev/null
openssl pkey -in "${temporary_directory}/internal-private.pem" -pubout \
  -out "${temporary_directory}/internal-public.pem" 2>/dev/null

readonly auth_access_secret="$(openssl rand -hex 32)"
readonly auth_refresh_secret="$(openssl rand -hex 32)"

echo "Starting API on http://127.0.0.1:${api_port}..."
setsid env \
  NODE_ENV=development \
  API_HOST=127.0.0.1 \
  API_PORT="${api_port}" \
  DATABASE_URL="${database_url}" \
  CORS_ORIGINS="${web_origin}" \
  AUTH_ACCESS_TOKEN_SECRET="${auth_access_secret}" \
  AUTH_REFRESH_TOKEN_SECRET="${auth_refresh_secret}" \
  INTERNAL_JWT_ISSUER=pootown-local-dev \
  INTERNAL_JWT_AUDIENCE=pootown-internal \
  INTERNAL_JWT_PUBLIC_KEY="$(<"${temporary_directory}/internal-public.pem")" \
  node apps/api/dist/main.js &
api_pid=$!

echo "Starting game server on ws://127.0.0.1:${game_server_port}..."
setsid env \
  API_BASE_URL="http://127.0.0.1:${api_port}" \
  DATABASE_URL="${database_url}" \
  GAME_SERVER_INSTANCE_ID=pootown-local-dev \
  GAME_SERVER_ORIGINS="${web_origin}" \
  GAME_SERVER_PORT="${game_server_port}" \
  INTERNAL_SERVICE_AUDIENCE=pootown-internal \
  INTERNAL_SERVICE_ID=game-server \
  INTERNAL_SERVICE_ISSUER=pootown-local-dev \
  INTERNAL_SERVICE_PRIVATE_KEY="$(<"${temporary_directory}/internal-private.pem")" \
  node apps/game-server/dist/main.js &
game_server_pid=$!

echo "Starting web on ${web_origin}..."
setsid env \
  NEXT_PUBLIC_API_URL="http://127.0.0.1:${api_port}" \
  NEXT_PUBLIC_GAME_SERVER_URL="ws://127.0.0.1:${game_server_port}" \
  bash -c 'cd apps/web && exec node node_modules/next/dist/bin/next dev --webpack --hostname "$1" --port "$2"' \
    _ 127.0.0.1 "${web_port}" &
web_pid=$!

wait_for_url() {
  local name=$1
  local url=$2
  local pid=$3

  for _ in $(seq 1 120); do
    if curl --fail --silent "${url}" >/dev/null 2>&1; then
      return
    fi
    if ! kill -0 "${pid}" 2>/dev/null; then
      echo "${name} exited before becoming ready." >&2
      return 1
    fi
    sleep 0.25
  done

  echo "${name} did not become ready: ${url}" >&2
  return 1
}

wait_for_url "API" "http://127.0.0.1:${api_port}/health/ready" "${api_pid}"
wait_for_url "game server" "http://127.0.0.1:${game_server_port}/health/ready" "${game_server_pid}"
wait_for_url "web" "${web_origin}/lobby" "${web_pid}"

echo "Pootown is ready at ${web_origin}. Press Ctrl-C to stop the app processes."

set +e
wait -n "${api_pid}" "${game_server_pid}" "${web_pid}"
service_exit_code=$?
set -e

if [[ "${service_exit_code}" -eq 0 ]]; then
  echo "A development service stopped unexpectedly." >&2
  exit 1
fi
exit "${service_exit_code}"
