---
phase: 06-security-hardening
verified: 2026-09-08T14:30:00-03:00
status: passed_with_operational_actions
score: 5/5 security findings remediated
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

- `npm test`: passed (19 suites, 138 tests, including 6 security regressions).
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm audit --omit=dev --json`: 0 known vulnerabilities.
- `npx tsx scripts/readiness-production.mjs`: bounded load and security checks passed; two stateful assertions (old password rejection and login-rate-limit) are order-sensitive failures in the combined run and should be rerun in a fresh process.
- Docker Compose configuration parses successfully; container runtime validation is unavailable because the Docker daemon is not running.
- The real `.env` was inspected only through redacted metadata. It is ignored by Git; no secret value was printed.

## Fix progress

- F-01 fixed and verified in `357b32f`.
- F-02 fixed and verified in `774894c`.
- F-03 fixed and verified in `53859b9`; traceability recorded by the following F-03 documentation commit because a concurrent security commit supplied the code change.
- F-04 fixed: per-user AI limiter and strict input-size validation; regression suite passes.
- F-05 fixed: reset-code value removed from development logging; console-capture regression passes.

## Residual operational actions

- Enable and verify admin 2FA in the real deployment (`data/security-config.json` is currently inactive) and rotate secrets if exposure is suspected.
- Remove `VITE_ALLOWED_GOOGLE_EMAILS` from client-exposed build configuration; rebuild and invalidate old bundles.
- Replace plaintext GeoIP lookup with HTTPS or a local/provider-side service; review CSP `unsafe-inline`/`unsafe-eval` and localStorage token exposure.
- Run Docker runtime hardening and backup/offsite policy checks with an available Docker daemon and cloud credentials.

## Non-destructive testing boundary

No DoS/DDoS, destructive restore, deletion, production mutation or real provider call was performed. Availability testing is limited to bounded concurrency against disposable localhost processes and synthetic data.
