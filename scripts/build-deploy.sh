#!/usr/bin/env bash
set -e

echo "=== [1/3] Installing workspace dependencies ==="
pnpm install

echo "=== [2/3] Building web frontend ==="
cd artifacts/web
pnpm run build
cd ../..

echo "=== [3/3] Building API server ==="
cd artifacts/api-server
pnpm run build
cd ../..

echo "=== Build complete ==="
