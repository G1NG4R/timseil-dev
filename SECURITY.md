# Security Policy

## Reporting a vulnerability

Email **seil.tim@protonmail.com**. Please do not open a public issue for a
security problem.

> This address is a placeholder in the honest sense: the domain mailbox does not
> exist yet (phase L1). When it does, this file and `/.well-known/security.txt`
> will name the same address — and if they ever disagree, the file served by the
> site wins.

Useful to include: what you did, what happened, what you expected, and whether
you needed anything unusual to reproduce it. A single `curl` that shows the
problem beats three paragraphs.

**What to expect.** This is a one-person project, not a company with a rota. An
acknowledgement usually within a few days; a fix as fast as the severity
deserves. If you have not heard back within two weeks, please send a reminder —
it means the mail got lost, not that it was ignored.

**There is no bug bounty.** Nothing is paid out. Credit in the fix's post-mortem
is offered gladly, and refused just as gladly if you prefer to stay anonymous.

Please give a reasonable window before publishing. Coordinated disclosure is
appreciated, not demanded.

## Scope

**In scope** — anything reachable at `timseil.dev` once it is live, and the code
in this repository that produces it:

- the public read API and the contact endpoint
- the web frontend, including the browser terminal
- deployment and CI configuration in this repository

**Out of scope:**

- **`docs/design/`** — an imported, read-only design handoff. Those sheets load
  React, Babel and fonts from a CDN at runtime by design. They are documentation,
  never served in production, and reports about their CDN usage are expected
  rather than surprising.
- Findings from automated scanners with no demonstrated impact.
- Missing hardening headers **before launch** — they arrive in phase L4 and are
  already planned. Missing ones after launch are very much in scope.
- Social engineering, physical access, and denial of service through sheer
  volume. There is deliberately no CDN and no WAF in front of the origin
  ([ADR 0006](docs/adr/0006-no-cdn.md)); that trade-off is documented, and its
  cost is accepted.

## Supported versions

One deployment, one version. **`main` is production** — there are no maintained
release branches and no backports. Whatever is deployed is the tip of `main`,
and `/api/health` reports the commit it was built from.

## What is already ruled out by design

Stated here so a report does not have to guess:

- **No secrets in images.** No build args for secrets, runtime environment only.
- **No stack traces in production responses.** Errors follow RFC 9457, details go
  to the log.
- **No user-supplied URL in an outgoing request** — the API talks to GitHub and
  Prometheus, both hard-wired.
- **The browser terminal is a command register, not a shell.** No `eval`, no
  `new Function()`, no input reaching a URL or a path. Output is `{text, tone}`
  data, never HTML.
- **Contact mail is plain text**, and CRLF in any address field is rejected
  outright — a `Reply-To` built from visitor input is how a contact form becomes
  a spam relay on its own domain.
- **The database is never exposed.** Postgres, Prometheus, Loki and Alloy have no
  port mapping and no proxy route; from outside, only 22, 80 and 443 answer.
- **No personal data in the public API.** Contact messages are not readable,
  IP addresses are stored as a hash only, logs are scrubbed.

If you find one of these claims to be false, that is exactly the report worth
sending — the project's entire argument is that its claims can be checked.
