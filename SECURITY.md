# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately in either way:

- GitHub: the **Security** tab of this repository, then **Report a vulnerability**
  (private vulnerability reporting).
- Email: [n.opal@unit42.fr](mailto:n.opal@unit42.fr?subject=Cook%20Up%20security%20report), the
  address behind the app's own "Report an issue" link.

Include what you found, how to reproduce it, and which page or endpoint is affected. I will
acknowledge a report within a few days and tell you what I plan to do about it. This is a
one-person project, so these are best-effort timelines, not guarantees.

## Scope

In scope: the Worker and its routes (`/api/*`, `/admin`, the security headers in `_headers` and
`src/lib/securityHeaders.ts`), the build and deploy scripts, and the GitHub workflows.

Out of scope: the third-party material the app displays (recipes, photographs, nutrition data)
and the platforms it runs on (Cloudflare, GitHub). Please report those to their owners.

## Supported versions

Only the latest release and the current `main` branch are supported.

## What the repository contains

No secrets. The `/admin` sign-in secrets (`RESEND_API_KEY`, `RESEND_FROM`, `ADMIN_EMAILS`) are
set with `wrangler secret put`, and the Cloudflare deploy credentials are GitHub environment
secrets (see "CI and secrets" in the README). If you ever find a credential in this repository
or its history, that is a vulnerability: please report it as above.
