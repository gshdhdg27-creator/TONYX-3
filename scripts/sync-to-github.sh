#!/bin/bash
set -euo pipefail

if [ -z "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
  echo "[sync] ERROR: GITHUB_PERSONAL_ACCESS_TOKEN is not set."
  exit 1
fi

git config user.email "replit-sync@users.noreply.github.com"
git config user.name "Replit Sync"

ASKPASS=$(mktemp)
chmod 700 "$ASKPASS"
printf '#!/bin/sh\necho "%s"\n' "${GITHUB_PERSONAL_ACCESS_TOKEN}" > "$ASKPASS"

cleanup() {
  rm -f "$ASKPASS"
  if [ "${STASHED:-false}" = true ]; then
    echo "[sync] Restoring stashed changes..."
    git stash pop || true
  fi
}
trap cleanup EXIT

STASHED=false
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[sync] Stashing uncommitted changes..."
  git stash --include-untracked
  STASHED=true
fi

echo "[sync] Fetching latest from GitHub..."
GIT_ASKPASS="$ASKPASS" GIT_USERNAME="x-access-token" git fetch origin main

LOCAL=$(git rev-parse main)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "[sync] Already up to date. Nothing to push."
  exit 0
fi

MERGE_BASE=$(git merge-base main origin/main)

if [ "$MERGE_BASE" = "$REMOTE" ]; then
  echo "[sync] Local is ahead of remote. Pushing..."
  GIT_ASKPASS="$ASKPASS" GIT_USERNAME="x-access-token" git push origin main
else
  echo "[sync] Rebasing local onto remote then pushing..."
  git rebase origin/main
  GIT_ASKPASS="$ASKPASS" GIT_USERNAME="x-access-token" git push origin main
fi

echo "[sync] Done at $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

if [ -n "${VERCEL_DEPLOY_HOOK_URL:-}" ]; then
  echo "[sync] Triggering Vercel deployment..."
  HTTP_STATUS=$(curl -s -o /tmp/vercel_response.txt -w "%{http_code}" -X POST "${VERCEL_DEPLOY_HOOK_URL}")
  if [ "$HTTP_STATUS" = "201" ]; then
    echo "[sync] Vercel deployment triggered successfully."
  else
    echo "[sync] WARNING: Vercel hook returned HTTP ${HTTP_STATUS}: $(cat /tmp/vercel_response.txt)"
  fi
else
  echo "[sync] VERCEL_DEPLOY_HOOK_URL not set — skipping Vercel trigger."
fi
