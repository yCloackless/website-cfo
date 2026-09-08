---
phase: 4
status: completed
requirements: [CAD-06, CAD-07]
---

# Central de notificacoes

## Plan

1. Reuse the existing header bell and unread badge integration.
2. Refine the notification center into a non-blocking desktop dropdown and a mobile drawer/bottom sheet with internal scrolling.
3. Show notification type, title, short description, date/time, read status, filters, and a "Ver detalhes" action.
4. Preserve notification persistence by marking items as read without removing them automatically.
5. Verify lint, typecheck, production build, and responsive viewport behavior at 320, 360, 375, 390, 414, 430, 768, and desktop widths.
