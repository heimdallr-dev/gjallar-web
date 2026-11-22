# Security policy

Gjallar is a security tool, so we hold it to the standard it asks of others.

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through GitHub:
**Security → Report a vulnerability** on the affected repository
(GitHub private vulnerability reporting). Include what you found, how to
reproduce it, and the impact you expect.

We follow coordinated vulnerability disclosure, as described in the
[OpenSSF CVD guide](https://github.com/ossf/oss-vulnerability-guide):

| Step | Target |
|---|---|
| Acknowledge your report | 3 working days |
| First assessment and severity (CVSS v3.1/v4) | 10 working days |
| Fix or mitigation for high/critical | 30 days |
| Public advisory (GHSA + CVE, OSV) and credit | when the fix ships, or 90 days after the report, whichever is first |

If a fix needs longer, we agree a date with you. We credit reporters unless
they ask us not to.

## Supported versions

| Version | Security fixes |
|---|---|
| latest minor (0.x) | yes |
| older | no; upgrade |

## What we ship to help you verify us

- Every release image is signed with Sigstore (keyless) and carries an SBOM
  and SLSA build provenance:
  `cosign verify ghcr.io/heimdallr-dev/gjallar-api:<tag> --certificate-identity-regexp 'https://github.com/heimdallr-dev/gjallar/.github/workflows/release.yml@.*' --certificate-oidc-issuer https://token.actions.githubusercontent.com`
- `gh attestation verify oci://ghcr.io/heimdallr-dev/gjallar-api:<tag> --owner heimdallr-dev`
- Engine downloads in the Dockerfile are pinned and checksum-verified.
- OpenSSF Scorecard runs on every push to `main`.

## Scope notes

Admission webhooks fail open by design (freedom to disagree): Gjallar or
Kyverno being down never blocks your cluster. Reports that only restate this
are not vulnerabilities; bypasses of an *enforcing* policy are.
