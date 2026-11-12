#!/usr/bin/env bash
# Deploys relay/ to the Iran relay server over SSH, installs it (relay/install.sh: the key and port on
# the server are kept) and checks it answers.
#
#   npm run relay:deploy                         (RELAY_SSH=user@host in .env or the environment)
#
# Password-only server: RELAY_SSH_PASSWORD in .env (gitignored) is typed at the prompts (needs `expect`,
# built into macOS); otherwise your SSH key is used.
# Since relay v2 the relay forwards any public site (its generic route), so a new feature that reads
# another Iranian site needs RELAY_FOR on the app, not a redeploy.
set -euo pipefail
cd "$(dirname "$0")/.."
env_of() { [ -f .env ] && grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true; }
RELAY_SSH=${RELAY_SSH:-$(env_of RELAY_SSH)}
export RELAY_SSH_PASSWORD=${RELAY_SSH_PASSWORD:-$(env_of RELAY_SSH_PASSWORD)}
: "${RELAY_SSH:?Set RELAY_SSH=user@host (in .env or the environment)}"
DIR=${RELAY_DIR:-streetquest-relay-install}
OPTS=(-o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)

# With a password: typed by expect (never on the command line, never echoed).
run() { if [ -n "$RELAY_SSH_PASSWORD" ]; then expect scripts/lib/ssh-pass.exp "$@"; else "$@"; fi; }

node --check relay/relay.mjs
run ssh "${OPTS[@]}" "$RELAY_SSH" "mkdir -p $DIR"
run scp "${OPTS[@]}" -q relay/relay.mjs relay/install.sh "$RELAY_SSH:$DIR/"
run ssh "${OPTS[@]}" "$RELAY_SSH" "cd $DIR && if [ \"\$(id -u)\" = 0 ]; then PUBLIC_HOST=${RELAY_SSH#*@} bash install.sh; else sudo PUBLIC_HOST=${RELAY_SSH#*@} bash install.sh; fi"
