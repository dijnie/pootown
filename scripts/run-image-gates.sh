#!/usr/bin/env bash

set -euo pipefail

readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly image_tag="${POOTOWN_IMAGE_TAG:-verification}"
readonly public_api_url="${POOTOWN_PUBLIC_API_URL:-http://localhost:3001}"
readonly public_game_server_url="${POOTOWN_PUBLIC_GAME_SERVER_URL:-ws://localhost:2567}"
readonly temporary_directory="$(mktemp -d -t pootown-image-gates-XXXXXX)"

cleanup() {
  rm -rf "${temporary_directory}"
}
trap cleanup EXIT

cd "${repository_root}"
docker build -f apps/api/Dockerfile -t "pootown-api:${image_tag}" .
docker build -f apps/game-server/Dockerfile -t "pootown-game-server:${image_tag}" .
docker build -f apps/web/Dockerfile \
  --build-arg "NEXT_PUBLIC_API_URL=${public_api_url}" \
  --build-arg "NEXT_PUBLIC_GAME_SERVER_URL=${public_game_server_url}" \
  -t "pootown-web:${image_tag}" .

for image in api game-server web; do
  image_reference="pootown-${image}:${image_tag}"
  if [[ "$(docker image inspect "${image_reference}" --format '{{.Config.User}}')" != "node" ]]; then
    echo "${image_reference} does not run as the non-root node user." >&2
    exit 1
  fi
  docker run --rm --entrypoint node "${image_reference}" --version | grep -Fx 'v24.18.0'
  docker run --rm --entrypoint sh "${image_reference}" -c \
    'find /app/node_modules/.pnpm -mindepth 1 -maxdepth 1 -type d -print | sort' \
    >"${temporary_directory}/${image}.runtime-packages.txt"
done

if grep -Eiq '(@solana\+|@coral-xyz\+|magicblock|@privy-io\+)' "${temporary_directory}"/*.runtime-packages.txt; then
  echo "A removed chain or Privy package remains in a runtime image." >&2
  exit 1
fi
