# gjallar-web

The web UI of [Gjallar](https://github.com/heimdallr-dev/gjallar). This repo is
the UI's home; the core repo embeds an identical copy (`cmd/gjallar-web/static`)
so a single static binary serves it.

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
# run the core stack (see the core repo), then:
scripts/sync-to-core.sh          # copies ui/ into ../gjallar/cmd/gjallar-web/static
(cd ../gjallar && go run ./cmd/gjallar-web)   # GJALLAR_API_URL=http://localhost:8080
```

CI checks the JavaScript, forbids remote scripts/styles, and that the core's
embedded copy matches this repo.

Apache-2.0.
