from __future__ import annotations

import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging, logger
from app.db.session import create_db_and_tables


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    configure_logging()
    if settings.auto_create_tables:
        await create_db_and_tables()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    debug=settings.debug,
    lifespan=lifespan,
)


def _cors_allowed_origins() -> list[str]:
    if settings.cors_allowed_origins:
        return settings.cors_allowed_origins
    if settings.environment == "local":
        return ["*"]
    return []


def _cors_allow_credentials(allowed_origins: list[str]) -> bool:
    return "*" not in allowed_origins or settings.environment == "local"


cors_allowed_origins = _cors_allowed_origins()


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allowed_origins,
    allow_credentials=_cors_allow_credentials(cors_allowed_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    logger.info(
        "request_completed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=duration_ms,
    )
    return response


register_error_handlers(app)
app.include_router(api_router, prefix=settings.api_v1_prefix)
