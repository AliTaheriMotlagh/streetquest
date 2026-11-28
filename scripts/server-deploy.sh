#!/usr/bin/env bash
# Puts the whole game on one Linux server (an Arvan cloud server is the cheap choice — README → "One server"):
# builds the Docker image here (linux/amd64), copies it over SSH (no registry: Docker Hub / GHCR refuse Iran) and
# starts docker/compose.yml there — app, Street Arena realtime, daily cleanup, Postgres + nightly backups, HTTPS.
#
#   npm run server:deploy
#
# From .env (gitignored): SERVER_SSH=root@<ip> (+ SERVER_SSH_KEY_FILE=<path to the .pem Arvan gave you>, or
# SERVER_SSH_PASSWORD if the box takes passwords).
# The server's settings live in .env.server (gitignored), made here on the first run with fresh secrets;
# add the rest of your keys there (Stripe, map tiles, VAPID, …) and run again. Optional: SERVER_DOMAIN
# (default <ip>.sslip.io — works without buying a domain).
set -euo pipefail
cd "$(dirname "$0")/.."
env_of() { [ -f "${2:-.env}" ] && grep -E "^$1=" "${2:-.env}" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true; }
SERVER_SSH=${SERVER_SSH:-$(env_of SERVER_SSH)}
export SERVER_SSH_PASSWORD=${SERVER_SSH_PASSWORD:-$(env_of SERVER_SSH_PASSWORD)}
KEY=${SERVER_SSH_KEY_FILE:-$(env_of SERVER_SSH_KEY_FILE)}; KEY=${KEY/#\~/$HOME}
: "${SERVER_SSH:?Set SERVER_SSH=root@<server-ip> in .env}"
HOST=${SERVER_SSH#*@}
ENVF=.env.server
DOMAIN=${SERVER_DOMAIN:-$(env_of SITE_DOMAIN $ENVF)}
DOMAIN=${DOMAIN:-$(echo "$HOST" | tr . -).sslip.io}

if [ ! -f $ENVF ]; then
  [ -n "${CI:-}" ] && { echo "$ENVF is missing (GitHub secret SERVER_ENV)."; exit 1; }
  umask 077
  cat > $ENVF <<EOF
# The one server's settings (scripts/server-deploy.sh copies this to the server as .env). Gitignored.
# Copy in the rest of your production keys from .env.example (Stripe, map tiles, VAPID, AI, …).
SITE_DOMAIN=$DOMAIN
NEXT_PUBLIC_SITE_URL=https://$DOMAIN
RT_URL=wss://$DOMAIN/rt
RT_ORIGINS=https://$DOMAIN
POSTGRES_PASSWORD=$(openssl rand -hex 24)
AUTH_SECRET=$(openssl rand -base64 32)
RT_SECRET=$(openssl rand -hex 32)
ADMIN_KEY=$(openssl rand -hex 16)
CRON_SECRET=$(openssl rand -hex 24)
EOF
  echo "Made $ENVF with fresh secrets (admin: https://$DOMAIN/admin?key=$(env_of ADMIN_KEY $ENVF))."
fi
SITE_URL=$(env_of NEXT_PUBLIC_SITE_URL $ENVF); SITE_URL=${SITE_URL:-https://$DOMAIN}
RT=$(env_of RT_URL $ENVF)

OPTS=(-o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30)
if [ -n "$KEY" ]; then chmod 600 "$KEY"; OPTS+=(-i "$KEY" -o IdentitiesOnly=yes); fi
run() { if [ -n "$SERVER_SSH_PASSWORD" ]; then expect scripts/lib/ssh-pass.exp "$@"; else "$@"; fi; }
DIR=streetquest

# Docker Hub answers 403 from Iran: take the same official Node image from AWS's or Arvan's mirror instead.
NODE_IMAGE=node:22-bookworm-slim
for src in "$NODE_IMAGE" "public.ecr.aws/docker/library/$NODE_IMAGE" "docker.arvancloud.ir/$NODE_IMAGE"; do
  docker buildx imagetools inspect "$src" >/dev/null 2>&1 && { NODE_IMAGE=$src; break; }
done
echo "▸ Building the image for linux/amd64 (a few minutes; slower on an Apple-silicon Mac)"
docker buildx build --platform linux/amd64 --load -t streetquest:latest \
  --build-arg NODE_IMAGE="$NODE_IMAGE" --build-arg NEXT_PUBLIC_SITE_URL="$SITE_URL" --build-arg NEXT_PUBLIC_RT_URL="$RT" \
  --build-arg BUILD_SHA="$(git rev-parse --short=12 HEAD 2>/dev/null || date +%s)" .

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
images=(streetquest:latest)
# Postgres only on the first deploy (or a new version): the server can't pull from Docker Hub.
for img in postgres:16-alpine; do
  if ! run ssh "${OPTS[@]}" "$SERVER_SSH" "docker image inspect $img >/dev/null 2>&1"; then
    # Docker Hub times out from Iran: fall back to the same official images on AWS's and Arvan's mirrors.
    for src in "$img" "public.ecr.aws/docker/library/$img" "docker.arvancloud.ir/$img"; do
      docker pull -q --platform linux/amd64 "$src" >/dev/null 2>&1 && docker tag "$src" "$img" && { images+=("$img"); break; }
    done
    [[ " ${images[*]} " == *" $img "* ]] || { echo "Couldn't download $img from any mirror."; exit 1; }
  fi
done
# Caddy with the Cloudflare DNS plugin, rebuilt only when docker/caddy.Dockerfile changes.
CADDY_TAG=$(git hash-object docker/caddy.Dockerfile | cut -c1-12)
if ! run ssh "${OPTS[@]}" "$SERVER_SSH" "docker image inspect streetquest-caddy:$CADDY_TAG >/dev/null 2>&1"; then
  echo "▸ Building Caddy with the Cloudflare DNS plugin"
  CB=caddy:2-builder; CA=caddy:2-alpine
  docker buildx imagetools inspect "$CB" >/dev/null 2>&1 || { CB=public.ecr.aws/docker/library/$CB; CA=public.ecr.aws/docker/library/$CA; }
  docker buildx build --platform linux/amd64 --load -t "streetquest-caddy:$CADDY_TAG" \
    --build-arg CADDY_BUILDER="$CB" --build-arg CADDY_BASE="$CA" -f docker/caddy.Dockerfile docker
  images+=("streetquest-caddy:$CADDY_TAG")
fi
echo "▸ Packing ${images[*]}"
docker save "${images[@]}" | gzip -1 > "$out/images.tar.gz"
cp docker/compose.yml docker/Caddyfile docker/install.sh "$out/"
(umask 077; cp $ENVF "$out/.env"; grep -q '^SITE_DOMAIN=' "$out/.env" || echo "SITE_DOMAIN=$DOMAIN" >> "$out/.env"; echo "CADDY_TAG=$CADDY_TAG" >> "$out/.env")

echo "▸ Copying to $HOST ($(du -h "$out/images.tar.gz" | cut -f1))"
run ssh "${OPTS[@]}" "$SERVER_SSH" "mkdir -p $DIR && chmod 700 $DIR"
run scp "${OPTS[@]}" -q "$out/images.tar.gz" "$out/compose.yml" "$out/Caddyfile" "$out/install.sh" "$out/.env" "$SERVER_SSH:$DIR/"
run ssh "${OPTS[@]}" "$SERVER_SSH" "cd $DIR && bash install.sh"
# Checked on the server itself, through Caddy and its real certificate: from abroad (GitHub) Iran drops the traffic.
echo -n "▸ HTTPS"
for i in $(seq 1 40); do
  if run ssh "${OPTS[@]}" "$SERVER_SSH" "curl -fsS -m 10 -o /dev/null --resolve $DOMAIN:443:127.0.0.1 https://$DOMAIN/"; then
    echo " — OK"; echo "✔ Live at https://$DOMAIN"; exit 0
  fi
  echo -n "."; sleep 6
done
echo; run ssh "${OPTS[@]}" "$SERVER_SSH" "cd $DIR && docker compose logs --tail 15 caddy" || true
echo "✘ No valid HTTPS at https://$DOMAIN yet (Iran blocks Let's Encrypt from abroad: set CADDY_TLS=cloudflare + CF_DNS_API_TOKEN, README → \"One server\")."
exit 1
