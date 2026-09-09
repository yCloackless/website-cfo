# Phase 1 - Exam bank and correction

## Delivered

- Extraction jobs persist their payload and are marked `failed` on errors.
- Queued jobs are processed by a SQLite-backed worker and stale processing jobs are requeued after restart.
- Production never fabricates questions when extraction returns no questions.
- Exam papers have `DRAFT`, `IN_REVIEW`, `PUBLISHED`, and `REJECTED` publication states.
- Questions have `PENDING`, `APPROVED`, and `REJECTED` review states.
- Filename-based assets require a database record and backend ownership validation.
- Full-page previews use a dedicated authorized endpoint.
- Heuristic AI fallback is marked as not independently reviewed and uses minimum confidence.
- Hardcoded average time is no longer reported as real data.

## API workflow

1. Upload and validate the source file.
2. Extract and persist questions.
3. `POST /api/exams/:id/review` validates and approves the extracted questions.
4. `POST /api/exams/:id/publish` publishes only a fully reviewed exam.

## Verification

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `test/exam_bank.test.ts`: 8/8 passed.
- `test/download_functions.test.ts`: 5/5 passed.
- `test/database_resilience.test.ts`: 7/7 passed.

Provider timeouts and 503 responses were handled without corrupting the database.
