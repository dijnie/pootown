#!/usr/bin/env bash

set -euo pipefail

readonly anchor_image="solanafoundation/anchor@sha256:21ab8a16e19df4301a198d7a55ab2988549aa2d996e6b5ad229c1d95b9f2d326"
readonly validator_name="pootown-legacy-characterization"
readonly rpc_url="http://127.0.0.1:8899"
readonly workspace_path="$(pwd)"
readonly host_uid="$(id -u)"
readonly host_gid="$(id -g)"
readonly program_binary_path="${workspace_path}/target/deploy/panda_monopoly.so"
readonly program_idl_path="${workspace_path}/target/idl/panda_monopoly.json"
readonly program_types_path="${workspace_path}/target/types/panda_monopoly.ts"
readonly magicblock_package_path="$(node -e '
  const { realpathSync } = require("node:fs");
  const { dirname } = require("node:path");
  process.stdout.write(
    realpathSync(
      dirname(
        require.resolve("@magicblock-labs/ephemeral-validator/package.json")
      )
    )
  );
')"

temporary_directory="$(mktemp -d /tmp/pootown-characterization-XXXXXX)"
validator_started=false

cleanup() {
  if [[ "${validator_started}" == true ]]; then
    docker stop --timeout 10 "${validator_name}" >/dev/null 2>&1 || true
  fi
  docker run --rm -v "${temporary_directory}:/cleanup" "${anchor_image}" \
    sh -lc 'find /cleanup -mindepth 1 -delete' >/dev/null 2>&1 || true
  rmdir "${temporary_directory}" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run the legacy Anchor characterization." >&2
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -Fxq "${validator_name}"; then
  echo "Validator container ${validator_name} is already running." >&2
  exit 1
fi

if ss -ltn '( sport = :8899 or sport = :8900 or sport = :9900 )' | tail -n +2 | grep -q .; then
  echo "Ports 8899, 8900, or 9900 are already in use." >&2
  exit 1
fi

mkdir -p "${workspace_path}/target"

if [[ ! -f "${program_binary_path}" || ! -f "${program_idl_path}" || ! -f "${program_types_path}" ]] || \
  find programs Cargo.toml Cargo.lock Anchor.toml -type f -newer "${program_binary_path}" -print -quit | grep -q .; then
  docker run --rm \
    -e HOST_UID="${host_uid}" \
    -e HOST_GID="${host_gid}" \
    -v "${workspace_path}:/workspace:ro" \
    -v "${workspace_path}/target:/workspace/target" \
    -w /workspace \
    "${anchor_image}" \
    sh -lc '
      anchor build
      build_status=$?
      chown -R "${HOST_UID}:${HOST_GID}" /workspace/target
      exit "${build_status}"
    '
fi

docker run --rm \
  -e HOST_UID="${host_uid}" \
  -e HOST_GID="${host_gid}" \
  -v "${temporary_directory}:/keys" \
  "${anchor_image}" \
  sh -lc '
    set -eu
    solana-keygen new --no-bip39-passphrase --silent --force -o /keys/id.json
    chown "${HOST_UID}:${HOST_GID}" /keys/id.json
    chmod 600 /keys/id.json
  '

docker run --detach --rm \
  --name "${validator_name}" \
  -p 8899:8899 \
  -p 8900:8900 \
  -p 9900:9900 \
  -v "${workspace_path}:/workspace:ro" \
  -v "${magicblock_package_path}:/magicblock:ro" \
  "${anchor_image}" \
  sh -lc '
    program_binary=$(find /workspace -type f -path "*/deploy/panda_monopoly.so" -print -quit)
    test -n "${program_binary}"
    set -- solana-test-validator \
      --reset \
      --bind-address 0.0.0.0 \
      --rpc-port 8899 \
      --faucet-port 9900 \
      --ledger /tmp/pootown-ledger \
      --bpf-program 4vucUqMcXN4sgLsgnrXTUC9U7ACZ5DmoRBLbWt4vrnyR "${program_binary}"
    for magicblock_program in /magicblock/bin/local-dumps/*.so; do
      program_id=$(basename "${magicblock_program}" .so)
      set -- "$@" --bpf-program "${program_id}" "${magicblock_program}"
    done
    for magicblock_account in /magicblock/bin/local-dumps/*.json; do
      account_id=$(basename "${magicblock_account}" .json)
      set -- "$@" --account "${account_id}" "${magicblock_account}"
    done
    exec "$@"
  ' >/dev/null
validator_started=true

for _attempt in $(seq 1 30); do
  if curl --silent --fail \
    --header 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
    "${rpc_url}" | grep -q '"ok"'; then
    break
  fi
  sleep 1
done

if ! curl --silent --fail \
  --header 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  "${rpc_url}" | grep -q '"ok"'; then
  docker logs "${validator_name}" >&2
  echo "Local Solana validator did not become healthy." >&2
  exit 1
fi

docker run --rm --network host \
  -v "${temporary_directory}:/keys:ro" \
  "${anchor_image}" \
  solana airdrop 20 --url "${rpc_url}" --keypair /keys/id.json >/dev/null

ANCHOR_PROVIDER_URL="${rpc_url}" \
ANCHOR_WALLET="${temporary_directory}/id.json" \
pnpm exec ts-mocha \
  -p ./tsconfig.json \
  -t 100000 \
  tests/characterization/**/*.test.ts
