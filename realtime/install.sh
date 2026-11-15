#!/usr/bin/env bash
# Installs the Street Arena realtime server (rt.mjs, bundled by scripts/rt-deploy.sh) on a server that
# already runs other things — it only adds, and checks they still answer afterwards:
#   - service `streetquest-rt` as its own user, port 8791 (RT_PORT), capped at 300 MB / half a CPU
#     and lowest priority, so it can never starve the box's other apps (the OOM killer picks it first);
#   - TLS for wss:// on RT_DOMAIN by a Let's Encrypt DNS challenge (no port 80/443 needed). Iran filters
#     every free dynamic-DNS name tried (DuckDNS, dynv6, all of Dynu's free domains, mooo.com…), so:
#     RT_DNS=self (default) — <a-b-c-d>.sslip.io: sslip.io delegates its _acme-challenge name to the
#     address itself, so this server answers Let's Encrypt on port 53 (acme-answer.mjs + dns_sqself.sh,
#     only during issuance). Nothing to sign up for. Or RT_DNS=acmedns — a subdomain of a real domain whose owner adds an A record → PUBLIC_HOST
#     and CNAME _acme-challenge.<RT_DOMAIN> → ACMEDNS_FULLDOMAIN (free auth.acme-dns.io); or
#     RT_DNS=desec / dynu — a domain hosted there (the A record is then set from here);
#     renewed daily by its own timer `streetquest-rt-renew`; the server reloads it without a restart.
# Reads ./secrets.env (RT_SECRET, RT_DOMAIN, APP_URL, PUBLIC_HOST, the DNS provider's ACMEDNS_* /
# DEDYN_TOKEN / DYNU_CLIENT_ID + DYNU_SECRET[, RT_DNS, RT_PORT, RT_ORIGINS]) and deletes it. Re-run to update. Removal: systemctl disable --now streetquest-rt streetquest-rt-renew.timer.
set -euo pipefail
cd "$(dirname "$0")"
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
[ -f secrets.env ] || { echo "secrets.env missing (scripts/rt-deploy.sh writes it)."; exit 1; }
# shellcheck disable=SC1091
. ./secrets.env
rm -f secrets.env
PORT=${RT_PORT:-8791}
: "${RT_SECRET:?}" "${APP_URL:?}" "${PUBLIC_HOST:?}"
RT_DNS=${RT_DNS:-self}
[ "$RT_DNS" = self ] && RT_DOMAIN=${RT_DOMAIN:-$(echo "$PUBLIC_HOST" | tr . -).sslip.io}
: "${RT_DOMAIN:?}"
case $RT_DNS in
  self) DNS_ENV=(SQ=1)
    # The DNS answer comes from the address the name points at: it must be this machine's.
    ip -4 -o addr show | grep -q " $PUBLIC_HOST/" || { echo "$PUBLIC_HOST isn't on this server's interfaces."; exit 1; }
    ss -lnuH | awk '{print $4}' | grep -qx "$PUBLIC_HOST:53\|0.0.0.0:53\|\*:53" && { echo "Port 53 on $PUBLIC_HOST is taken."; exit 1; } ;;
  acmedns) : "${ACMEDNS_USERNAME:?}" "${ACMEDNS_PASSWORD:?}" "${ACMEDNS_SUBDOMAIN:?}"
    DNS_ENV=(ACMEDNS_BASE_URL="${ACMEDNS_BASE_URL:-https://auth.acme-dns.io}" ACMEDNS_USERNAME="$ACMEDNS_USERNAME" ACMEDNS_PASSWORD="$ACMEDNS_PASSWORD" ACMEDNS_SUBDOMAIN="$ACMEDNS_SUBDOMAIN") ;;
  dynu) : "${DYNU_CLIENT_ID:?}" "${DYNU_SECRET:?}"; DNS_ENV=(Dynu_ClientId="$DYNU_CLIENT_ID" Dynu_Secret="$DYNU_SECRET") ;;
  desec) : "${DEDYN_TOKEN:?}"; DNS_ENV=(DEDYN_TOKEN="$DEDYN_TOKEN") ;;
  *) echo "RT_DNS: self, acmedns, desec or dynu"; exit 1 ;;
esac
ACME_VERSION=3.1.6
HOME_DIR=/opt/streetquest-rt
CONF=/etc/streetquest-rt
TLS=$CONF/tls
ACME=(env "${DNS_ENV[@]}" "$HOME_DIR/acme/acme.sh" --home "$HOME_DIR/acme" --config-home "$CONF/acme")

# ---------------------------------------------------------------- the box's other apps, before
# Whatever listens now (except us) must still listen afterwards; every local web answer must too.
others() { ss -ltnH | awk '{print $4}' | grep -v ":$PORT\$" | sort -u; }
answers() { curl -s -o /dev/null -w '%{http_code}' --max-time 8 -k "$1" || echo 000; }
BEFORE_PORTS=$(others)
BEFORE_80=$(answers http://127.0.0.1/); BEFORE_443=$(answers https://127.0.0.1/)
if ss -ltnpH | grep -q ":$PORT " && ! ss -ltnpH | grep ":$PORT " | grep -q node; then
  echo "Port $PORT is used by something else — pick another RT_PORT."; exit 1
fi
command -v node >/dev/null || { echo "Node is needed."; exit 1; }

# ---------------------------------------------------------------- files and user
id streetquest-rt >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin streetquest-rt
install -d -m 755 "$HOME_DIR" && install -m 644 rt.mjs acme-answer.mjs "$HOME_DIR/"
# The service's user may pass through $CONF (its env file stays root-only) and read $TLS.
install -d -m 750 "$CONF" "$TLS" && chown root:streetquest-rt "$CONF" "$TLS"

# ---------------------------------------------------------------- name → this server
# (The box's outgoing address can differ from the one players reach: PUBLIC_HOST says which.)
if [ "$RT_DNS" = self ]; then
  : # sslip.io: the name is the address
elif [ "$RT_DNS" = acmedns ]; then
  # The domain's owner keeps its records: check they're there (through Iran's resolvers, as players see it).
  got=$(getent ahostsv4 "$RT_DOMAIN" | head -1 | awk '{print $1}')
  [ "$got" = "$PUBLIC_HOST" ] || { echo "$RT_DOMAIN resolves to '${got:-nothing}', not $PUBLIC_HOST: add its A record (no CDN proxy) first."; exit 1; }
elif [ "$RT_DNS" = dynu ]; then
  tok=$(curl -fsS --max-time 20 -u "$DYNU_CLIENT_ID:$DYNU_SECRET" https://api.dynu.com/v2/oauth2/token | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
  [ -n "$tok" ] || { echo "Dynu didn't accept the API client id/secret."; exit 1; }
  id=$(curl -fsS --max-time 20 -H "Authorization: Bearer $tok" https://api.dynu.com/v2/dns | tr '{' '\n' | grep -i "\"name\":\"$RT_DOMAIN\"" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
  [ -n "$id" ] || { echo "$RT_DOMAIN isn't in this Dynu account (DDNS Services → Add)."; exit 1; }
  curl -fsS --max-time 20 -o /dev/null -X POST "https://api.dynu.com/v2/dns/$id" -H "Authorization: Bearer $tok" -H "content-type: application/json" \
    -d "{\"name\":\"$RT_DOMAIN\",\"ipv4Address\":\"$PUBLIC_HOST\",\"ipv4\":true,\"ipv6\":false,\"ttl\":300}" || { echo "Dynu refused the address update."; exit 1; }
else
  code=$(curl -s -o /tmp/sq-dns.out -w '%{http_code}' --max-time 20 -X PUT "https://desec.io/api/v1/domains/$RT_DOMAIN/rrsets/" \
    -H "Authorization: Token $DEDYN_TOKEN" -H "content-type: application/json" \
    -d "[{\"subname\":\"\",\"type\":\"A\",\"ttl\":3600,\"records\":[\"$PUBLIC_HOST\"]}]" || echo 000)
  [ "$code" = 200 ] || { echo "deSEC said $code: $(head -c 300 /tmp/sq-dns.out)"; rm -f /tmp/sq-dns.out; exit 1; }
  rm -f /tmp/sq-dns.out
fi
echo "DNS: $RT_DOMAIN → $PUBLIC_HOST"

# ---------------------------------------------------------------- certificate (acme.sh, DNS challenge)
if [ ! -x "$HOME_DIR/acme/acme.sh" ]; then
  tmp=$(mktemp -d)
  curl -fsSL --max-time 60 "https://github.com/acmesh-official/acme.sh/archive/refs/tags/$ACME_VERSION.tar.gz" | tar xz -C "$tmp"
  (cd "$tmp/acme.sh-$ACME_VERSION" && ./acme.sh --install --home "$HOME_DIR/acme" --config-home "$CONF/acme" --nocron --no-profile >/dev/null)
  rm -rf "$tmp"
fi
"${ACME[@]}" --set-default-ca --server letsencrypt >/dev/null
sed "s|__BIND__|$PUBLIC_HOST|" dns_sqself.sh >"$HOME_DIR/acme/dnsapi/dns_sqself.sh"
# (--dnssleep: acme.sh's own "is it visible yet?" check uses DNS-over-HTTPS services Iran blocks.)
set +e
"${ACME[@]}" --issue --dns "dns_$([ "$RT_DNS" = self ] && echo sqself || echo "$RT_DNS")" -d "$RT_DOMAIN" --keylength ec-256 --dnssleep "$([ "$RT_DNS" = self ] && echo 5 || echo 90)"
rc=$?
set -e
[ $rc = 0 ] || [ $rc = 2 ] || { echo "Certificate failed (acme.sh $rc)."; exit 1; } # 2 = still valid
"${ACME[@]}" --install-cert -d "$RT_DOMAIN" --ecc --key-file "$TLS/key.pem" --fullchain-file "$TLS/fullchain.pem" \
  --reloadcmd "chown root:streetquest-rt $TLS/key.pem $TLS/fullchain.pem && chmod 640 $TLS/key.pem $TLS/fullchain.pem" >/dev/null

# ---------------------------------------------------------------- service + renewal timer
umask 077
cat > "$CONF/rt.env" <<EOF
NODE_ENV=production
PORT=$PORT
RT_SECRET=$RT_SECRET
APP_URL=$APP_URL
RT_ORIGINS=${RT_ORIGINS:-}
RT_TLS_CERT=$TLS/fullchain.pem
RT_TLS_KEY=$TLS/key.pem
EOF
umask 022
cat > /etc/systemd/system/streetquest-rt.service <<EOF
[Unit]
Description=StreetQuest Street Arena realtime server (wss://$RT_DOMAIN:$PORT)
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=$CONF/rt.env
ExecStart=$(command -v node) --max-old-space-size=200 $HOME_DIR/rt.mjs
User=streetquest-rt
Group=streetquest-rt
Restart=always
RestartSec=3
# Never at the other apps' expense: capped, lowest priority, first to go if memory runs out.
MemoryHigh=250M
MemoryMax=300M
CPUQuota=50%
Nice=10
OOMScoreAdjust=800
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
cat > /etc/systemd/system/streetquest-rt-renew.service <<EOF
[Unit]
Description=Renew the StreetQuest realtime server's certificate

[Service]
Type=oneshot
# acme.sh kept the DNS API credentials in its own (root-only) config at the first issue.
ExecStart=$HOME_DIR/acme/acme.sh --cron --home $HOME_DIR/acme --config-home $CONF/acme
Nice=15
EOF
cat > /etc/systemd/system/streetquest-rt-renew.timer <<EOF
[Unit]
Description=Daily certificate check for the StreetQuest realtime server

[Timer]
OnCalendar=daily
RandomizedDelaySec=2h
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable -q streetquest-rt streetquest-rt-renew.timer
systemctl restart streetquest-rt
systemctl start streetquest-rt-renew.timer

# ---------------------------------------------------------------- checks (ours, then everyone else's)
ok=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  ok=$(curl -fsS --max-time 5 --resolve "$RT_DOMAIN:$PORT:127.0.0.1" "https://$RT_DOMAIN:$PORT/health" 2>/dev/null || true)
  [ -n "$ok" ] && break
done
rollback() { echo "$1 — rolling back (our service stopped)."; systemctl disable --now -q streetquest-rt streetquest-rt-renew.timer; exit 1; }
[ -n "$ok" ] || { journalctl -u streetquest-rt -n 20 --no-pager; rollback "Realtime server didn't answer over TLS"; }
missing=$(comm -23 <(echo "$BEFORE_PORTS") <(others))
[ -z "$missing" ] || rollback "These stopped listening: $missing"
[ "$(answers http://127.0.0.1/)" = "$BEFORE_80" ] || rollback "Port 80 answers differently than before"
[ "$(answers https://127.0.0.1/)" = "$BEFORE_443" ] || rollback "Port 443 answers differently than before"
echo "Realtime server: $ok"
echo "Other apps: unchanged (ports $(echo "$BEFORE_PORTS" | wc -l | tr -d ' '), :80 $BEFORE_80, :443 $BEFORE_443)"
echo "Memory now: $(free -m | awk '/Mem:/{print $7}') MB available"
echo
echo "Set on Vercel (production): RT_URL=wss://$RT_DOMAIN:$PORT and the same RT_SECRET, then redeploy."
