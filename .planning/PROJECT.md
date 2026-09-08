# CFO CBMERJ

## Current State

Phase 3 hardens the existing cadet account session controls and security-alert experience without changing the administrative login flow or introducing 2FA work.

## Locked decisions

- Only `cadet` is subject to exclusive-session, 24-hour and temporary-source rules.
- The backend and SQLite database are authoritative.
- A five-hour source block requires three blocked concurrent-session attempts from the same observed IP within fifteen minutes.
- Existing SSE is reused for authorized administrators.
