import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.config import settings
from app.routers import (
    auth,
    documents,
    export,
    folders,
    health,
    internal,
    preferences,
    render,
    shares,
    templates,
    users,
    versions,
)

logger = logging.getLogger(__name__)

app = FastAPI(
    title="PlottedPlant API",
    version="1.0.0",
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
app.include_router(preferences.router)
app.include_router(shares.router)
app.include_router(internal.router)


@app.get("/", include_in_schema=False)
async def root_redirect():
    return RedirectResponse(url="/api/v1/docs" if settings.app_env == "development" else "/")
