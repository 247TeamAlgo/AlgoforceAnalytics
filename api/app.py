"""FastAPI app entrypoint."""

from fastapi import FastAPI

from .routers.accounts import router as accounts_router
from .routers.health import router as health_router
from .routers.metrics import router as metrics_router

app = FastAPI(title="Algoforce Performance Metrics API", version="4.0.0")

app.include_router(health_router, prefix="/v1")
app.include_router(accounts_router, prefix="/v1")
app.include_router(metrics_router, prefix="/v1")
