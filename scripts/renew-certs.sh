#!/usr/bin/env bash
# scripts/renew-certs.sh — Renew SSL certificates and update Docker volume
# Add to crontab: 0 3 * * * /home/arelyx/PlottedPlant/scripts/renew-certs.sh >> /var/log/certbot-renew.log 2>&1

set -euo pipefail

# Renew certificates
certbot renew --quiet

# Copy renewed certs to Docker volume
docker run --rm \
    -v plantuml_certbot_certs:/etc/letsencrypt \
    -v /etc/letsencrypt:/host-certs:ro \
    alpine sh -c "cp -a /host-certs/. /etc/letsencrypt/"

# Reload nginx to pick up new certs
docker exec plantuml-nginx nginx -s reload 2>/dev/null || true
