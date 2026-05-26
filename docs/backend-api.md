# Backend API

The backend is a FastAPI app. The API prefix defaults to:

```text
/api/v1
```

Local API docs are available when the backend is running:

```text
http://localhost:8000/docs
```

or, for the host prototype script:

```text
http://127.0.0.1:8000/docs
```

Workflow endpoints use the shared public workspace user in local HTTP mode and do not require a frontend auth token.

## Route Files

```text
backend/app/api/routes/health.py
backend/app/api/routes/users.py
backend/app/api/routes/runtime.py
backend/app/api/routes/projects.py
backend/app/api/routes/pages.py
backend/app/api/routes/processing.py
backend/app/api/routes/regions.py
backend/app/api/routes/exports.py
backend/app/api/routes/assets.py
backend/app/api/routes/events.py
```

## Key Endpoints

| Area | Method and path | Purpose |
| --- | --- | --- |
| Health | `GET /api/v1/health` | API health check |
| User | `GET /api/v1/me` | Shared public workspace user |
| Runtime | `GET /api/v1/runtime/language` | Read locked runtime source/target language |
| Projects | `POST /api/v1/projects` | Create a project |
| Projects | `GET /api/v1/projects` | List projects |
| Projects | `GET /api/v1/projects/{project_id}` | Read project detail |
| Projects | `PATCH /api/v1/projects/{project_id}` | Update metadata/settings mirrored on project |
| Projects | `DELETE /api/v1/projects/{project_id}` | Soft-delete a project |
| Settings | `PATCH /api/v1/projects/{project_id}/settings` | Update project translation/rendering settings |
| Pages | `POST /api/v1/projects/{project_id}/pages/upload` | Upload image files or ZIP archives |
| Pages | `GET /api/v1/projects/{project_id}/pages` | List pages |
| Pages | `GET /api/v1/pages/{page_id}` | Read page detail |
| Pages | `POST /api/v1/pages/{page_id}/reprocess` | Reprocess one page |
| Pages | `POST /api/v1/pages/{page_id}/rerender` | Rerender one page |
| Processing | `POST /api/v1/projects/{project_id}/process` | Process a project |
| Processing | `GET /api/v1/projects/{project_id}/jobs` | List project jobs |
| Processing | `GET /api/v1/jobs/{job_id}` | Read job status |
| Events | `GET /api/v1/projects/{project_id}/events` | Server-Sent Events for project progress |
| Regions | `GET /api/v1/pages/{page_id}/regions` | List OCR/translation regions |
| Regions | `PATCH /api/v1/regions/{region_id}` | Edit text, box, type, or render style |
| Regions | `DELETE /api/v1/regions/{region_id}` | Reject/delete a region |
| Regions | `POST /api/v1/regions/{region_id}/retranslate` | Retranslate one region |
| Regions | `POST /api/v1/regions/{region_id}/rerender` | Rerender one region/page |
| Exports | `POST /api/v1/projects/{project_id}/export` | Create ZIP/PDF/image ZIP export |
| Exports | `GET /api/v1/exports/{export_id}` | Read export job status |
| Exports | `GET /api/v1/exports/{export_id}/download` | Resolve export download URL |
| Assets | `GET /api/v1/assets/{asset_id}` | Read asset metadata |
| Assets | `GET /api/v1/assets/{asset_id}/download` | Resolve asset download URL |

## Upload Constraints

Backend upload validation is controlled by settings in `backend/app/core/config.py` and defaults from `backend/.env.example`.

Default supported image MIME types:

```text
image/png,image/jpeg,image/webp
```

Default supported archive MIME types:

```text
application/zip,application/x-zip-compressed
```

List-valued settings accept comma-separated values or JSON arrays.

## Status Concepts

Projects move through statuses such as `draft`, `processing`, `review_required`, `completed`, `export_ready`, and `failed`.

Pages move through statuses such as `uploaded`, `queued`, `ocr_running`, `translating`, `rendering`, `review_required`, `completed`, and `failed`.

Text regions move through statuses such as `translated`, `needs_review`, `user_edited`, `rendered`, and `failed`.

Client code should use the response status and failure fields rather than assuming a job always succeeds.
