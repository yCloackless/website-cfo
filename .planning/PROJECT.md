# CFO CBMERJ

## Current State

Phase 5 corrects the mobile alert and notification experience while preserving the desktop presentation.

## Locked decisions

- Only `cadet` is subject to exclusive-session, 24-hour and temporary-source rules.
- The backend and SQLite database are authoritative.
- A five-hour source block requires three blocked concurrent-session attempts from the same observed IP within fifteen minutes.
- Existing SSE is reused for authorized administrators.
- Important security notifications are not auto-deleted by the UI; read actions update status while keeping the item visible in the center.
- Mobile alerts and notification drawers must keep critical content accessible through internal scroll instead of clipping or causing global horizontal overflow.
