# JobMatchAI

AI job-fit intelligence and truth-preserving resume tailoring. It simulates a **recruiter** and a
**hiring manager**, recommends whether to apply, and tailors your resume without ever adding
experience you don't have.

> Work in progress: the backend (parsing, matching, evaluators, tailoring, factuality validation,
> DOCX/PDF export) is in place. The React frontend is next.

## Quick start (backend)

```bash
cp .env.example .env
ollama serve &              # local LLM, nothing leaves your machine
ollama pull qwen3:4b
cd backend && uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```
