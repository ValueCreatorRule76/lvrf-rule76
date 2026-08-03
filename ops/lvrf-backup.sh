#!/bin/bash
set -euo pipefail
umask 077
STAMP=$(date +%Y%m%d-%H%M%S)
sudo -u postgres pg_dump -Fc lvrf > /var/backups/lvrf/lvrf-$STAMP.dump
find /var/backups/lvrf -name '*.dump' -mtime +14 -delete
