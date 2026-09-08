---
phase: 5
status: completed
requirements: [CAD-06, CAD-07]
---

# Responsividade dos alertas e notificacoes

## Plan

1. Keep desktop notification and alert presentation visually equivalent.
2. Correct mobile-only sizing for the notification bell and long notification detail tokens.
3. Refactor the security alert popup so mobile content scrolls internally and actions remain reachable in short viewports, landscape, and keyboard-height scenarios.
4. Verify bell, badge, popup, drawer, long text, long IP, dates, buttons, internal scroll, safe-area, portrait, landscape, and keyboard-height behavior.
5. Run lint, typecheck, automated tests, and production build.
