---
name: repo-ux-accessibility-audit
description: Audit Kairo frontend semantics, keyboard navigation, focus, contrast and touch interactions during UX changes.
---

Use native buttons and anchors for actions and navigation. Keep video controls outside links. Provide visible keyboard focus, readable disabled states and immediate busy state announcements. Native disabled attributes enforce semantics; synchronize aria-disabled while changing an action’s busy state.

Keep the native dialog focus trap and Escape behavior; check focus restoration and scroll containment. The mobile menu is a disclosure, not a modal: Escape restores focus, outside interaction closes it and every link remains keyboard accessible. Announce route changes and move focus to main after user navigation.

Check text contrast against WCAG AA (4.5:1 for ordinary text), 44px touch targets, reduced motion and layouts at 320, 390, 768, 1280 and 1920 widths. Run existing automated checks and real-browser verification when available. Do not describe a DOM test as visual or real-device verification.
