#!/usr/bin/env bash
# Installs relay.mjs as a service on an Ubuntu server in Iran (an ArvanCloud cloud server).
# From the repo, on your computer:
#
#   scp relay/relay.mjs relay/install.sh <user>@<server-ip>:
#   ssh -t <user>@<server-ip> sudo bash install.sh
#
# Run it again to update relay.mjs: the key is kept. It listens on port 80 (PORT=… to
# change), checks that Snappfood answers this server, and prints the SNAPPFOOD_URL to set.
set -euo pipefail
cd "$(dirname "$0")"
[ "$(id -u)" = 0 ] || { echo "Run as root: sudo bash install.sh"; exit 1; }
[ -f relay.mjs ] || { echo "relay.mjs must be next to install.sh"; exit 1; }

command -v node >/dev/null || { apt-get update -q && apt-get install -yq nodejs; }
node -e 'process.exit(+process.versions.node.split(".")[0] >= 18 ? 0 : 1)' \
  || { echo "Node 18+ is needed ($(node -v) found): use Ubuntu 24.04, or install a newer Node."; exit 1; }

install -D -m 644 relay.mjs /opt/streetquest-relay/relay.mjs
if [ ! -f /etc/streetquest-relay.env ]; then
  printf 'RELAY_KEY=%s\nPORT=%s\n' "$(openssl rand -hex 24)" "${PORT:-80}" > /etc/streetquest-relay.env
fi
chmod 600 /etc/streetquest-relay.env
# shellcheck disable=SC1091
. /etc/streetquest-relay.env

cat > /etc/systemd/system/streetquest-relay.service <<EOF
[Unit]
Description=StreetQuest relay for Snappfood, Torob and Divar
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=/etc/streetquest-relay.env
ExecStart=$(command -v node) /opt/streetquest-relay/relay.mjs
DynamicUser=yes
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable -q streetquest-relay
systemctl restart streetquest-relay
sleep 1

curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null || { journalctl -u streetquest-relay -n 20 --no-pager; exit 1; }
q="lat=35.699700&long=51.338000&optionalClient=WEBSITE&client=WEBSITE&deviceType=WEBSITE&appVersion=8.1.1&page=0&page_size=1"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://127.0.0.1:$PORT/$RELAY_KEY/snappfood/mobile/v3/restaurant/vendors-list?$q" || true)
echo "Relay is running. Snappfood answers this server with: $code (200 = good)."
ip=$(curl -s --max-time 5 https://ifconfig.io 2>/dev/null || hostname -I | cut -d' ' -f1)
port=$([ "$PORT" = 80 ] && echo "" || echo ":$PORT")
echo
echo "Set this on Vercel (production), then redeploy:"
echo "  SNAPPFOOD_URL=http://$ip$port/$RELAY_KEY/snappfood"
echo "With a domain on ArvanCloud CDN pointing here (HTTPS), use https://<that domain>/$RELAY_KEY/snappfood instead."
