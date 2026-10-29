---
name: ux-interaction-performance-optimiser
description: Improve Kairo page loading, layout stability and interaction feedback when refactoring frontend assets or expensive UI.
---

Inspect frontend/app.js, page-loader.js and home-art.js before changing loading behavior. Reserve media dimensions and preserve the existing collectible silhouette. Initialize the homepage medal and Anatomy press independently of API readiness; render the press SVG in initial HTML. Retain working fallbacks, retry controls and reduced-motion support. Do not make offscreen images or metadata-only video block page display.

Give API actions immediate progress feedback, prevent duplicate submissions and preserve original button content. Optimistic updates are appropriate only for reversible operations with rollback. Wallet signatures, publication, consent and mint confirmation must report their actual server or chain state.

Verify loading behavior with frontend/page-loader.test.js and frontend/home-art.test.js and relevant connected-app tests. Record any browser or performance measurement that could not be run.
