# path: api/app.py
#!/usr/bin/env python3
"""FastAPI application entrypoint for Algoforce Metrics API."""

from __future__ import annotations

from fastapi import FastAPI

from api_test.routers.accounts import router as accounts_router
from api_test.routers.health import router as health_router
from api_test.routers.metrics.performance import router as performance_router

app = FastAPI(title="Algoforce Metrics API", version="4.2.0")

# Routers
app.include_router(health_router, prefix="/api")
app.include_router(accounts_router, prefix="/api")
app.include_router(performance_router, prefix="/api")
