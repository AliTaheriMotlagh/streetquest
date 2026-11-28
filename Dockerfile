# The whole game in one image: the Next.js app (standalone server), the Street Arena realtime server
# (realtime/, bundled into one file), the daily cleanup timer and the Prisma CLI that syncs the schema
# at start. docker/compose.yml runs it beside Postgres and Caddy (HTTPS) — see README → "One server".
#
#   docker build -t streetquest .        (scripts/server-deploy.sh builds it for linux/amd64)

# NODE_IMAGE: the same official image from a mirror where Docker Hub refuses (Iran) — the deploy script picks one.
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Prisma's engines need OpenSSL to pick the right binary.
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl ca-certificates >/dev/null && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY . .
# NEXT_PUBLIC_* values are baked into the browser code, so they are build arguments.
ARG NEXT_PUBLIC_SITE_URL=http://localhost
ARG NEXT_PUBLIC_RT_URL=
ARG BUILD_SHA=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_RT_URL=$NEXT_PUBLIC_RT_URL RENDER_GIT_COMMIT=$BUILD_SHA \
    NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
# No database while building: the schema is synced when the container starts (docker/start.sh).
RUN npx prisma generate && npx next build
# The realtime server as one file (same as scripts/rt-deploy.sh).
RUN npx esbuild realtime/server.ts --bundle --platform=node --target=node22 --format=esm --log-level=warning \
      --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" --outfile=/out/rt.mjs
# The Prisma CLI (same version as the app's) on its own, for `prisma db push` at start.
RUN mkdir -p /tools && cd /tools && echo '{"private":true}' > package.json && \
    npm i --no-audit --no-fund --no-package-lock "prisma@$(node -p "require('/app/node_modules/prisma/package.json').version")" >/dev/null

FROM ${NODE_IMAGE}
WORKDIR /app
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl ca-certificates >/dev/null && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /tools /tools
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# The generated Prisma client + its engine (standalone tracing misses the engine now and then).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build /out/rt.mjs ./rt/server.mjs
COPY docker/start.sh docker/cron.mjs ./docker/
RUN mkdir -p public/uploads && chown -R node:node public/uploads
USER node
EXPOSE 3000 8787
CMD ["sh", "docker/start.sh"]
