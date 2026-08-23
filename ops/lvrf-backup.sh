#!/bin/bash
set -euo pipefail
umask 077
STAMP=$(date +%Y%m%d-%H%M%S)
DEST=/var/backups/lvrf/lvrf-$STAMP.dump
TMP=$DEST.partial
sudo -u postgres pg_dump -Fc lvrf > "$TMP"
TOC=$(pg_restore --list "$TMP" | wc -l)
if [ "$TOC" -lt 50 ]; then
  echo "lvrf-backup: FAILED - only $TOC TOC entries, left $TMP" >&2
  exit 1
fi
mv "$TMP" "$DEST"
echo "lvrf-backup: OK $DEST $(stat -c %s "$DEST") bytes, $TOC entries"
find /var/backups/lvrf \( -name '*.dump' -o -name '*.partial' \) -mtime +14 -delete
