# Security

## Reporting a vulnerability

Report it privately, never in a public issue: on GitHub, **Security** › **Report a vulnerability**
(<https://github.com/Ensiria/cli-kit/security/advisories/new>). A fix is released as soon as it is ready, and you are
credited unless you ask not to be.

## Supported versions

The latest release. While the package is 0.x, fixes go into the next release only.

## What the package does to keep you safe

- It has no runtime dependency.
- It is published from GitHub Actions through npm's trusted publishing, with a provenance statement: `npm view
  @ensiria/cli-kit --json` shows it, and `npm audit signatures` verifies it.
- `exec()` never runs a shell: arguments are an array, never a string a shell would read.
