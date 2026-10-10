#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  set -- node server.js
fi

# Schema load and other one-off commands skip the data volume.
if [ "$1" = "node" ] && [ "${2:-}" != "server.js" ]; then
  exec "$@"
fi

mkdir -p /app/data/reports /app/data/seed
if [ -f /opt/virtusp-data/schema.sql ]; then
  cp -f /opt/virtusp-data/schema.sql /app/data/schema.sql
fi
if [ -d /opt/virtusp-data/seed ]; then
  cp -a /opt/virtusp-data/seed/. /app/data/seed/
fi

exec "$@"
