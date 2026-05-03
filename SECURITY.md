# Security Policy

ImageTranslator is currently a public prototype. This policy covers responsible
disclosure for security issues in the source code, local development workflow,
and any GitHub-hosted collaboration surfaces for this repository.

## Supported Versions

| Version or branch | Support status |
| --- | --- |
| `main` | Supported for security fixes and dependency updates. |
| Open pull request branches | Reviewed when they affect `main` or the current prototype workflow. |
| Older branches, forks, or local experiments | Not actively supported by this project. |

The project has not published stable release branches yet. When stable releases
exist, this table should be updated with the supported release lines.

## Reporting a Vulnerability

Report suspected vulnerabilities through GitHub private vulnerability reporting:

<https://github.com/SyedBaqarAbbas/ImageTranslator/security/advisories/new>

Do not open a public issue or pull request with exploit details, secrets,
private media, or unreleased vulnerability information. If GitHub private
vulnerability reporting is unavailable, open a GitHub issue that asks for a
private contact path without disclosing technical details.

Useful reports include:

- A short summary of the issue and affected component.
- Reproduction steps or a minimal proof of concept using synthetic or redacted
  files.
- Expected impact, affected branches or commits, and any relevant logs.
- Whether the issue affects local-only development, a hosted deployment, or a
  future real-provider integration.

Repository admins receive private vulnerability reports. The repository owner
and admins triage initial reports, may add trusted maintainers to the private
advisory, and coordinate fixes before public disclosure.

## Response Timeline

- Initial acknowledgement: within 3 business days.
- Initial triage decision: within 7 business days after acknowledgement.
- High-impact fixes: target a patch or mitigation within 14 business days when
  practical.
- Lower-impact fixes: target a patch in the next normal maintenance window,
  usually within 30 to 90 days.

These targets may change when a report depends on third-party provider behavior,
external infrastructure, or coordinated disclosure with another project.

## Prototype Data and Provider Safety

Do not upload copyrighted, private, confidential, or sensitive manga, comic,
manhwa, or image pages to hosted ImageTranslator deployments unless you are
authorized to process that content.

The default local workflow uses mock OCR and translation providers. Optional
local prototype providers such as Tesseract and OPUS-MT process files on the
developer machine. Real OCR, translation, or rendering providers may send image
content, extracted text, prompts, metadata, or generated outputs to third-party
APIs once those providers are enabled or implemented. Treat provider keys,
model tokens, database URLs, uploaded assets, rendered outputs, and production
configuration as sensitive.

Use synthetic, licensed, public-domain, or redacted images when reporting
security issues or sharing reproduction material.
