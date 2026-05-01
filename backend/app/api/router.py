from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import (
    assets,
    auth,
    events,
    exports,
    health,
    pages,
    processing,
    projects,
    regions,
    runtime,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(projects.router)
api_router.include_router(runtime.router)
api_router.include_router(pages.router)
api_router.include_router(processing.router)
api_router.include_router(regions.router)
api_router.include_router(exports.router)
api_router.include_router(assets.router)
api_router.include_router(events.router)
