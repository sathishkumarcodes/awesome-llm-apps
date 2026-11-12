# awesome-llm-apps

A collection of LLM applications. Each app lives in its own folder with its own README,
setup steps and dependencies.

| App | What it does | Stack |
|---|---|---|
| [JobJury](JobJury/) | Builds a hiring scorecard for a specific job, judges your resume against it with quoted evidence, and tailors the resume without inventing anything. Runs locally with Ollama or with hosted models. | FastAPI, SQLite, React, Ollama / OpenAI / Anthropic |
| [joy-logger](joy-logger/) | OneGoodThing: a daily micro-journal that replies to each entry with a short AI reflection and writes monthly summaries, life insights and shareable quote cards. | React, Supabase (edge functions), Gemini 2.5 Flash via Lovable AI gateway |
| [Moona](Moona/) | Investment portfolio tracker for stocks, crypto, ETFs and bonds, with live prices, analytics and exchange imports. Portfolio insights are currently rule-based, not LLM-generated. | FastAPI, React, Supabase |

Each app keeps the commit history from its original repository.

## Getting started

```bash
git clone https://github.com/sathishkumarcodes/awesome-llm-apps.git
cd awesome-llm-apps/<app>
```

Then follow that app's README.
