# Caddy with the Cloudflare DNS plugin: a server in Iran can't be reached by Let's Encrypt from abroad, so
# its certificate is proven through a DNS TXT record instead (CADDY_TLS=cloudflare + CF_DNS_API_TOKEN, README →
# "One server"). Built where Docker Hub and the Go module proxy answer (GitHub Actions); the server only loads it.
ARG CADDY_BUILDER=caddy:2-builder
ARG CADDY_BASE=caddy:2-alpine
FROM ${CADDY_BUILDER} AS build
RUN xcaddy build --with github.com/caddy-dns/cloudflare
FROM ${CADDY_BASE}
COPY --from=build /usr/bin/caddy /usr/bin/caddy
