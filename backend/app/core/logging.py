"""Logging setup.

Privacy rule: never log resume contents, job descriptions, or LLM prompts/responses.
Log identifiers, sizes, timings, and error types only.
"""

import logging


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # httpx logs full request URLs at INFO; keep it quiet.
    logging.getLogger("httpx").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"jobmatchai.{name}")
