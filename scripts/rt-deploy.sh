#!/usr/bin/env bash
# Deploys the Street Arena realtime server to the relay box (realtime/install.sh does the work there,
# leaving the box's other apps alone and checking they still answer).
#
#   npm run rt:deploy
#
# From .env (gitignored): RELAY_SSH (+ RELAY_SSH_PASSWORD), RT_SECRET — that's all by default (the name is
# <box-ip>.sslip.io, its certificate proven from the box itself). Or RT_DOMAIN (a subdomain the
# domain's owner points here) + ACMEDNS_USERNAME/PASSWORD/SUBDOMAIN (auth.acme-dns.io/register) — or
# RT_DNS=desec + DEDYN_TOKEN, RT_DNS=dynu + DYNU_CLIENT_ID/SECRET for a domain hosted there;
# optional RT_APP_URL (default https://streetquest-free.vercel.app), RT_PORT (8791), RT_ORIGINS.
# Then Vercel needs RT_URL=wss://$RT_DOMAIN:8791 and the same RT_SECRET (production) + a redeploy.
set -euo pipefail
cd "$(dirname "$0")/.."
env_of() { [ -f .env ] && grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true; }
RELAY_SSH=${RELAY_SSH:-$(env_of RELAY_SSH)}
export RELAY_SSH_PASSWORD=${RELAY_SSH_PASSWORD:-$(env_of RELAY_SSH_PASSWORD)}
for k in RT_SECRET; do [ -n "${!k:-$(env_of $k)}" ] || { echo "Set $k in .env"; exit 1; }; done
: "${RELAY_SSH:?Set RELAY_SSH=user@host in .env}"
DIR=streetquest-rt-install
OPTS=(-o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)
run() { if [ -n "$RELAY_SSH_PASSWORD" ]; then expect scripts/lib/ssh-pass.exp "$@"; else "$@"; fi; }

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
# One file with everything (realtime/ imports the game's shared rules from src/).
npx esbuild realtime/server.ts --bundle --platform=node --target=node20 --format=esm --log-level=warning \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" --outfile="$out/rt.mjs"
umask 077
cat > "$out/secrets.env" <<EOF
RT_SECRET=${RT_SECRET:-$(env_of RT_SECRET)}
RT_DOMAIN=${RT_DOMAIN:-$(env_of RT_DOMAIN)}
RT_DNS=${RT_DNS:-$(env_of RT_DNS)}
DYNU_CLIENT_ID=${DYNU_CLIENT_ID:-$(env_of DYNU_CLIENT_ID)}
DYNU_SECRET=${DYNU_SECRET:-$(env_of DYNU_SECRET)}
DEDYN_TOKEN=${DEDYN_TOKEN:-$(env_of DEDYN_TOKEN)}
ACMEDNS_BASE_URL=${ACMEDNS_BASE_URL:-$(env_of ACMEDNS_BASE_URL)}
ACMEDNS_USERNAME=${ACMEDNS_USERNAME:-$(env_of ACMEDNS_USERNAME)}
ACMEDNS_PASSWORD=${ACMEDNS_PASSWORD:-$(env_of ACMEDNS_PASSWORD)}
ACMEDNS_SUBDOMAIN=${ACMEDNS_SUBDOMAIN:-$(env_of ACMEDNS_SUBDOMAIN)}
APP_URL=${RT_APP_URL:-$(env_of RT_APP_URL)}
PUBLIC_HOST=${RELAY_SSH#*@}
RT_PORT=${RT_PORT:-$(env_of RT_PORT)}
RT_ORIGINS=${RT_ORIGINS:-$(env_of RT_ORIGINS)}
EOF
sed -i '' -e 's|^APP_URL=$|APP_URL=https://streetquest-free.vercel.app|' "$out/secrets.env" 2>/dev/null || sed -i -e 's|^APP_URL=$|APP_URL=https://streetquest-free.vercel.app|' "$out/secrets.env"
cp realtime/install.sh realtime/acme-answer.mjs realtime/dns_sqself.sh "$out/"

run ssh "${OPTS[@]}" "$RELAY_SSH" "mkdir -p $DIR && chmod 700 $DIR"
run scp "${OPTS[@]}" -q "$out/rt.mjs" "$out/install.sh" "$out/acme-answer.mjs" "$out/dns_sqself.sh" "$out/secrets.env" "$RELAY_SSH:$DIR/"
run ssh "${OPTS[@]}" "$RELAY_SSH" "cd $DIR && bash install.sh"
