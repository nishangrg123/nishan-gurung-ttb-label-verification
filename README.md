# TTB Label Verification

TTB alcohol beverage label verification proof-of-concept. The app will accept a label image plus structured application data, extract label fields with a vision model, and compare each field against the submitted values.

## Status

Phase 0 is a deployable skeleton:

- FastAPI backend with `GET /health`
- React/Vite frontend that calls the backend health endpoint
- Environment-variable based configuration
- No database; all future verification work will remain stateless per request

## Tech Stack

- Backend: Python 3.12, FastAPI, uv
- Frontend: React, TypeScript, Vite
- Deployment target: Render for the backend, Vercel for the frontend

## Live Demo

- Frontend: https://nishan-gurung-ttb-label-verificatio.vercel.app/
- Backend base URL: https://ttb-label-verification-api.onrender.com
- Backend health check: https://ttb-label-verification-api.onrender.com/health

## Local Setup

Install prerequisites:

- Python 3.12
- uv
- Node.js 22+
- npm

Backend:

```bash
cd backend
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload
```

The backend will run at:

```text
http://localhost:8000
```

Health check:

```bash
curl http://localhost:8000/health
```

Frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The frontend will run at:

```text
http://localhost:5173
```

## Environment Variables

Backend:

```text
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Frontend:

```text
VITE_API_BASE_URL=http://localhost:8000
```

Never commit real `.env` files or API keys. This repo includes `.env.example` files only.

## Tests

Backend:

```bash
cd backend
uv run pytest
```

Frontend build check:

```bash
cd frontend
npm run build
```

## Comparison Strategy

The backend compares extracted label fields against the submitted application values and returns field-level pass/fail results.

- Brand name, alcohol class/type, and producer use Python `SequenceMatcher` over lowercased, punctuation-stripped, whitespace-normalized text. The fuzzy threshold is `FUZZY_THRESHOLD = 90`, so token-order changes can still affect the character-ratio score.
- ABV is parsed from percent, `alc./vol.`, or proof text and passes within 0.1 percentage points.
- Net contents are normalized to milliliters from `mL`, `L`, `cL`, `fl oz`, or `oz`, then pass within +/- 1 mL.
- Country of origin uses explicit synonym families, including US, UK, France, and Mexico aliases.
- Government warning is exact and case-sensitive after whitespace collapse only. It compares the submitted application warning to the extracted warning; it does not compare against a hardcoded statutory warning.

## Deployment

Backend on Render:

1. Create a new Render Blueprint from this GitHub repo.
2. Use the root `render.yaml`.
3. Set `ALLOWED_ORIGINS` to the deployed Vercel frontend URL.
4. Deploy the service.

Frontend on Vercel:

1. Import this GitHub repo into Vercel.
2. Use the root `vercel.json`.
3. Set `VITE_API_BASE_URL` to the deployed Render backend URL.
4. Deploy the frontend.

Exit check for Phase 0: the deployed frontend loads and displays the backend `/health` response.

## Planned Features

- Single-label verification flow
- Field-by-field comparison result
- Batch upload and summary
- Vision-model label extraction
- Strict exact match for the government warning
