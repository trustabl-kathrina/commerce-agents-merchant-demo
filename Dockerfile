# The ACME merchant portal as one image: the Next.js portal, the retail API it reads,
# and a basic-auth proxy in front of both. Built by Koyeb from this repository.
# syntax=docker/dockerfile:1

# ---------- portal build ----------
FROM node:22-bookworm-slim AS web

WORKDIR /src
COPY examples/ ./examples/
WORKDIR /src/examples
RUN npm ci

WORKDIR /src/examples/retail/merchant-web
# An empty API URL leaves the client's fetches relative, so the browser reaches the API
# through the proxy on this app's own origin and no second public port is needed.
ENV NEXT_STANDALONE=1 \
    NEXT_PUBLIC_API_URL="" \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv

WORKDIR /app

# The seven repository packages install editable from their directories, so their
# sources are copied before the pinned third-party set is resolved.
COPY requirements.txt ./
COPY commerce-common/ ./commerce-common/
COPY shopping-agent/ ./shopping-agent/
COPY merchant-agent/ ./merchant-agent/
RUN /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# The API half of the retail example: shared host code, the vertical's routes and data,
# and the listing photos the portal displays (the API serves them to both web apps).
COPY examples/demo_common/ ./examples/demo_common/
COPY examples/retail/__init__.py ./examples/retail/
COPY examples/retail/api/ ./examples/retail/api/
COPY examples/retail/data/ ./examples/retail/data/
COPY examples/retail/storefront-web/public/ ./examples/retail/storefront-web/public/

COPY deploy/ ./deploy/

# next build --output standalone lays the server out under the npm workspace root.
COPY --from=web /src/examples/retail/merchant-web/.next/standalone/ ./web/
COPY --from=web /src/examples/retail/merchant-web/.next/static/ ./web/retail/merchant-web/.next/static/

ENV PORT=8000 \
    API_PORT=8100 \
    WEB_PORT=3100 \
    NEXT_TELEMETRY_DISABLED=1 \
    PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["/app/deploy/start.sh"]
