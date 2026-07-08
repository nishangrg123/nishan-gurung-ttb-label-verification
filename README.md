# TTB Label Verification

TTB Label Verification is a stateless proof-of-concept for checking alcohol beverage label images against submitted application data. It supports single-label verification and batch upload, extracts seven label fields with an OpenAI vision model, compares each extracted field against the submitted values, and returns per-field results plus an overall `APPROVED` or `NEEDS_REVIEW` verdict.

## Live Demo

- Frontend: https://nishan-gurung-ttb-label-verificatio.vercel.app/
- Backend base URL: https://ttb-label-verification-api.onrender.com
- Backend health check: https://ttb-label-verification-api.onrender.com/health

## What It Does

The app verifies these seven application fields against the label image:

- Brand name
- Type/class of alcohol
- ABV
- Net contents
- Producer
- Country of origin
- Government warning

Users can submit one label or a batch of labels. The backend returns field-level `PASS` / `FAIL` results, the expected application value, the extracted label value, a match strategy, model latency, and an overall verdict.

## Architecture

- `backend/app/main.py`: FastAPI HTTP layer. It owns request parsing, response status mapping, CORS, upload validation, and endpoint wiring.
- `backend/app/verification.py`: Composition layer. It parses application JSON, caches the real vision service once per process, calls the vision provider, and hands results to comparison.
- `backend/app/vision.py`: Vision integration boundary. `VisionService` is a protocol implemented by `FakeVisionService` for tests and `OpenAIVisionService` for real extraction through the OpenAI Responses API.
- `backend/app/comparison.py`: Pure comparison rules. It normalizes field values, applies fuzzy/numeric/synonym/exact checks, and produces the final verdict.
- `backend/app/models.py`: Pydantic request/response models and API contract types.

## Tech Stack

- Backend: Python 3.12, FastAPI, Pydantic, Pillow, uv
- Frontend: React, TypeScript, Vite
- Vision: OpenAI Responses API with `gpt-4o-mini`
- Backend hosting: Render
- Frontend hosting: Vercel

## Model Configuration

The default model is `gpt-4o-mini`, configured by `VISION_MODEL` in `backend/app/config.py` and `backend/.env.example`.

The model was checked against OpenAI's current Images and Vision documentation on July 8, 2026. The docs list `GPT-4o-mini` among models with image-input support and describe image input support through the Responses API: https://developers.openai.com/api/docs/guides/images-vision

Runtime caps:

- `VISION_TIMEOUT_SECONDS`: `4.0`
- `MAX_IMAGE_BYTES`: `4000000`
- `MAX_IMAGE_DIMENSION`: `700`

Before calling the model, images are decoded with Pillow, resized to a maximum dimension of 700 pixels, converted to JPEG, and sent as a data URL.

## Environment Variables

Backend variables read by `backend/app/config.py`:

| Variable | Default | Required | Purpose |
| --- | --- | --- | --- |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Yes in deploy | Comma-separated CORS allowlist for the frontend. |
| `OPENAI_API_KEY` | empty | Yes for real vision | OpenAI API key used by `OpenAIVisionService`. |
| `VISION_MODEL` | `gpt-4o-mini` | No | OpenAI model used for label extraction. |
| `VISION_TIMEOUT_SECONDS` | `4.0` | No | HTTP timeout for the vision request. |
| `MAX_IMAGE_BYTES` | `4000000` | No | Maximum uploaded image size accepted by the API. |
| `MAX_IMAGE_DIMENSION` | `700` | No | Maximum image width/height after preprocessing. |
| `BATCH_CONCURRENCY` | `2` | No | Maximum concurrent batch item verification tasks. |
| `MAX_BATCH_SIZE` | `5` | No | Maximum labels per batch request. |

`USE_FAKE_VISION` is not read by the current backend. Fake vision is intentionally test-only and is injected with FastAPI dependency overrides, so caching the real provider cannot accidentally pin a fake/real settings toggle.

Frontend variable:

| Variable | Default | Required | Purpose |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Yes in deploy | Backend base URL used by the React app. |

## API Examples

### Health

```bash
curl https://ttb-label-verification-api.onrender.com/health
```

### Single Label Verification

```bash
curl -X POST https://ttb-label-verification-api.onrender.com/verify \
  -F 'image=@backend/samples/sample-label.png;type=image/png' \
  -F 'application_data={
    "brand_name":"Example Reserve",
    "class_type":"Whiskey",
    "abv":"45%",
    "net_contents":"750 mL",
    "producer":"Example Distilling Co.",
    "country_of_origin":"United States",
    "government_warning":"GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
  }'
```

Response shape:

```json
{
  "results": [
    {
      "field": "brand_name",
      "match_type": "fuzzy",
      "expected": "Example Reserve",
      "found": "Example Reserve",
      "status": "PASS"
    }
  ],
  "overall_verdict": "APPROVED",
  "latency_ms": 1234.56
}
```

### Batch Verification

```bash
curl -X POST https://ttb-label-verification-api.onrender.com/verify/batch \
  -F 'images=@backend/samples/sample-label.png;type=image/png' \
  -F 'images=@backend/samples/sample-label.png;type=image/png' \
  -F 'application_data=[
    {
      "brand_name":"Example Reserve",
      "class_type":"Whiskey",
      "abv":"45%",
      "net_contents":"750 mL",
      "producer":"Example Distilling Co.",
      "country_of_origin":"United States",
      "government_warning":"GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
    },
    {
      "brand_name":"Example Reserve",
      "class_type":"Whiskey",
      "abv":"45%",
      "net_contents":"750 mL",
      "producer":"Example Distilling Co.",
      "country_of_origin":"United States",
      "government_warning":"GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
    }
  ]'
```

Batch response shape:

```json
{
  "summary": {
    "passed": 2,
    "needs_review": 0,
    "total": 2
  },
  "items": []
}
```

## Comparison Rules

- Brand name, alcohol class/type, and producer use Python `SequenceMatcher` over lowercased, punctuation-stripped, whitespace-normalized text. `FUZZY_THRESHOLD = 90`. This is a character-ratio heuristic, so token reordering can lower the score even when the same words are present.
- ABV is parsed from percent, `alc./vol.`, or proof text and passes within +/- 0.1 percentage points.
- Net contents are normalized to milliliters from `mL`, `L`, `cL`, `fl oz`, or `oz`, then pass within +/- 1 mL.
- Country of origin uses explicit synonym families. Current aliases cover US/USA/U.S./United States of America, UK/Great Britain/Scotland, France/French Republic, and Mexico/United Mexican States.
- Government warning is exact and case-sensitive after whitespace collapse only. The submitted application warning is compared to the extracted warning. The app does not compare against a hardcoded statutory warning and does not strip duplicate headings.

## Performance

Target: p50 and p95 under 5 seconds for verification requests.

Measured local API timing on July 8, 2026:

- Methodology: FastAPI `TestClient`, `POST /verify`, 3 warm-up requests, 30 measured requests, `FakeVisionService` dependency override, same PNG image and application payload as the endpoint tests.
- p50: `3.16 ms`
- p95: `3.55 ms`
- max: `3.63 ms`

This local measurement validates the FastAPI path, image preprocessing, comparison rules, dependency override path, and event-loop offload overhead. It does not measure OpenAI network/model latency. Production latency depends on Render cold starts and OpenAI response time. The frontend warns users that the first Render free-tier request may take up to a minute while the server wakes up.

## Live Smoke Check

Health check:

```bash
curl https://ttb-label-verification-api.onrender.com/health
```

Live verification smoke check:

```bash
curl -X POST https://ttb-label-verification-api.onrender.com/verify \
  -F 'image=@backend/samples/sample-label.png;type=image/png' \
  -F 'application_data={
    "brand_name":"Example Reserve",
    "class_type":"Whiskey",
    "abv":"45%",
    "net_contents":"750 mL",
    "producer":"Example Distilling Co.",
    "country_of_origin":"United States",
    "government_warning":"GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
  }'
```

Scripted live smoke check:

```bash
cd backend
uv run python scripts/phase6_live_check.py
```

The `/verify` smoke check requires `OPENAI_API_KEY` to be set on Render.

## Assumptions

- The submitted application data is the source of truth.
- Extracted label fields may be partial; missing extracted fields fail without crashing the request.
- The government warning should be submitted in the same case and wording expected on the label.
- Batch requests must provide one application record per uploaded image.
- The app is stateless and does not persist images, extracted text, or verification results.

## Limitations

- OCR/vision extraction can fail on blurry, low-resolution, stylized, or obstructed labels.
- Fuzzy matching can produce false positives or false negatives, especially with token reordering.
- Country aliases are explicit and not a full global geography ontology.
- The comparison logic is English/Latin-script oriented and does not handle non-Latin scripts.
- The app does not validate TTB legal compliance beyond comparing submitted values to extracted label values.
- Render free-tier cold starts can make the first live request much slower than warm requests.

## Tradeoffs

- `SequenceMatcher` was chosen because it is simple, deterministic, and dependency-free; a token-based matcher could better handle reordered names but would add more implementation complexity.
- The real vision service is cached once per process to avoid repeated provider setup. Tests use dependency overrides instead of settings mutation so the cache stays safe.
- Batch verification allows per-item errors instead of failing the whole batch, which gives reviewers partial results when one image is invalid.
- Image preprocessing reduces latency and payload size, but very small text can become harder for the model if the original label is already low quality.

## Secret Handling

- Real `.env` files are gitignored by `.gitignore`.
- `.env.example`, `backend/.env.example`, and `frontend/.env.example` contain placeholders only.
- `OPENAI_API_KEY` is declared in `render.yaml` with `sync: false`, so Render prompts for the secret instead of storing it in git.
- The frontend never receives the OpenAI API key; all model calls happen server-side.

## Approach

The project was built in small phase gates:

1. Define a thin FastAPI API and Pydantic response contracts.
2. Add a React UI for single and batch verification.
3. Isolate vision extraction behind a `VisionService` protocol.
4. Implement deterministic comparison rules and schema-locking tests.
5. Add deployment configuration for Render and Vercel.
6. Tighten runtime behavior with cached provider construction, async offload, and live deployment documentation.

Each change was reviewed against the assignment requirements, then verified with backend tests and frontend builds before commit.

## Tools

AI assistance was used as an engineering workflow aid:

- Codex helped inspect the repository, plan changes, edit code, and run validation commands.
- Claude-style review feedback was used as a checklist for architecture, API contract, deployment, and README gaps.
- AI-generated changes were reviewed through diffs, targeted tests, full test runs, and build checks before being accepted.

Human review decisions included API contract choices, deployment URL selection, secret handling, and whether test-only fakes should remain outside runtime settings.

## Testing

Backend:

```bash
cd backend
uv run pytest
```

Current backend result:

```text
55 passed
```

Frontend tests:

```bash
cd frontend
npm run test
```

Frontend build:

```bash
cd frontend
npm run build
```

The backend tests cover health, single verification, batch verification, strict batch summary shape, comparison rules, image validation, vision parsing, and fake/real provider wiring. The frontend smoke test verifies that the single-label form posts the image and all seven application fields to `/verify`.

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

Frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Local URLs:

- Backend: http://localhost:8000
- Backend health: http://localhost:8000/health
- Frontend: http://localhost:5173

## Deployment Steps

Backend on Render:

1. Create a Render Blueprint or Web Service from this GitHub repo.
2. Use `render.yaml`.
3. Confirm `rootDir` is `backend`.
4. Set `ALLOWED_ORIGINS` to the Vercel frontend URL.
5. Set `OPENAI_API_KEY` as a secret Render environment variable.
6. Deploy and verify `https://ttb-label-verification-api.onrender.com/health`.

Frontend on Vercel:

1. Import this GitHub repo into Vercel.
2. Use `vercel.json`.
3. Set `VITE_API_BASE_URL` to `https://ttb-label-verification-api.onrender.com`.
4. Deploy and open `https://nishan-gurung-ttb-label-verificatio.vercel.app/`.
