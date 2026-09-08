---
phase: 3
status: in_progress
requirements: [CAD-01, CAD-02, CAD-03, CAD-04, CAD-05, CAD-06, CAD-07]
---

# Cadet account protection and security alerts

## Plan

1. Audit the existing SQLite-backed session locks, source blocks, notifications, SSE, HTTP endpoints and responsive UI.
2. Enforce the cadet-only backend rules atomically; use an observed backend IP and threshold-based five-hour source blocks.
3. Correct the notification API/UI contract and add focused regression tests.
4. Run tests, typecheck/lint, production build, review the diff and document results.
