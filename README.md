# gjallar-web

Home of Gjallar's web UI **when it grows beyond static files**.

Today the UI is deliberately small (plain HTML, CSS and JavaScript, no build
step, strict CSP) and ships inside the core repo:
[cmd/gjallar-web/static](https://github.com/heimdallr-dev/gjallar/tree/main/cmd/gjallar-web/static).
That keeps it auditable and lets a one-engineer team run it.

This repo is reserved for the next step, when it is worth it:

- the UI as a standalone project with its own release cycle;
- the same rules: talks only to the documented REST API
  ([interfaces](https://github.com/heimdallr-dev/gjallar-docs/blob/main/docs/interfaces.md)),
  OIDC PKCE login with any provider, no third-party scripts or trackers,
  accessible (keyboard, screen readers, contrast);
- every number on screen keeps its reason (no score without a why).

Until then, contribute UI changes to the core repo.

Apache-2.0.
