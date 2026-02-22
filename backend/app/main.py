from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.config import settings
from app.routers import auth, documents, export, folders, health, internal, render, users

app = FastAPI(
    title="PlantUML IDE API",
    version="1.0.0",
    docs_url="/api/v1/docs" if settings.app_env == "development" else None,
    redoc_url="/api/v1/redoc" if settings.app_env == "development" else None,
)

# CORS
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(folders.router)
app.include_router(documents.router)
app.include_router(render.router)
app.include_router(export.router)
app.include_router(internal.router)


@app.get("/", include_in_schema=False)
async def root_redirect():
    return RedirectResponse(url="/api/v1/docs" if settings.app_env == "development" else "/")
