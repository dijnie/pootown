#!/usr/bin/env bash

set -euo pipefail

readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly source_container="${POOTOWN_POSTGRES_CONTAINER:-pootown-postgres}"
readonly source_database="pootown_restore_source"
readonly source_database_url="postgresql://postgres:pootown-local@127.0.0.1:5433/${source_database}"
readonly restore_container="pootown-restore-drill"
readonly restore_database="pootown_restore_target"
readonly restore_port="55434"
readonly restore_password="pootown-restore-local"
readonly restore_database_url="postgresql://postgres:${restore_password}@127.0.0.1:${restore_port}/${restore_database}"
readonly api_port="3003"
readonly game_server_port="2569"
readonly test_origin="http://127.0.0.1:3013"
readonly report_path="${repository_root}/plans/260811-0313-nestjs-colyseus-monorepo-refactor/reports/phase-07-restore-results.json"

exec 9>"/tmp/pootown-backup-restore.lock"
if ! flock -n 9; then
  echo "Another Pootown backup/restore drill is running." >&2
  exit 1
fi

task_tmp_dir="$(mktemp -d -t pootown-backup-restore-XXXXXX)"
access_secret="$(openssl rand -hex 32)"
refresh_secret="$(openssl rand -hex 32)"
api_pid=""
game_server_pid=""
restore_container_started="false"

cleanup() {
  local exit_code=$?
  for pid in "${game_server_pid}" "${api_pid}"; do
    if [[ -n "${pid}" ]]; then
      kill -TERM -- "-${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  docker exec "${source_container}" dropdb --if-exists --force -U postgres "${source_database}" >/dev/null 2>&1 || true
  if [[ "${restore_container_started}" == "true" ]]; then
    docker rm -f "${restore_container}" >/dev/null 2>&1 || true
  fi
  rm -rf "${task_tmp_dir}"
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

if [[ "$(docker inspect -f '{{.State.Running}}' "${source_container}" 2>/dev/null)" != "true" ]]; then
  echo "PostgreSQL container ${source_container} is not running. Run pnpm db:up first." >&2
  exit 1
fi
if docker inspect "${restore_container}" >/dev/null 2>&1; then
  echo "Restore container ${restore_container} already exists; ownership is unknown." >&2
  exit 1
fi
for port in "${restore_port}" "${api_port}" "${game_server_port}"; do
  if ss -ltn "sport = :${port}" | tail -n +2 | grep -q .; then
    echo "Port ${port} is already in use." >&2
    exit 1
  fi
done

env \
  POOTOWN_LOAD_ACCESS_SECRET="${access_secret}" \
  POOTOWN_LOAD_DATABASE_NAME="${source_database}" \
  POOTOWN_LOAD_KEEP_DATABASE=true \
  LOAD_TERMINAL_ROOMS=0 \
  POOTOWN_LOAD_REPORT_PATH="${task_tmp_dir}/source-load.json" \
  ./scripts/run-load-gate.sh --players=4 --rooms=1 --duration=8s

fingerprint_sql="SELECT json_build_object(
  'users', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY id), '')) FROM identity.users row_value),
  'accounts', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY user_id), '')) FROM economy.coin_accounts row_value),
  'operations', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY id), '')) FROM economy.coin_operations row_value),
  'ledger', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY operation_id, ledger_account_id), '')) FROM economy.coin_ledger_entries row_value),
  'reservations', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY id), '')) FROM economy.coin_reservations row_value),
  'settlements', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY game_session_id, kind), '')) FROM economy.game_settlements row_value),
  'sessions', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY id), '')) FROM game.game_sessions row_value),
  'players', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY game_session_id, seat_index), '')) FROM game.session_players row_value),
  'joinIntents', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY id), '')) FROM game.join_intents row_value),
  'tickets', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY id), '')) FROM game.realtime_tickets row_value),
  'history', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY id), '')) FROM readmodel.session_history row_value),
  'leaderboard', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY user_id), '')) FROM readmodel.leaderboard_players row_value),
  'leases', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY room_id), '')) FROM realtime.room_leases row_value),
  'checkpoints', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY room_id), '')) FROM realtime.room_checkpoints row_value),
  'commands', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY room_id, player_id, request_id), '')) FROM realtime.room_commands row_value),
  'events', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY event_id), '')) FROM realtime.room_events row_value),
  'proofs', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY game_session_id), '')) FROM realtime.terminal_proofs row_value),
  'presence', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY room_id), '')) FROM realtime.room_presence row_value),
  'finalizations', (SELECT md5(COALESCE(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY room_id, request_id), '')) FROM realtime.session_finalizations row_value)
)::text"
source_fingerprint="$(docker exec "${source_container}" psql -Atq -U postgres -d "${source_database}" -c "${fingerprint_sql}")"

docker exec "${source_container}" pg_dump -U postgres -Fc \
  --exclude-table-data=infra.schema_migrations "${source_database}" >"${task_tmp_dir}/backup.dump"
openssl rand -hex 32 >"${task_tmp_dir}/backup-passphrase"
chmod 600 "${task_tmp_dir}/backup-passphrase"
openssl enc -aes-256-cbc -salt -pbkdf2 \
  -in "${task_tmp_dir}/backup.dump" -out "${task_tmp_dir}/backup.dump.enc" \
  -pass "file:${task_tmp_dir}/backup-passphrase"
rm -f "${task_tmp_dir}/backup.dump"

restore_started_at_ms="$(date +%s%3N)"
docker run -d --name "${restore_container}" -p "127.0.0.1:${restore_port}:5432" \
  -e POSTGRES_DB="${restore_database}" -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD="${restore_password}" postgres:17.6-alpine >/dev/null
restore_container_started="true"
for _ in $(seq 1 120); do
  if docker exec "${restore_container}" pg_isready -U postgres -d "${restore_database}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
if ! docker exec "${restore_container}" pg_isready -U postgres -d "${restore_database}" >/dev/null 2>&1; then
  echo "Clean restore PostgreSQL did not become ready." >&2
  exit 1
fi

pnpm --filter @pootown/api db:migrate "${restore_database_url}"
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "${task_tmp_dir}/backup.dump.enc" -pass "file:${task_tmp_dir}/backup-passphrase" \
  | docker exec -i "${restore_container}" pg_restore -U postgres -d "${restore_database}" \
      --data-only --disable-triggers --no-owner --no-privileges --exit-on-error

target_fingerprint="$(docker exec "${restore_container}" psql -Atq -U postgres -d "${restore_database}" -c "${fingerprint_sql}")"
if [[ "${source_fingerprint}" != "${target_fingerprint}" ]]; then
  echo "Restored ledger/session/checkpoint fingerprint differs from source." >&2
  exit 1
fi
reconciliation_mismatches="$(docker exec "${restore_container}" psql -Atq -U postgres -d "${restore_database}" -c \
  "SELECT count(*) FROM economy.coin_account_reconciliation WHERE available_coin <> ledger_available_coin OR reserved_coin <> ledger_reserved_coin")"
if [[ "${reconciliation_mismatches}" != "0" ]]; then
  echo "Restored coin accounts do not reconcile with the ledger." >&2
  exit 1
fi
role_boundary="$(docker exec "${restore_container}" psql -Atq -U postgres -d "${restore_database}" -c \
  "SELECT has_table_privilege('api_runtime', 'economy.coin_accounts', 'SELECT')
          AND NOT has_table_privilege('realtime_runtime', 'economy.coin_accounts', 'SELECT')
          AND has_table_privilege('realtime_runtime', 'realtime.room_checkpoints', 'SELECT')")"
if [[ "${role_boundary}" != "t" ]]; then
  echo "Restored runtime role boundary is incorrect." >&2
  exit 1
fi

openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "${task_tmp_dir}/internal-private.pem" 2>/dev/null
openssl pkey -in "${task_tmp_dir}/internal-private.pem" -pubout -out "${task_tmp_dir}/internal-public.pem" 2>/dev/null
setsid env \
  NODE_ENV=test API_HOST=127.0.0.1 API_PORT="${api_port}" DATABASE_URL="${restore_database_url}" \
  CORS_ORIGINS="${test_origin}" AUTH_ACCESS_TOKEN_SECRET="${access_secret}" \
  AUTH_REFRESH_TOKEN_SECRET="${refresh_secret}" AUTH_ACCESS_TOKEN_TTL_SECONDS=3600 \
  INTERNAL_JWT_ISSUER='pootown-restore-test' INTERNAL_JWT_AUDIENCE='pootown-internal' \
  INTERNAL_JWT_PUBLIC_KEY="$(<"${task_tmp_dir}/internal-public.pem")" \
  pnpm --filter @pootown/api start >"${task_tmp_dir}/api.log" 2>&1 &
api_pid=$!
setsid env \
  API_BASE_URL="http://127.0.0.1:${api_port}" DATABASE_URL="${restore_database_url}" \
  GAME_SERVER_INSTANCE_ID='restore-test' GAME_SERVER_ORIGINS="${test_origin}" \
  GAME_SERVER_PORT="${game_server_port}" INTERNAL_SERVICE_AUDIENCE='pootown-internal' \
  INTERNAL_SERVICE_ID='game-server' INTERNAL_SERVICE_ISSUER='pootown-restore-test' \
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
    echo "Restored service did not become ready: ${endpoint}" >&2
    tail -80 "${task_tmp_dir}/api.log" "${task_tmp_dir}/game-server.log" >&2 || true
    exit 1
  fi
done

restore_probe="$(env \
  RESTORE_API_URL="http://127.0.0.1:${api_port}" \
  RESTORE_GAME_SERVER_URL="ws://127.0.0.1:${game_server_port}" \
  RESTORE_GAME_SERVER_ORIGIN="${test_origin}" RESTORE_DATABASE_URL="${restore_database_url}" \
  RESTORE_ACCESS_SECRET="${access_secret}" \
  pnpm --dir tests/load exec tsx verify-restored-room.ts)"
restore_duration_ms=$(( $(date +%s%3N) - restore_started_at_ms ))
encrypted_backup_bytes="$(stat -c %s "${task_tmp_dir}/backup.dump.enc")"

mkdir -p "$(dirname "${report_path}")"
cat >"${report_path}" <<JSON
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "postgresImage": "postgres:17.6-alpine",
  "cleanCluster": true,
  "encryptedBackup": true,
  "encryptedBackupBytes": ${encrypted_backup_bytes},
  "restoreDurationMs": ${restore_duration_ms},
  "sourceAndTargetFingerprintsMatch": true,
  "ledgerReconciliationMismatches": 0,
  "runtimeRoleBoundaryRestored": true,
  "activeRoomReconnect": ${restore_probe}
}
JSON
cat "${report_path}"
