"""FastAPI application entry point."""

import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.api.scorecards import router as scorecard_router
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import configure_logging, get_logger
from app.db.session import SessionLocal, init_db

log = get_logger("app")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    init_db()
    from app.services.match_service import mark_interrupted
    from app.services.tailoring_service import mark_interrupted as mark_versions_interrupted

    with SessionLocal() as db:
        mark_interrupted(db)
        mark_versions_interrupted(db)
        from app.services.scorecard_service import mark_interrupted as mark_scorecards_interrupted

        mark_scorecards_interrupted(db)
    # Load the embedding model in the background so the first analysis doesn't pay ~20s for it.
    threading.Thread(target=_warm_embeddings, name="warm-embeddings", daemon=True).start()
    yield


def _warm_embeddings() -> None:
    from app.scoring.semantic import embed

    try:
        embed(["warm up"])
    except Exception:
        log.exception("embedding warm-up failed; it will load on first use")


app = FastAPI(title="JobJury", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(scorecard_router)


@app.exception_handler(AppError)
async def app_error_handler(_req: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.exception_handler(RequestValidationError)
async def validation_handler(_req: Request, exc: RequestValidationError):
    # Do not echo request bodies (may contain resume/JD text).
    fields = [".".join(str(p) for p in e["loc"]) for e in exc.errors()][:5]
    return JSONResponse(
        status_code=422, content={"detail": f"Invalid request: {', '.join(fields)}"}
    )
