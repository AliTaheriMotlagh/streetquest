#!/usr/bin/env bash
# Runs on the server (scripts/server-deploy.sh copies it next to compose.yml, Caddyfile, .env, images.tar.gz).
# First time: installs Docker from the Ubuntu/Debian mirror (download.docker.com refuses Iran) and adds swap on
# small boxes. Every time: loads the images, starts or updates the stack, checks the app answers.
set -euo pipefail
cd "$(dirname "$0")"
SUDO=; [ "$(id -u)" = 0 ] || SUDO=sudo

if ! command -v docker >/dev/null 2>&1; then
  echo "▸ Installing Docker"
  $SUDO apt-get update -qq
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io >/dev/null
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-compose-v2 >/dev/null 2>&1 \
    || $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-compose-plugin >/dev/null
  $SUDO systemctl enable --now docker
fi
docker() { if [ -n "$SUDO" ]; then sudo docker "$@"; else command docker "$@"; fi; }

# Under 3 GB of memory: 2 GB of swap so a busy moment doesn't kill Postgres or the app.
if [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 3000 ] && ! $SUDO swapon --show | grep -q .; then
  echo "▸ Adding 2 GB swap"
  $SUDO fallocate -l 2G /swapfile && $SUDO chmod 600 /swapfile && $SUDO mkswap /swapfile >/dev/null && $SUDO swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
fi

echo "▸ Loading images"
gunzip -c images.tar.gz | docker load -q
rm -f images.tar.gz
mkdir -p backups
chmod 600 .env

echo "▸ Starting"
docker compose up -d --remove-orphans
docker image prune -f >/dev/null

echo -n "▸ Waiting for the app"
for i in $(seq 1 60); do
  if docker compose exec -T app node -e "fetch('http://localhost:3000/robots.txt').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null; then
    echo " — up"; docker compose ps --format 'table {{.Service}}\t{{.Status}}'; exit 0
  fi
  echo -n "."; sleep 3
done
echo; docker compose logs --tail 60 app; exit 1
