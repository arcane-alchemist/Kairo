---
name: journey-state-flow-validator
description: Review Kairo user journeys for loading, empty, error, recovery and form-preservation states before changing primary flows.
---

Trace discovery, wallet sign-in, collection lookup, event creation and organizer/admin paths touched by the change. Check loading placeholders, actionable empty states, inline errors and working retry actions. A failed refresh must preserve existing data and unsaved form inputs.

Preserve event text drafts using event-draft.js and tab-scoped storage. Never save files, recipient lists, wallet credentials or consent in drafts. Explain that uploads require reselection. Clear drafts after successful publication or an explicit reset; keep resumable publication IDs separate from editable text drafts.

Use connected-app regression tests for actual state transitions, including validation failure, leaving and returning to the editor, interrupted publication and stale responses.
