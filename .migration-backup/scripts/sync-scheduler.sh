#!/bin/bash
INTERVAL=${SYNC_INTERVAL_SECONDS:-3600}

echo "[scheduler] GitHub sync starting. Interval: ${INTERVAL}s"

while true; do
  bash "$(dirname "$0")/sync-to-github.sh" || echo "[scheduler] Push failed, will retry next cycle."
  echo "[scheduler] Next sync in ${INTERVAL}s..."
  sleep "$INTERVAL"
done
