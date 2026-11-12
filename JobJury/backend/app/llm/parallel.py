"""Run independent LLM calls concurrently.

Hosted models handle many requests at once, so calls run in parallel. A local Ollama model
on a laptop serves one request at a time, so calls stay sequential there (set
OLLAMA_PARALLEL to raise it if your machine and `OLLAMA_NUM_PARALLEL` allow).

Each worker runs in a copy of the caller's context, so a background job's pinned model
(see provider.pinned) applies inside the workers too.
"""

from __future__ import annotations

import contextvars
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from typing import TypeVar

from app.core.config import get_settings
from app.llm.provider import PROVIDERS, current_choice

T = TypeVar("T")
R = TypeVar("R")

CLOUD_PARALLEL = 8


def workers() -> int:
    info = PROVIDERS.get(current_choice().provider)
    if info is None or info.local:
        return max(1, get_settings().ollama_parallel)
    return CLOUD_PARALLEL


def pmap(fn: Callable[[T], R], items: Iterable[T]) -> list[R]:
    """Like list(map(fn, items)), concurrently when the active model allows it."""
    items = list(items)
    n = min(workers(), len(items))
    if n <= 1:
        return [fn(it) for it in items]
    with ThreadPoolExecutor(max_workers=n, thread_name_prefix="llm") as ex:
        futures = [ex.submit(contextvars.copy_context().run, fn, it) for it in items]
        return [f.result() for f in futures]


def run_both(a: Callable[[], T], b: Callable[[], R]) -> tuple[T, R]:
    """Run two independent calls, concurrently when the active model allows it."""
    if workers() <= 1:
        return a(), b()
    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="llm") as ex:
        fa = ex.submit(contextvars.copy_context().run, a)
        fb = ex.submit(contextvars.copy_context().run, b)
        return fa.result(), fb.result()
