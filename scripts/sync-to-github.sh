#!/bin/bash
set -euo pipefail

if [ -z "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
  echo "[sync] ERROR: GITHUB_PERSONAL_ACCESS_TOKEN is not set."
  exit 1
fi

git config user.email "replit-sync@users.noreply.github.com"
git config user.name "Replit Sync"

REMOTE_URL="https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/gshdhdg27-creator/TONYX-3.git"
git remote set-url origin "$REMOTE_URL"

STASHED=false
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[sync] Stashing uncommitted changes..."
  git stash --include-untracked
  STASHED=true
fi

restore_stash() {
  if [ "$STASHED" = true ]; then
    echo "[sync] Restoring stashed changes..."
    git stash pop || true
  fi
}
trap restore_stash EXIT

echo "[sync] Fetching latest from GitHub..."
git fetch origin main

LOCAL=$(git rev-parse main)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "[sync] Already up to date. Nothing to push."
  exit 0
fi

MERGE_BASE=$(git merge-base main origin/main)

if [ "$MERGE_BASE" = "$REMOTE" ]; then
  echo "[sync] Local is ahead of remote. Pushing..."
  git push origin main
  echo "[sync] Done at $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
else
  echo "[sync] Rebasing local onto remote then pushing..."
  git rebase origin/main
  git push origin main
  echo "[sync] Done at $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
fi
