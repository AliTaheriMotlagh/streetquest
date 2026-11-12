#!/usr/bin/env bash
# Deploys relay/ to the Iran relay server over SSH, installs it (relay/install.sh: the key and port on
# the server are kept) and checks it answers.
#
#   npm run relay:deploy                         (RELAY_SSH=user@host in .env or the environment)
#
# Once per computer, so it never asks for a password again:  ssh-copy-id <user>@<host>
# Since relay v2 the relay forwards any public site (its generic route), so a new feature that reads
# another Iranian site needs RELAY_FOR on the app, not a redeploy.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${RELAY_SSH:-}" ] && [ -f .env ]; then RELAY_SSH=$(grep -E '^RELAY_SSH=' .env | head -1 | cut -d= -f2- | tr -d '"' || true); fi
: "${RELAY_SSH:?Set RELAY_SSH=user@host (in .env or the environment)}"
DIR=${RELAY_DIR:-streetquest-relay-install}
OPTS=(-o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)

node --check relay/relay.mjs
ssh "${OPTS[@]}" "$RELAY_SSH" "mkdir -p $DIR"
scp "${OPTS[@]}" -q relay/relay.mjs relay/install.sh "$RELAY_SSH:$DIR/"
ssh "${OPTS[@]}" "$RELAY_SSH" "cd $DIR && if [ \"\$(id -u)\" = 0 ]; then bash install.sh; else sudo bash install.sh; fi"
