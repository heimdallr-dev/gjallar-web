# gjallar-web

The web UI of [Gjallar](https://github.com/heimdallr-dev/gjallar) and the small
server that ships it: one static binary (Go standard library only) that embeds
`ui/`, serves it with a strict CSP and reverse-proxies `/api` to the Gjallar
API, so the browser stays same-origin. It holds no secrets; sign-in is OIDC
PKCE in the browser. Published as `ghcr.io/heimdallr-dev/gjallar-web`, signed
with an SBOM and provenance; the Helm chart uses it.

Deliberately small and auditable: plain HTML, CSS and JavaScript, **no build
step, no third-party scripts, no trackers**, strict Content-Security-Policy.
A team with one engineer can read all of it.

| What you can do | How the UI keeps the philosophy |
|---|---|
| See risks ranked, with the reasons behind every score | No score without a reason (freedom from noise) |
| Filter by band, namespace, package | Multi-tenancy: shows which namespaces your groups may see |
| Accept a risk with a written reason (VEX), patch (Copa), scan, rematch (admins) | Humans decide; every decision is audit-logged |
| Download each image's SBOM as CycloneDX, SPDX or Syft JSON, and its OpenVEX | Your data in open formats, one click away |
| Run read-only SQL over the lakehouse | Same data your notebooks and BI tools get |
| Sign in with any OIDC provider (PKCE) | Identity stays with your IdP |

## Develop

```bash
# with a Gjallar API on :8080 (core repo: make dev, or a port-forward)
GJALLAR_API_URL=http://localhost:8080 go run .        # http://localhost:8083
go test ./...
docker build -t gjallar-web:dev .                     # or: nerdctl build
```

| Env | Default | |
|---|---|---|
| `GJALLAR_API_URL` | `http://gjallar-api:8080` | where `/api` goes |
| `GJALLAR_OIDC_ISSUER` | — | OIDC issuer; empty = sign-in off |
| `GJALLAR_OIDC_WEB_CLIENT_ID` | `gjallar-web` | public PKCE client |
| `GJALLAR_HTTP_ADDR` | `:8083` | listen address |

## Release

Tag `vX.Y.Z` with the same version as the core release it goes with; the
workflow publishes `gjallar-web:X.Y.Z` for amd64 and arm64. To run a UI
release with an older core, set `web.tag` in the chart.

CI checks the Go code, the JavaScript syntax, forbids remote scripts/styles,
and builds the image.

Apache-2.0.
