# Deploying the merchant portal

A fork of [anthropics/commerce-agents](https://github.com/anthropics/commerce-agents) that adds
one thing: a container image of the **ACME retail merchant portal**, behind HTTP basic auth, for
the team to try. Everything else in the repository is unchanged and still runs as its README
describes.

## What the image runs

`Dockerfile` builds one image with three processes, started by `deploy/start.sh`:

| Process | Bind | Serves |
|---|---|---|
| `deploy/proxy.mjs` | `0.0.0.0:$PORT` | the only public port: checks basic auth, then proxies |
| `retail.api.main:app` (uvicorn) | `127.0.0.1:8100` | `/api/*` and the listing photos under `/products/*` |
| Next.js portal (standalone) | `127.0.0.1:3100` | everything else |

The portal is built with `NEXT_PUBLIC_API_URL=""`, so the browser's calls stay relative and reach
the API through the same origin. Neither the API nor the portal listens on a public interface, so
there is no unauthenticated way in — `/healthz` is the one exception, for the platform's health
check.

## Secrets

Nothing secret is committed or baked into the image. `.env` is gitignored, `.dockerignore` keeps
it out of the build context, and all three values arrive as runtime environment variables:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | server-side only; the model calls happen in the Python process |
| `BASIC_AUTH_USER` | the portal's username |
| `BASIC_AUTH_PASSWORD` | the portal's password |

`start.sh` refuses to boot without the two auth variables, so a misconfigured deployment fails
closed rather than serving the portal to the internet.

Basic auth over HTTPS is a shared password on a demo, not an access-control system: it keeps the
URL from being useful to whoever finds it, and it is worth rotating when someone leaves the team.

## Koyeb

The Koyeb service builds this repository's `Dockerfile` on every push to `main`. The three
variables above are set on the service; the two secret ones are Koyeb secrets, not plain values.

## Running the image locally

```bash
docker build -t merchant-portal .
docker run --rm -p 8080:8000 \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e BASIC_AUTH_USER=... -e BASIC_AUTH_PASSWORD=... \
  merchant-portal
# http://localhost:8080
```
