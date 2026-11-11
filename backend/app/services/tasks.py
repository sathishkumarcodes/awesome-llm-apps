"""Background task execution for long-running LLM work.

A single worker thread: a local Ollama model processes one request at a time anyway, and
serializing avoids memory pressure. Status is persisted on the DB row so the UI can poll.
"""

from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from app.core.logging import get_logger

log = get_logger("tasks")
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="jobmatch-worker")


def submit(fn: Callable[..., None], *args) -> None:
    def run():
        try:
            fn(*args)
        except Exception:  # the task records its own failure state; this is a last resort
            log.exception("background task crashed")

    _executor.submit(run)
