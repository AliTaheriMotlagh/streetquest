#!/usr/bin/env bash
# Points the one server's domain (SITE_DOMAIN in .env.server) at the server through Cloudflare's API: an A record,
# DNS only (grey cloud — Cloudflare's proxy can't reach a server in Iran). If a Cloudflare Worker holds the name as
# its custom domain (the old Cloudflare deploy), it is detached first. Safe to run again: does nothing when right.
#
#   CF_DNS_API_TOKEN=… bash scripts/server-dns.sh      (token: Zone → DNS → Edit + Zone → Read; Workers → Edit
#                                                       only if a Worker still holds the name)
set -euo pipefail
cd "$(dirname "$0")/.."
env_of() { [ -f "${2:-.env}" ] && grep -E "^$1=" "${2:-.env}" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true; }
TOKEN=${CF_DNS_API_TOKEN:-$(env_of CF_DNS_API_TOKEN .env.server)}
: "${TOKEN:?Set CF_DNS_API_TOKEN (env or .env.server)}"
DOMAIN=${SERVER_DOMAIN:-$(env_of SITE_DOMAIN .env.server)}
SERVER_SSH=${SERVER_SSH:-$(env_of SERVER_SSH)}
IP=${SERVER_IP:-${SERVER_SSH#*@}}
: "${DOMAIN:?No SITE_DOMAIN in .env.server}"; : "${IP:?Set SERVER_SSH=root@<ip>}"
case $DOMAIN in *.sslip.io) echo "$DOMAIN needs no DNS record."; exit 0 ;; esac

cf() { # method path [json] → body; stops on an API error
  local out; out=$(curl -sS -m 30 -X "$1" "https://api.cloudflare.com/client/v4$2" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" ${3:+--data "$3"})
  jq -e '.success' >/dev/null <<<"$out" || { echo "Cloudflare API $1 $2: $(jq -c '.errors' <<<"$out" 2>/dev/null || echo "$out")" >&2; return 1; }
  printf '%s' "$out"
}

# The zone: the longest suffix of the domain that is a zone on this account.
zone= acct= name=$DOMAIN
while [[ $name == *.* ]]; do
  z=$(cf GET "/zones?name=$name")
  if [ "$(jq '.result | length' <<<"$z")" -gt 0 ]; then zone=$(jq -r '.result[0].id' <<<"$z"); acct=$(jq -r '.result[0].account.id' <<<"$z"); break; fi
  name=${name#*.}
done
[ -n "$zone" ] || { echo "No Cloudflare zone for $DOMAIN that this token can see."; exit 1; }

# A Worker's custom domain owns its DNS record: detach it, or it can't be changed.
if w=$(cf GET "/accounts/$acct/workers/domains?hostname=$DOMAIN" 2>/dev/null); then
  for id in $(jq -r --arg d "$DOMAIN" '.result[] | select(.hostname == $d) | .id' <<<"$w"); do
    echo "▸ Detaching $DOMAIN from Worker $(jq -r --arg i "$id" '.result[] | select(.id == $i) | .service' <<<"$w")"
    cf DELETE "/accounts/$acct/workers/domains/$id" >/dev/null
  done
fi

recs=$(cf GET "/zones/$zone/dns_records?name=$DOMAIN&per_page=100")
if [ "$(jq --arg ip "$IP" '[.result[] | select(.type == "A" and .content == $ip and .proxied == false)] | length' <<<"$recs")" -gt 0 ] &&
   [ "$(jq '[.result[] | select(.type == "AAAA" or .type == "CNAME" or .type == "A")] | length' <<<"$recs")" -eq 1 ]; then
  echo "✔ $DOMAIN → $IP (DNS only) already"; exit 0
fi
for id in $(jq -r '.result[] | select(.type == "A" or .type == "AAAA" or .type == "CNAME") | .id' <<<"$recs"); do
  echo "▸ Removing old record $(jq -r --arg i "$id" '.result[] | select(.id == $i) | "\(.type) \(.content)"' <<<"$recs")"
  cf DELETE "/zones/$zone/dns_records/$id" >/dev/null
done
cf POST "/zones/$zone/dns_records" "{\"type\":\"A\",\"name\":\"$DOMAIN\",\"content\":\"$IP\",\"proxied\":false,\"ttl\":300,\"comment\":\"StreetQuest one server (scripts/server-dns.sh)\"}" >/dev/null
echo "✔ $DOMAIN → $IP (DNS only)"
