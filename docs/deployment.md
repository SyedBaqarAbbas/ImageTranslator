# Deployment

This repository currently focuses on local prototype operation and GitHub Pages documentation deployment.

## Documentation Site

The docs site is built with MkDocs Material from the repository root:

```bash
python -m pip install -r docs/requirements.txt
mkdocs build --strict
```

The site output is generated under:

```text
site/
```

`site/` is build output and should not be committed.

## GitHub Pages

The expected published documentation URL is:

```text
https://syedbaqarabbas.github.io/ImageTranslator/
```

The workflow at `.github/workflows/docs.yml` builds the MkDocs site and deploys it through GitHub Pages Actions on pushes to `main` that change:

- `docs/**`
- `mkdocs.yml`
- `.github/workflows/docs.yml`

The repository owner may still need to enable Pages in GitHub repository settings and select GitHub Actions as the Pages source.

## Application Deployment Notes

The currently deployed prototype app is available at:

```text
http://158.101.11.4:5173
```

The app is not currently documented as a hardened production deployment. Before deploying beyond local prototype use, review:

- authentication and workspace boundaries
- durable database management
- file storage and backup policy
- provider model installation and cache paths
- worker/concurrency architecture
- public asset URL configuration
- CORS and secret management

For local full-stack operation, use [Local Setup](local-setup.md) or [Docker](docker.md).
