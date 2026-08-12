#!/usr/bin/env bash

set -euo pipefail

readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly postgres_container="${POOTOWN_POSTGRES_CONTAINER:-pootown-postgres}"
readonly database_name="${POOTOWN_LOAD_DATABASE_NAME:-pootown_load_gate}"
readonly database_url="postgresql://postgres:pootown-local@127.0.0.1:5433/${database_name}"
readonly api_port="3002"
readonly game_server_port="2568"
readonly test_origin="http://127.0.0.1:3012"
readonly report_path="${POOTOWN_LOAD_REPORT_PATH:-${repository_root}/plans/260811-0313-nestjs-colyseus-monorepo-refactor/reports/phase-07-load-results.json}"

players=200
rooms=50
duration_seconds=1800
for argument in "$@"; do
  case "${argument}" in
    --players=*) players="${argument#*=}" ;;
    --rooms=*) rooms="${argument#*=}" ;;
    --duration=*)
      duration="${argument#*=}"
      if [[ "${duration}" =~ ^[0-9]+m$ ]]; then
        duration_seconds=$((10#${duration%m} * 60))
      elif [[ "${duration}" =~ ^[0-9]+s$ ]]; then
        duration_seconds=$((10#${duration%s}))
      else
        echo "Duration must use seconds or minutes, for example 30m." >&2
        exit 2
      fi
      ;;
    *) echo "Unknown load option: ${argument}" >&2; exit 2 ;;
  esac
done

exec 9>"/tmp/pootown-load-gate.lock"
if ! flock -n 9; then
  echo "Another Pootown load gate is running." >&2
  exit 1
fi

if [[ ! "${database_name}" =~ ^pootown_[a-z0-9_]+$ ]]; then
  echo "Load database name must be an isolated pootown_* identifier." >&2
  exit 2
fi

task_tmp_dir="$(mktemp -d -t pootown-load-gate-XXXXXX)"
access_secret="${POOTOWN_LOAD_ACCESS_SECRET:-$(openssl rand -hex 32)}"
refresh_secret="$(openssl rand -hex 32)"
api_pid=""
game_server_pid=""
cpu_pid=""

cleanup() {
  local exit_code=$?
  if [[ "${exit_code}" -ne 0 ]]; then
    for log_file in api.log game-server.log; do
      if [[ -f "${task_tmp_dir}/${log_file}" ]]; then
        grep '"kind":"unhandled-api-exception"' "${task_tmp_dir}/${log_file}" | tail -20 >&2 || true
        echo "--- ${log_file} ---" >&2
        tail -100 "${task_tmp_dir}/${log_file}" >&2 || true
      fi
    done
  fi
  if [[ -n "${cpu_pid}" ]]; then kill -TERM "${cpu_pid}" 2>/dev/null || true; fi
  for pid in "${game_server_pid}" "${api_pid}"; do
    if [[ -n "${pid}" ]]; then
      kill -TERM -- "-${pid}" 2>/dev/null || true
      for _ in $(seq 1 20); do
        if ! kill -0 -- "-${pid}" 2>/dev/null; then break; fi
        sleep 0.1
      done
      kill -KILL -- "-${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  if [[ "${POOTOWN_LOAD_KEEP_DATABASE:-false}" != "true" ]]; then
    docker exec "${postgres_container}" dropdb --if-exists --force -U postgres "${database_name}" >/dev/null 2>&1 || true
  fi
  if [[ "${exit_code}" -ne 0 && "${POOTOWN_LOAD_KEEP_FAILURE_LOGS:-false}" == "true" ]]; then
    echo "Failure logs retained at ${task_tmp_dir}" >&2
  else
    rm -rf "${task_tmp_dir}"
  fi
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

for port in "${api_port}" "${game_server_port}"; do
  if ss -ltn "sport = :${port}" | tail -n +2 | grep -q .; then
    echo "Port ${port} is already in use." >&2
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
pnpm --filter @pootown/api db:migrate "${database_url}"
docker exec -i "${postgres_container}" psql -v ON_ERROR_STOP=1 -U postgres -d "${database_name}" >/dev/null <<'SQL'
INSERT INTO game.game_definitions
  (id, policy_version, display_name, maximum_players, entry_coin, time_limit_ms, policy_snapshot, policy_hash)
VALUES
  ('load_classic', 1, 'Load Classic', 4, 100, 3600000, '{"rules":"classic"}', decode(repeat('98', 32), 'hex')),
  ('load_short', 1, 'Load Short', 4, 100, 1000, '{"rules":"classic","loadTerminal":true}', decode(repeat('97', 32), 'hex'));
SQL

setsid env \
  NODE_ENV=test API_HOST=127.0.0.1 API_PORT="${api_port}" DATABASE_URL="${database_url}" \
  CORS_ORIGINS="${test_origin}" AUTH_ACCESS_TOKEN_SECRET="${access_secret}" \
  AUTH_REFRESH_TOKEN_SECRET="${refresh_secret}" AUTH_ACCESS_TOKEN_TTL_SECONDS=3600 \
  INTERNAL_JWT_ISSUER='pootown-load-test' INTERNAL_JWT_AUDIENCE='pootown-internal' \
  INTERNAL_JWT_PUBLIC_KEY="$(<"${task_tmp_dir}/internal-public.pem")" \
  pnpm --filter @pootown/api start >"${task_tmp_dir}/api.log" 2>&1 &
api_pid=$!

setsid env \
  API_BASE_URL="http://127.0.0.1:${api_port}" DATABASE_URL="${database_url}" \
  GAME_SERVER_INSTANCE_ID='load-test' GAME_SERVER_ORIGINS="${test_origin}" \
  GAME_SERVER_PORT="${game_server_port}" INTERNAL_SERVICE_AUDIENCE='pootown-internal' \
  INTERNAL_SERVICE_ID='game-server' INTERNAL_SERVICE_ISSUER='pootown-load-test' \
  INTERNAL_SERVICE_PRIVATE_KEY="$(<"${task_tmp_dir}/internal-private.pem")" \
  pnpm --filter @pootown/game-server start >"${task_tmp_dir}/game-server.log" 2>&1 &
game_server_pid=$!

for endpoint in \
  "http://127.0.0.1:${api_port}/health/ready" \
  "http://127.0.0.1:${game_server_port}/health/ready"; do
  ready=""
  for _ in $(seq 1 120); do
    if curl --fail --silent "${endpoint}" >/dev/null 2>&1; then ready=yes; break; fi
    sleep 0.5
  done
  if [[ -z "${ready}" ]]; then
    echo "Service did not become ready: ${endpoint}" >&2
    tail -80 "${task_tmp_dir}/api.log" "${task_tmp_dir}/game-server.log" >&2 || true
    exit 1
  fi
done

: >"${task_tmp_dir}/database-cpu.txt"
database_cpu_cores="$(docker exec "${postgres_container}" getconf _NPROCESSORS_ONLN)"
if [[ ! "${database_cpu_cores}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Could not determine PostgreSQL CPU capacity." >&2
  exit 1
fi
(
  previous_usage="$(docker exec "${postgres_container}" awk '/^usage_usec / { print $2 }' /sys/fs/cgroup/cpu.stat)"
  read -r previous_uptime _ </proc/uptime
  while true; do
    sleep 2
    current_usage="$(docker exec "${postgres_container}" awk '/^usage_usec / { print $2 }' /sys/fs/cgroup/cpu.stat)"
    read -r current_uptime _ </proc/uptime
    awk -v current_usage="${current_usage}" -v previous_usage="${previous_usage}" \
      -v current_uptime="${current_uptime}" -v previous_uptime="${previous_uptime}" \
      -v cores="${database_cpu_cores}" \
      'BEGIN {
        elapsed = current_uptime - previous_uptime
        if (elapsed > 0 && current_usage >= previous_usage) {
          printf "%.4f", ((current_usage - previous_usage) / 1000000) / elapsed / cores * 100
        }
      }' >>"${task_tmp_dir}/database-cpu.txt"
    database_observation="$(docker exec "${postgres_container}" psql -Atq -U postgres -d "${database_name}" -c \
      "SELECT count(*) FILTER (WHERE wait_event_type = 'Lock'), count(*) FILTER (WHERE application_name = 'pootown-api') FROM pg_stat_activity WHERE datname = current_database()")"
    printf ',%s\n' "${database_observation//|/,}" >>"${task_tmp_dir}/database-cpu.txt"
    previous_usage="${current_usage}"
    previous_uptime="${current_uptime}"
  done
) &
cpu_pid=$!

env \
  LOAD_API_URL="http://127.0.0.1:${api_port}" \
  LOAD_GAME_SERVER_URL="ws://127.0.0.1:${game_server_port}" \
  LOAD_GAME_SERVER_ORIGIN="${test_origin}" \
  LOAD_DATABASE_URL="${database_url}" LOAD_ACCESS_SECRET="${access_secret}" \
  LOAD_PLAYERS="${players}" LOAD_ROOMS="${rooms}" LOAD_DURATION_SECONDS="${duration_seconds}" \
  LOAD_COMMAND_INTERVAL_MS="${POOTOWN_LOAD_COMMAND_INTERVAL_MS:-1000}" \
  LOAD_DATABASE_CPU_PATH="${task_tmp_dir}/database-cpu.txt" \
  LOAD_DATABASE_CPU_CORES="${database_cpu_cores}" \
  LOAD_GIT_COMMIT="$(git -C "${repository_root}" rev-parse HEAD)" \
  LOAD_SOURCE_MANIFEST_SHA256="$(
    cd "${repository_root}"
    find apps packages scripts tests package.json pnpm-lock.yaml pnpm-workspace.yaml \
      -type f ! -path '*/node_modules/*' ! -path '*/dist/*' ! -path '*/.next/*' \
      ! -path '*/.test-dist/*' ! -path '*/test-results/*' ! -path '*/playwright-report/*' \
      -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1
  )" \
  LOAD_INVOCATION="./scripts/run-load-gate.sh --players=${players} --rooms=${rooms} --duration=${duration_seconds}s" \
  LOAD_REPORT_PATH="${report_path}" \
  pnpm --dir tests/load test
