#!/usr/bin/env bash
# The product3d runner (GitHub, abroad) reaching the game's server in Iran. Iran drops HTTPS from abroad but lets SSH
# through, so: an SSH tunnel from this runner's 127.0.0.1:$TUNNEL_PORT to the server's own :443 (Caddy), and the site's
# name pointed at 127.0.0.1 in /etc/hosts — the worker then calls https://<site>:$TUNNEL_PORT with the real certificate,
# and nothing in the worker changes. The tunnel reconnects by itself if the SSH link drops during a long run.
#
# Needs: SERVER_SSH (root@<ip>), SERVER_SSH_KEY (the private key, same GitHub secrets the deploy uses), APP_URL.
# Writes APP_URL (the tunnelled address) to $GITHUB_ENV for the next steps. No SERVER_SSH → does nothing (the runner
# then calls APP_URL directly, e.g. a server reachable from abroad).
set -euo pipefail

if [ -z "${SERVER_SSH:-}" ]; then echo "No SERVER_SSH: calling $APP_URL directly"; exit 0; fi
: "${APP_URL:?APP_URL is needed}" "${SERVER_SSH_KEY:?SERVER_SSH_KEY is needed with SERVER_SSH}"
PORT=${TUNNEL_PORT:-8443}
HOST=$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$APP_URL")

umask 077
mkdir -p ~/.ssh
printf '%s\n' "$SERVER_SSH_KEY" > ~/.ssh/server_key
# A loop around ssh (no autossh needed): a dropped link comes back in a few seconds; the worker retries its calls.
nohup bash -c "while :; do ssh -i ~/.ssh/server_key -N -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  -o ExitOnForwardFailure=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=3 -o ConnectTimeout=20 \
  -L 127.0.0.1:$PORT:127.0.0.1:443 '$SERVER_SSH'; sleep 3; done" > /tmp/p3d-tunnel.log 2>&1 &

grep -q " $HOST\$" /etc/hosts || echo "127.0.0.1 $HOST" | sudo tee -a /etc/hosts > /dev/null
URL="https://$HOST:$PORT"
for i in $(seq 1 20); do
  # Any HTTP answer means the tunnel works (a sick app is the worker's problem to report, not the tunnel's).
  code=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$URL/api/health" 2>/dev/null || true)
  if [ -n "$code" ] && [ "$code" != 000 ]; then
    echo "Tunnel up: $URL → $SERVER_SSH:443"
    [ -n "${GITHUB_ENV:-}" ] && echo "APP_URL=$URL" >> "$GITHUB_ENV"
    exit 0
  fi
  sleep 3
done
echo "::error::No answer from $URL/api/health through the SSH tunnel to $SERVER_SSH"
cat /tmp/p3d-tunnel.log || true
exit 1
