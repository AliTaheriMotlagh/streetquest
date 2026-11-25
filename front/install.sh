#!/usr/bin/env bash
# Installs the Iran front door (front.mjs) on the relay box, next to the realtime server whose sslip.io
# certificate it shares. It only adds, and checks the box's other apps still answer afterwards:
#   - service `streetquest-front` as its own user, port 8443 (FRONT_PORT), capped at 200 MB / half a CPU
#     and low priority, so it can never starve the box's other apps (the OOM killer picks it early);
#   - build files kept in /var/cache/streetquest-front (FRONT_CACHE_MB, default 1024);
#   - needs the realtime server's certificate (/etc/streetquest-rt/tls): run `npm run rt:deploy` first.
# Reads ./secrets.env (FRONT_KEY, PUBLIC_HOST[, FRONT_PORT, FRONT_ORIGIN, FRONT_CACHE_MB]) and deletes it.
# Re-run to update. Removal: systemctl disable --now streetquest-front.
set -euo pipefail
cd "$(dirname "$0")"
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
[ -f secrets.env ] || { echo "secrets.env missing (scripts/front-deploy.sh writes it)."; exit 1; }
# shellcheck disable=SC1091
. ./secrets.env
rm -f secrets.env
: "${FRONT_KEY:?}" "${PUBLIC_HOST:?}"
PORT=${FRONT_PORT:-8443}
ORIGIN=${FRONT_ORIGIN:-https://streetquest.remixt.app}
DOMAIN=$(echo "$PUBLIC_HOST" | tr . -).sslip.io
TLS=/etc/streetquest-rt/tls
HOME_DIR=/opt/streetquest-front
ENV_FILE=/etc/streetquest-front.env
[ -s "$TLS/fullchain.pem" ] && [ -s "$TLS/key.pem" ] || { echo "No certificate in $TLS — run npm run rt:deploy first."; exit 1; }
command -v node >/dev/null || { echo "Node is needed."; exit 1; }

# ---------------------------------------------------------------- the box's other apps, before
others() { ss -ltnH | awk '{print $4}' | grep -v ":$PORT\$" | sort -u; }
answers() { curl -s -o /dev/null -w '%{http_code}' --max-time 8 -k "$1" || echo 000; }
BEFORE_PORTS=$(others)
BEFORE_80=$(answers http://127.0.0.1/); BEFORE_443=$(answers https://127.0.0.1/)
if ss -ltnpH | grep -q ":$PORT " && ! systemctl is-active -q streetquest-front; then
  echo "Port $PORT is used by something else — pick another FRONT_PORT."; exit 1
fi

# ---------------------------------------------------------------- files and user
id streetquest-front >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin streetquest-front
usermod -aG streetquest-rt streetquest-front # reads the shared certificate
install -d -m 755 "$HOME_DIR" && install -m 644 front.mjs "$HOME_DIR/"
umask 077
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=$PORT
ORIGIN=$ORIGIN
PUBLIC_ORIGIN=https://$DOMAIN:$PORT
FRONT_KEY=$FRONT_KEY
TLS_CERT=$TLS/fullchain.pem
TLS_KEY=$TLS/key.pem
CACHE_DIR=/var/cache/streetquest-front
CACHE_MB=${FRONT_CACHE_MB:-1024}
EOF
umask 022
cat > /etc/systemd/system/streetquest-front.service <<EOF
[Unit]
Description=StreetQuest Iran front door (https://$DOMAIN:$PORT → $ORIGIN)
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) --max-old-space-size=150 $HOME_DIR/front.mjs
User=streetquest-front
Group=streetquest-front
SupplementaryGroups=streetquest-rt
CacheDirectory=streetquest-front
Restart=always
RestartSec=3
# Never at the other apps' expense: capped, low priority, early to go if memory runs out.
MemoryHigh=160M
MemoryMax=200M
CPUQuota=50%
Nice=5
OOMScoreAdjust=700
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable -q streetquest-front
systemctl restart streetquest-front

# ---------------------------------------------------------------- checks (undo if the box's other apps changed)
rollback() { echo "$1 — stopping the front door."; systemctl disable --now streetquest-front; exit 1; }
ok=""
for _ in $(seq 1 20); do
  curl -fsk --max-time 3 "https://127.0.0.1:$PORT/__front/health" >/dev/null && { ok=1; break; }
  sleep 1
done
[ -n "$ok" ] || { journalctl -u streetquest-front -n 30 --no-pager; rollback "It didn't start"; }
[ "$(others)" = "$BEFORE_PORTS" ] || rollback "Another app's ports changed"
[ "$(answers http://127.0.0.1/)" = "$BEFORE_80" ] && [ "$(answers https://127.0.0.1/)" = "$BEFORE_443" ] || rollback "Ports 80/443 answer differently"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 40 --resolve "$DOMAIN:$PORT:127.0.0.1" "https://$DOMAIN:$PORT/api/health" || echo 000)
echo "Front door v$(curl -fsk "https://127.0.0.1:$PORT/__front/health" | sed -n 's/.*"version":\([0-9]*\).*/\1/p') is running: https://$DOMAIN:$PORT"
echo "The game answers through it with: $code (200 = good; the app needs the same FRONT_KEY as a secret)."
