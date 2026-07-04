import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.config import settings
from app.dependencies import async_session_factory, engine, redis_client
from app.services.maintenance import run_maintenance
from app.routers import (
    auth,
    documents,
    export,
    folders,
    health,
    internal,
    render,
    shares,
    templates,
    users,
    versions,
)

logger = logging.getLogger(__name__)


async def _maintenance_loop() -> None:
    """Run the maintenance sweep on a fixed interval until cancelled."""
    while True:
        try:
            await asyncio.sleep(settings.maintenance_interval_seconds)
            async with async_session_factory() as db:
                await run_maintenance(db)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Maintenance cycle failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_maintenance_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        # Release pooled connections on shutdown so worker recycling is clean.
        await redis_client.aclose()
        await engine.dispose()


app = FastAPI(
    title="PlottedPlant API",
    version="1.0.0",
    lifespan=lifespan,
    openapi_url="/api/v1/openapi.json" if settings.app_env == "development" else None,
    docs_url="/api/v1/docs" if settings.app_env == "development" else None,
    redoc_url="/api/v1/redoc" if settings.app_env == "development" else None,
)

# Global exception handler — prevent traceback leaks in production
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred."},
    )

# CORS — restricted to actual HTTP verbs used by the frontend
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(folders.router)
app.include_router(documents.router)
app.include_router(render.router)
app.include_router(export.router)
app.include_router(versions.router)
app.include_router(templates.router)
app.include_router(shares.router)
app.include_router(internal.router)


@app.get("/", include_in_schema=False)
async def root_redirect():
    return RedirectResponse(url="/api/v1/docs" if settings.app_env == "development" else "/")
