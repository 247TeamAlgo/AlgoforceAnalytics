# api/logging_config.py
import logging
import sys
from logging.config import dictConfig
from pathlib import Path

# Of course idk this shit, gpt does tho
try:
    from pythonjsonlogger import jsonlogger
    HAVE_JSON = True
except Exception:
    HAVE_JSON = False

class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = ""
        return True


def build_logging_config(
    json: bool = False,
    log_file: str | None = None,        # e.g. "logs/app.log"
    access_file: str | None = None,     # e.g. "logs/access.log"
    rotate_when: str = "midnight",      # "S","M","H","D","midnight","W0"-"W6"
    backup_count: int = 7,
) -> dict:
    """dictConfig for app + uvicorn, with optional file handlers + rotation."""

    # ensure directories exist if file paths were provided
    for f in (log_file, access_file):
        if f:
            Path(f).parent.mkdir(parents=True, exist_ok=True)

    time_fmt = "%Y-%m-%dT%H:%M:%S%z"

    formatters = {
        "plain": {
            "format": "%(asctime)s | %(levelname)s | %(name)s | %(request_id)s | %(message)s",
            "datefmt": time_fmt,
        }
    }
    if json and HAVE_JSON:
        formatters["json"] = {
            "()": jsonlogger.JsonFormatter,
            "fmt": "%(asctime)s %(levelname)s %(name)s %(request_id)s %(message)s",
            "datefmt": time_fmt,
        }

    # filters
    filters = {
        "request_id": {"()": RequestIdFilter},
    }

    # stdout handlers
    handlers: dict = {
        "stdout": {
            "class": "logging.StreamHandler",
            "stream": sys.stdout,
            "formatter": "json" if (json and HAVE_JSON) else "plain",
            "filters": ["request_id"],
        }
    }

    # timed rotating file handlers (created only if path provided)
    if log_file:
        handlers["file_app"] = {
            "class": "logging.handlers.TimedRotatingFileHandler",
            "filename": log_file,
            "when": rotate_when,
            "backupCount": backup_count,
            "encoding": "utf-8",
            "formatter": "json" if (json and HAVE_JSON) else "plain",
            "filters": ["request_id"],
            "utc": True,
        }
    if access_file:
        handlers["file_access"] = {
            "class": "logging.handlers.TimedRotatingFileHandler",
            "filename": access_file,
            "when": rotate_when,
            "backupCount": backup_count,
            "encoding": "utf-8",
            "formatter": "json" if (json and HAVE_JSON) else "plain",
            "filters": ["request_id"],
            "utc": True,
        }

    # pick handler sets
    app_handlers = ["stdout"] + (["file_app"] if "file_app" in handlers else [])
    access_handlers = ["stdout"] + (["file_access"] if "file_access" in handlers else [])

    loggers = {
        # uvicorn core+errors to app handlers
        "uvicorn":       {"level": "INFO", "handlers": app_handlers, "propagate": False},
        "uvicorn.error": {"level": "INFO", "handlers": app_handlers, "propagate": False},
        # uvicorn access to access handlers
        "uvicorn.access":{"level": "INFO", "handlers": access_handlers, "propagate": False},

        # your app namespace
        "app":           {"level": "INFO", "handlers": app_handlers, "propagate": False},

        # tune noisy libs as needed
        "sqlalchemy.engine": {"level": "WARNING", "handlers": app_handlers, "propagate": False},
        "httpx":              {"level": "WARNING", "handlers": app_handlers, "propagate": False},
    }

    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": formatters,
        "filters": filters,
        "handlers": handlers,
        "loggers": loggers,
    }


def configure_logging(
    json: bool = False,
    log_file: str | None = None,
    access_file: str | None = None,
    rotate_when: str = "midnight",
    backup_count: int = 7,
) -> None:
    cfg = build_logging_config(
        json=json,
        log_file=log_file,
        access_file=access_file,
        rotate_when=rotate_when,
        backup_count=backup_count,
    )
    dictConfig(cfg)
