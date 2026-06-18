You are helping build the TTB Label Verification proof-of-concept.

Standing rules for the whole project:

1. Stack: Python 3.12 + FastAPI backend, React or plain HTML/JS frontend, a vision model for extraction, no database. The app must stay stateless and in-memory per request. Deploy target: a free-tier host such as Railway, or Vercel plus Render.

2. Hard requirements that override convenience:
   - Single-label result in under 5 seconds.
   - UI usable by a non-technical 70+ user with no instructions.
   - Batch upload is required, not optional.
   - Government warning is an exact, case-sensitive match.
   - All other fields are fuzzy or normalized.
   - API keys live in environment variables only. Never hardcode, never commit.

3. Working cadence:
   - When I say PLAN, propose an approach and list files and risks, but write no code.
   - When I say REVIEW, critique that plan against the requirements and edge cases, then finalize it.
   - When I say EXECUTE, implement exactly the approved plan with tests, then tell me how to verify it.
   - Keep scope to the current phase only.

4. Prefer correctness and clean structure over ambition.
