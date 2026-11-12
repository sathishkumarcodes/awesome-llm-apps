"""Layer 2: semantic matching with sentence-transformers embeddings.

Uses exact cosine similarity with numpy. Resumes have tens of lines, so an ANN index
(FAISS) adds nothing for the MVP; ``SemanticIndex`` is the seam to swap one in.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from app.core.config import get_settings
from app.core.logging import get_logger
from app.schemas.document import DocLine

log = get_logger("semantic")


@lru_cache
def _model():
    from sentence_transformers import SentenceTransformer

    name = get_settings().embedding_model
    log.info("loading embedding model %s", name)
    return SentenceTransformer(name)


def embed(texts: list[str]) -> np.ndarray:
    if not texts:
        return np.zeros((0, 384), dtype=np.float32)
    return np.asarray(
        _model().encode(texts, normalize_embeddings=True, show_progress_bar=False),
        dtype=np.float32,
    )


@dataclass
class Hit:
    line_id: str
    score: float


class SemanticIndex:
    """Cosine-similarity search over resume lines."""

    def __init__(self, lines: list[DocLine]):
        # Headings and the contact/header block are never evidence for a requirement.
        self.lines = [
            ln
            for ln in lines
            if ln.kind != "heading" and ln.section != "header" and len(ln.text) >= 12
        ]
        self.matrix = embed([ln.text for ln in self.lines])

    def search_many(self, queries: list[str], k: int = 4) -> list[list[Hit]]:
        if not queries or not self.lines:
            return [[] for _ in queries]
        q = embed(queries)
        sims = q @ self.matrix.T
        results = []
        for row in sims:
            idx = np.argsort(-row)[:k]
            results.append([Hit(self.lines[i].id, float(row[i])) for i in idx])
        return results

    def cosine(self, queries: list[str]) -> np.ndarray:
        """Similarity matrix (queries × indexed lines)."""
        if not queries or not self.lines:
            return np.zeros((len(queries), len(self.lines)), dtype=np.float32)
        return embed(queries) @ self.matrix.T

    def relevance(self, line_texts: list[str], queries: list[str]) -> list[float]:
        """Max similarity of each text to any query (used to order bullets and skills)."""
        if not line_texts or not queries:
            return [0.0] * len(line_texts)
        a, b = embed(line_texts), embed(queries)
        return [float(x) for x in (a @ b.T).max(axis=1)]
