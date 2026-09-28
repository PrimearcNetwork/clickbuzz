#!/usr/bin/env bash
# PRODUCTION deploy on the VPS: pull, build frontend, migrate, restart backend.
#
#   cd /var/www/clickbuzz && bash deploy/deploy.sh
#
# Steps can be skipped: SKIP_FRONTEND=1 / SKIP_BACKEND=1 / SKIP_MIGRATE=1.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/clickbuzz}"
API_URL="https://api.clickbuz.in"
cd "$APP_DIR"

echo "==> git pull"
git pull --ff-only

if [[ "${SKIP_FRONTEND:-}" != "1" ]]; then
    echo "==> Frontend build"
    npm ci --no-audit --no-fund
    # Vite never overrides a variable already in the environment, so this wins
    # over any stale VITE_API_URL in the .env files (e.g. the old Render URL).
    # The other VITE_* values (GA4, GTM, Meta Pixel) come from $APP_DIR/.env.
    VITE_API_URL="$API_URL" npx vite build --outDir dist.new --emptyOutDir
    if ! grep -rq "$API_URL" dist.new/assets; then
        echo "Build does not reference $API_URL — aborting, dist/ untouched." >&2
        exit 1
    fi
    if grep -rqE "onrender\.com|localhost:5000" dist.new/assets; then
        echo "Build references an old/local API host — aborting, dist/ untouched." >&2
        exit 1
    fi
    # Copy the new build over the live one WITHOUT deleting old hashed chunks,
    # so tabs opened before this deploy can still lazy-load their pages.
    mkdir -p dist
    cp -a dist.new/. dist/
    rm -rf dist.new
    # Old chunks are pruned after a week.
    find dist/assets -type f -mtime +7 -delete
fi

if [[ "${SKIP_BACKEND:-}" != "1" ]]; then
    echo "==> Backend dependencies"
    (cd backend && npm ci --no-audit --no-fund)

    if [[ "${SKIP_MIGRATE:-}" != "1" ]]; then
        echo "==> Migrations"
        (cd backend && NODE_ENV=production ENV_FILE=.env npm run --silent migrate:status && NODE_ENV=production ENV_FILE=.env npm run --silent migrate)
    fi

    echo "==> Restart backend"
    # Fork mode (see deploy/ecosystem.config.cjs) — a reload is a restart,
    # expect a few seconds of 502s while the primary syncs and forks workers.
    # First switch from a hand-started process to this file is a one-time
    # `pm2 delete clickbuzz-backend && pm2 start deploy/ecosystem.config.cjs`.
    pm2 startOrRestart deploy/ecosystem.config.cjs --only clickbuzz-backend --update-env
    pm2 save
fi

echo "==> Health checks"
sleep 8
curl -fsS -o /dev/null -w "frontend %{http_code}\n" https://clickbuz.in/
curl -fsS -o /dev/null -w "api      %{http_code}\n" "$API_URL/api/subscription-plans?active=1"
pm2 status clickbuzz-backend
