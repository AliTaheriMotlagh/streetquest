#!/usr/bin/env sh
# acme.sh DNS hook for RT_DNS=self (realtime/install.sh): sslip.io hands `_acme-challenge.<a-b-c-d>.sslip.io`
# to a.b.c.d, so this server answers Let's Encrypt's TXT question itself (acme-answer.mjs on port 53,
# only while a certificate is being issued; `timeout` ends it even if acme.sh is killed).
SQ_RUN=/run/streetquest-rt-acme
SQ_BIND=__BIND__

dns_sqself_add() {
  mkdir -p "$SQ_RUN"
  echo "$2" >>"$SQ_RUN/txt"
  if [ -f "$SQ_RUN/pid" ] && kill -0 "$(cat "$SQ_RUN/pid")" 2>/dev/null; then return 0; fi
  zone=$(printf %s "$1" | tr 'A-Z' 'a-z')
  nohup timeout 600 node /opt/streetquest-rt/acme-answer.mjs "$SQ_BIND" "$zone" "$SQ_RUN/txt" >"$SQ_RUN/log" 2>&1 &
  echo $! >"$SQ_RUN/pid"
  sleep 1
  kill -0 "$(cat "$SQ_RUN/pid")" 2>/dev/null || { _err "acme-answer didn't start: $(cat "$SQ_RUN/log")"; return 1; }
  return 0
}

dns_sqself_rm() {
  if [ -f "$SQ_RUN/txt" ]; then grep -vxF "$2" "$SQ_RUN/txt" >"$SQ_RUN/txt.new" || true; mv -f "$SQ_RUN/txt.new" "$SQ_RUN/txt"; fi
  if [ ! -s "$SQ_RUN/txt" ] && [ -f "$SQ_RUN/pid" ]; then
    kill "$(cat "$SQ_RUN/pid")" 2>/dev/null
    rm -f "$SQ_RUN/pid"
  fi
  return 0
}
