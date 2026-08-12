#!/usr/bin/env bash

set -euo pipefail

readonly postgres_container="${POOTOWN_POSTGRES_CONTAINER:-pootown-postgres}"
readonly database_name="pootown_web_vertical"
readonly database_url="postgresql://postgres:pootown-local@127.0.0.1:5433/${database_name}"
readonly api_port="3001"
readonly game_server_port="2567"
readonly web_port="3011"
readonly test_origin="http://127.0.0.1:${web_port}"

exec 9>"/tmp/pootown-web-vertical.lock"
if ! flock -n 9; then
  echo "Another Pootown web vertical test is already running." >&2
  exit 1
fi

task_tmp_dir="$(mktemp -d -t pootown-web-vertical-XXXXXX)"
auth_access_secret="$(openssl rand -hex 32)"
auth_refresh_secret="$(openssl rand -hex 32)"
api_pid=""
game_server_pid=""
web_pid=""

cleanup() {
  local exit_code=$?
  for pid in "${web_pid}" "${game_server_pid}" "${api_pid}"; do
    if [[ -n "${pid}" ]]; then
      kill -TERM -- "-${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  local free_checks=0
  for _ in $(seq 1 100); do
    local occupied=""
    for port in "${api_port}" "${game_server_port}" "${web_port}"; do
      if ss -ltn "sport = :${port}" | tail -n +2 | grep -q .; then
        occupied="yes"
        break
      fi
    done
    if [[ -z "${occupied}" ]]; then
      free_checks=$((free_checks + 1))
      [[ "${free_checks}" -ge 10 ]] && break
    else
      free_checks=0
    fi
    sleep 0.1
  done
  if [[ "${exit_code}" -ne 0 ]]; then
    for log_file in api.log game-server.log web.log; do
      if [[ -f "${task_tmp_dir}/${log_file}" ]]; then
        echo "--- ${log_file} ---" >&2
        grep -Ei '"level":(40|50|60)|statusCode":(4|5)|join-intent|error|failed|invalid|unavailable' "${task_tmp_dir}/${log_file}" | tail -120 >&2 || true
      fi
    done
  fi
  docker exec "${postgres_container}" dropdb --if-exists --force -U postgres "${database_name}" >/dev/null 2>&1 || true
  rm -rf "${task_tmp_dir}"
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

for port in "${api_port}" "${game_server_port}" "${web_port}"; do
  if ss -ltn "sport = :${port}" | tail -n +2 | grep -q .; then
    echo "Port ${port} is already in use; stop its owner before running the vertical test." >&2
    exit 1
  fi
done

if [[ "$(docker inspect -f '{{.State.Running}}' "${postgres_container}" 2>/dev/null)" != "true" ]]; then
  echo "PostgreSQL container ${postgres_container} is not running. Run pnpm db:up first." >&2
  exit 1
fi

openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "${task_tmp_dir}/internal-private.pem" 2>/dev/null
openssl pkey -in "${task_tmp_dir}/internal-private.pem" -pubout -out "${task_tmp_dir}/internal-public.pem" 2>/dev/null

docker exec "${postgres_container}" dropdb --if-exists --force -U postgres "${database_name}" >/dev/null
docker exec "${postgres_container}" createdb -U postgres "${database_name}"

pnpm --filter @pootown/game-contracts build
pnpm --filter @pootown/game-core build
pnpm --filter @pootown/api build
pnpm --filter @pootown/game-server build
env \
  NEXT_PUBLIC_API_URL="http://127.0.0.1:${api_port}" \
  NEXT_PUBLIC_GAME_SERVER_URL="ws://127.0.0.1:${game_server_port}" \
  pnpm --filter ./apps/web build
pnpm --filter @pootown/api db:migrate "${database_url}"

docker exec -i "${postgres_container}" psql -v ON_ERROR_STOP=1 -U postgres -d "${database_name}" >/dev/null <<'SQL'
INSERT INTO game.game_definitions
  (id, policy_version, display_name, maximum_players, entry_coin, time_limit_ms, policy_snapshot, policy_hash)
VALUES
  ('classic_100', 1, 'Classic', 4, 100, 3600000, '{"rules":"classic"}', decode(repeat('99', 32), 'hex'));
SQL

setsid env \
  NODE_ENV=test \
  API_HOST=127.0.0.1 \
  API_PORT="${api_port}" \
  DATABASE_URL="${database_url}" \
  CORS_ORIGINS="${test_origin}" \
  AUTH_ACCESS_TOKEN_SECRET="${auth_access_secret}" \
  AUTH_REFRESH_TOKEN_SECRET="${auth_refresh_secret}" \
  INTERNAL_JWT_ISSUER='pootown-vertical-test' \
  INTERNAL_JWT_AUDIENCE='pootown-internal' \
  INTERNAL_JWT_PUBLIC_KEY="$(<"${task_tmp_dir}/internal-public.pem")" \
  pnpm --filter @pootown/api start >"${task_tmp_dir}/api.log" 2>&1 &
api_pid=$!

setsid env \
  API_BASE_URL="http://127.0.0.1:${api_port}" \
  DATABASE_URL="${database_url}" \
  GAME_SERVER_INSTANCE_ID='vertical-test' \
  GAME_SERVER_ORIGINS="${test_origin}" \
  GAME_SERVER_PORT="${game_server_port}" \
  INTERNAL_SERVICE_AUDIENCE='pootown-internal' \
  INTERNAL_SERVICE_ID='game-server' \
  INTERNAL_SERVICE_ISSUER='pootown-vertical-test' \
  INTERNAL_SERVICE_PRIVATE_KEY="$(<"${task_tmp_dir}/internal-private.pem")" \
  pnpm --filter @pootown/game-server start >"${task_tmp_dir}/game-server.log" 2>&1 &
game_server_pid=$!

setsid env \
  NEXT_PUBLIC_API_URL="http://127.0.0.1:${api_port}" \
  NEXT_PUBLIC_GAME_SERVER_URL="ws://127.0.0.1:${game_server_port}" \
  pnpm --filter ./apps/web start --hostname 127.0.0.1 --port "${web_port}" >"${task_tmp_dir}/web.log" 2>&1 &
web_pid=$!

wait_for_url() {
  local name=$1
  local url=$2
  local log_file=$3
  for _ in $(seq 1 120); do
    if curl --fail --silent --show-error "${url}" >/dev/null 2>&1; then
      return
    fi
    sleep 0.5
  done
  echo "${name} did not become ready: ${url}" >&2
  tail -80 "${log_file}" >&2 || true
  exit 1
}

wait_for_url "API" "http://127.0.0.1:${api_port}/health/ready" "${task_tmp_dir}/api.log"
wait_for_url "game server" "http://127.0.0.1:${game_server_port}/health/ready" "${task_tmp_dir}/game-server.log"
wait_for_url "web" "${test_origin}/lobby" "${task_tmp_dir}/web.log"

pnpm --dir apps/web exec playwright test --config playwright.vertical.config.ts "$@"
