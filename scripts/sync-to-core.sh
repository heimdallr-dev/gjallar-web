#!/bin/sh
# Copy the UI into the core repo, where gjallar-web embeds it (go:embed).
# Run from this repo with the core checked out next to it.
set -eu
CORE=${CORE:-../gjallar}
cp ui/index.html ui/app.js ui/app.css "$CORE/cmd/gjallar-web/static/"
echo "UI copied to $CORE/cmd/gjallar-web/static; commit it in the core repo too."
