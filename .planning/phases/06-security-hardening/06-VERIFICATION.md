---
phase: 06-security-hardening
verified: 2026-09-08T14:30:00-03:00
status: gaps_found
score: 0/5 security findings remediated
---

# Phase 6: Security hardening verification

**Scope:** Express API, React client trust boundaries, SQLite persistence, Google/Notion/Gemini integrations, secrets, dependencies, Docker and backup/restore controls.

## Audit-Fix Classification

| ID | Finding | Severity | Classification | File references | Validation |
|---|---|---|---|---|---|
| F-01 | Persisted 2FA activation is ignored unless `ADMIN_REQUIRE_2FA=true`; `twoFactorEnforced` also reports changes without persisting them | high | auto-fixable | `server.ts:624`, `server.ts:2463` | Source trace and isolated HTTP regression |
| F-02 | An authenticated admin session can retrieve the long-lived TOTP secret after 2FA is active | high | auto-fixable | `server.ts:916` | Isolated HTTP regression verifies secret disclosure |
| F-03 | Notion check-in accepts an arbitrary `pageId` and sends it to the privileged provider API without proving it belongs to the configured dataset | high | auto-fixable | `server.ts:3887`, `notionBackend.ts:285` | Provider fetch is intercepted locally; no external call |
| F-04 | Authenticated AI routes have no dedicated quota and accept oversized prompt fields, enabling provider quota/cost and resource exhaustion | medium | auto-fixable | `server.ts:3104`, `server.ts:3107`, `server.ts:3447`, `server.ts:3752` | Bounded local request tests; provider disabled |
| F-05 | Password-reset codes are written to development console logs | medium | auto-fixable | `src/services/emailService.ts:155` | Console capture with synthetic reset code |

## Baseline evidence

- `npm test`: passed (116 tests before the new security regressions).
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm audit --omit=dev --json`: 0 known vulnerabilities.
- `npx tsx scripts/readiness-production.mjs`: all production HTTP checks passed in a disposable directory.
- Docker Compose configuration parses successfully; container runtime validation is unavailable because the Docker daemon is not running.
- The real `.env` was inspected only through redacted metadata. It is ignored by Git; no secret value was printed.

## Non-destructive testing boundary

No DoS/DDoS, destructive restore, deletion, production mutation or real provider call was performed. Availability testing is limited to bounded concurrency against disposable localhost processes and synthetic data.
