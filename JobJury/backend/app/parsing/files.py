"""Upload validation: file type sniffing, size limits, filename sanitizing."""

from __future__ import annotations

import io
import re
import unicodedata
import zipfile

from app.core.errors import FileTooLargeError, InvalidFileError


def sanitize_filename(name: str) -> str:
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = name.replace("\\", "/").rsplit("/", 1)[-1]
    name = re.sub(r"[^A-Za-z0-9._ -]", "", name).strip().replace(" ", "_")
    name = re.sub(r"_+", "_", name).lstrip(".")
    return name[:120] or "upload"


def detect_file_type(data: bytes, filename: str) -> str:
    """Return 'pdf' or 'docx' based on content (magic bytes), cross-checked with extension."""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if data[:5] == b"%PDF-":
        if ext not in ("pdf", ""):
            raise InvalidFileError("File content is PDF but the extension is not .pdf.")
        return "pdf"
    if data[:4] == b"PK\x03\x04":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                names = set(zf.namelist())
        except zipfile.BadZipFile as exc:
            raise InvalidFileError("The DOCX file is corrupted.") from exc
        if "word/document.xml" in names:
            if ext not in ("docx", ""):
                raise InvalidFileError("File content is DOCX but the extension is not .docx.")
            return "docx"
    if ext == "doc":
        raise InvalidFileError("Legacy .doc files are not supported. Save as .docx or PDF.")
    raise InvalidFileError("Unsupported file type. Upload a PDF or DOCX file.")


def check_size(data: bytes, max_mb: int) -> None:
    if not data:
        raise InvalidFileError("The uploaded file is empty.")
    if len(data) > max_mb * 1024 * 1024:
        raise FileTooLargeError(f"File exceeds the {max_mb} MB limit.")
