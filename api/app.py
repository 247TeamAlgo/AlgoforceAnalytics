# api/app.py
"""FastAPI app entrypoint."""

from __future__ import annotations

from fastapi import FastAPI

from .routers.accounts import router as accounts_router
from .routers.health import router as health_router
from .routers.performance import router as perf_router

app = FastAPI(title="Algoforce Performance Metrics API", version="dev 10.11.25.1")

app.include_router(health_router)
app.include_router(accounts_router)
app.include_router(perf_router, prefix="/v1")
