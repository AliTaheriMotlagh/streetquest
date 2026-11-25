#!/usr/bin/env bash
# Deploys the Iran front door (front/front.mjs) to the relay box — front/install.sh does the work there,
# leaving the box's other apps alone and checking they still answer.
#
#   npm run front:deploy
#
# From .env (gitignored): RELAY_SSH (+ RELAY_SSH_PASSWORD) and FRONT_KEY — made and saved here on the first
# run. The app must have the same FRONT_KEY (Cloudflare: `npx wrangler secret put FRONT_KEY`), or every
# player through the front door counts as one address. Optional: FRONT_PORT (8443), FRONT_ORIGIN
# (https://streetquest.remixt.app), FRONT_CACHE_MB (1024).
set -euo pipefail
cd "$(dirname "$0")/.."
env_of() { [ -f .env ] && grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true; }
RELAY_SSH=${RELAY_SSH:-$(env_of RELAY_SSH)}
export RELAY_SSH_PASSWORD=${RELAY_SSH_PASSWORD:-$(env_of RELAY_SSH_PASSWORD)}
: "${RELAY_SSH:?Set RELAY_SSH=user@host in .env}"
FRONT_KEY=${FRONT_KEY:-$(env_of FRONT_KEY)}
if [ -z "$FRONT_KEY" ]; then
  FRONT_KEY=$(openssl rand -hex 24)
  printf '\nFRONT_KEY=%s\n' "$FRONT_KEY" >> .env
  echo "Made FRONT_KEY (saved in .env). Give the app the same one: npx wrangler secret put FRONT_KEY"
fi
DIR=streetquest-front-install
OPTS=(-o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)
run() { if [ -n "$RELAY_SSH_PASSWORD" ]; then expect scripts/lib/ssh-pass.exp "$@"; else "$@"; fi; }

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
umask 077
cat > "$out/secrets.env" <<EOF
FRONT_KEY=$FRONT_KEY
PUBLIC_HOST=${RELAY_SSH#*@}
FRONT_PORT=${FRONT_PORT:-$(env_of FRONT_PORT)}
FRONT_ORIGIN=${FRONT_ORIGIN:-$(env_of FRONT_ORIGIN)}
FRONT_CACHE_MB=${FRONT_CACHE_MB:-$(env_of FRONT_CACHE_MB)}
EOF
cp front/front.mjs front/install.sh "$out/"

run ssh "${OPTS[@]}" "$RELAY_SSH" "mkdir -p $DIR && chmod 700 $DIR"
run scp "${OPTS[@]}" -q "$out/front.mjs" "$out/install.sh" "$out/secrets.env" "$RELAY_SSH:$DIR/"
run ssh "${OPTS[@]}" "$RELAY_SSH" "cd $DIR && bash install.sh"
