# Deployment

This repository currently supports local prototype operation, GitHub Pages
documentation deployment, and an automated OCI prototype deployment.

## Application Deployment: OCI Prototype

The currently deployed prototype app is available at:

```text
http://158.101.11.4:5173
```

The workflow at `.github/workflows/deploy-oci.yml` deploys the current Compose
prototype to Oracle Cloud Infrastructure (OCI). It starts automatically only
after the GitHub `CI` workflow completes successfully for a `push` to `main`.
Pull request CI runs do not deploy and do not receive OCI deployment secrets.
Automatic deployments also verify that the fetched `origin/main` commit matches
the successful CI run's commit before changing the bind-mounted server checkout.
If `main` advanced while an older CI run was finishing, the older deploy exits
without updating the working tree and the newer CI run is left to deploy its own
commit.

The same workflow also supports manual redeployment from GitHub Actions:

1. Open **Actions** in the GitHub repository.
2. Select **Deploy OCI**.
3. Choose **Run workflow** from `main`.

Manual runs from other branches are skipped. The remote deployment always
fast-forwards the OCI checkout to `main`.

Deployments use the GitHub environment named `production-oci`, so environment
secrets, variables, deployment history, and optional future approvals are scoped
to the OCI target. The workflow serializes deployments with the
`production-oci` concurrency group and does not cancel an already-running
deployment.

### GitHub Environment Configuration

Create the `production-oci` environment in GitHub and configure these required
environment secrets:

- `OCI_DEPLOY_HOST`: OCI host or IP address.
- `OCI_DEPLOY_USER`: SSH user, such as `opc` on Oracle Linux or `ubuntu` on
  Ubuntu.
- `OCI_DEPLOY_SSH_KEY`: private key for the deploy user.
- `OCI_DEPLOY_KNOWN_HOSTS`: pinned SSH known-hosts entry for the OCI host.

Configure this required environment variable:

- `OCI_DEPLOY_PATH`: existing repository checkout path on the OCI host, for
  example `/home/opc/ImageTranslator`.

Optional environment variables:

- `OCI_DEPLOY_PORT`: SSH port. Defaults to `22`.
- `OCI_APP_URL`: GitHub environment deployment URL. Defaults to
  `http://158.101.11.4:5173`.
- `OCI_FRONTEND_HEALTH_URL`: host-local frontend health URL. Defaults to
  `http://127.0.0.1:5173/`.
- `OCI_API_HEALTH_URL`: host-local API health URL. Defaults to
  `http://127.0.0.1:8000/api/v1/health`.

Generate `OCI_DEPLOY_KNOWN_HOSTS` from a trusted admin machine and review it
before saving it in GitHub. Do not use runner-time `ssh-keyscan` as the trust
source for production deployment.

### OCI Host Prerequisites

The OCI host must already have:

- an SSH account for the deploy user and the matching public key in
  `authorized_keys`
- repository access for `git fetch` and `git pull`
- an existing ImageTranslator checkout at `OCI_DEPLOY_PATH`
- Docker and Docker Compose available to the deploy user without `sudo`
- the root `docker-compose.yml` deployment shape with `api`, `frontend`,
  `migrate`, and `postgres`
- server-side environment files and runtime state kept out of git

The deployment workflow intentionally does not create the server checkout,
install Docker, configure SSH users, or grant Docker daemon access. Do those
steps manually before enabling automatic deployment.

### Server Runtime State

Server-only runtime state must stay on the OCI host and must not be committed:

- server `.env` values such as `PUBLIC_BASE_URL`, provider settings, API proxy
  configuration, and credentials
- `backend/models/opus-mt/` model directories
- local uploaded/rendered asset storage, such as `backend/data/storage/`
- Docker volumes, including Postgres data
- private keys and SSH trust material

For the currently hosted prototype, server-side environment values should be
similar to:

```bash
PUBLIC_BASE_URL=http://158.101.11.4:5173
VITE_API_BASE_URL=/api/v1
VITE_API_PROXY_TARGET=http://api:8000
OCR_PROVIDER=tesseract
TRANSLATION_PROVIDER=opus_mt
OPUS_MT_MODEL_ROOT=/app/models/opus-mt
```

When `TRANSLATION_PROVIDER=opus_mt`, the required OPUS-MT model folders must
already exist under `backend/models/opus-mt/` on the OCI host. Deployment fails
before Compose restart if that model root is missing or empty.

### Deploy Behavior

The workflow uses native OpenSSH commands from the GitHub-hosted runner. On the
OCI host, it:

1. enters `OCI_DEPLOY_PATH`
2. verifies the directory is a Git checkout with root `docker-compose.yml`
3. fails if tracked server-side files are modified, while ignoring untracked
   runtime files
4. runs `git fetch --prune origin main:refs/remotes/origin/main`
5. verifies automatic deployments match the successful CI commit before the
   bind-mounted checkout is changed
6. runs `git checkout main`
7. runs `git merge --ff-only refs/remotes/origin/main`
8. runs `docker compose config --quiet`
9. runs `docker compose up --build -d --remove-orphans`
10. retries frontend and API health checks

The workflow does not run `git reset --hard`, `docker compose down -v`, or any
cleanup that removes server-only `.env` files, OPUS-MT models, local assets, or
Postgres volumes. It also avoids plain `docker compose down`; Compose updates
the running stack in place to minimize downtime.

### Smoke Verification

After deployment, verify the live app and API:

```bash
curl -fsS http://158.101.11.4:5173/
curl -fsS http://158.101.11.4:5173/api/v1/health
```

If the API health route is not proxied through the frontend container, verify
from the OCI host instead:

```bash
curl -fsS http://127.0.0.1:8000/api/v1/health
```

### Rollback

Rollback is source-driven: revert the bad merge on `main`, let `CI` pass for the
revert commit, and allow the deploy workflow to redeploy that reverted
application state. If an automatic deployment needs to be repeated, use the
manual `workflow_dispatch` trigger.

This app is still a prototype deployment, not a hardened production stack.
Before deploying beyond prototype use, review authentication and workspace
boundaries, database backup/restore, durable file storage, model lifecycle,
worker/concurrency architecture, public asset URL configuration, CORS, secret
management, HTTPS, and reverse proxy needs.

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

For local full-stack operation, use [Local Setup](local-setup.md) or [Docker](docker.md).
