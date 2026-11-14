#!/bin/bash
# /usr/local/bin/lvrf-offsite.sh - copy the newest verified nightly dump off the box.
# Runs after lvrf-backup.sh. Encrypted on the box by the rclone crypt remote
# "lvrf-offsite"; the bucket never sees plaintext. The bucket has Object Lock
# (Compliance, 30 days), so no key, this box's included, can erase a copy
# younger than 30 days; the bucket's lifecycle rule does the pruning.
set -euo pipefail
umask 077
CONF=/root/.config/rclone/rclone.conf
REMOTE=lvrf-offsite:nightly
SRC=$(ls -t /var/backups/lvrf/lvrf-*.dump 2>/dev/null | head -1 || true)
if [ -z "$SRC" ]; then
  echo "lvrf-offsite: FAILED - no dump in /var/backups/lvrf" >&2
  exit 1
fi
AGE=$(( $(date +%s) - $(stat -c %Y "$SRC") ))
if [ "$AGE" -gt 93600 ]; then
  echo "lvrf-offsite: FAILED - newest dump $SRC is $((AGE / 3600))h old; check lvrf-backup" >&2
  exit 1
fi
NAME=$(basename "$SRC")
LOCAL_SIZE=$(stat -c %s "$SRC")
rclone --config "$CONF" copyto "$SRC" "$REMOTE/$NAME"
REMOTE_SIZE=$(rclone --config "$CONF" lsf --format s "$REMOTE/$NAME")
if [ "$REMOTE_SIZE" != "$LOCAL_SIZE" ]; then
  echo "lvrf-offsite: FAILED - $NAME is $LOCAL_SIZE bytes here, ${REMOTE_SIZE:-missing} off-site" >&2
  exit 1
fi
echo "lvrf-offsite: OK $NAME $LOCAL_SIZE bytes"
