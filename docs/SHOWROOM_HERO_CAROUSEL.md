# Hero carousel preparation

Owner-approved scope: rotating supplied hero photographs, no text overlay, no redesign or new imagery. Only the two explicitly supplied photos are approved; no permission is inferred for other photos.

The reusable HeroCarousel accepts an ordered slide list (local src, actual width/height, descriptive alt). It changes slides every 3 seconds with a CSS opacity transition. Manual dots/swipes pause rotation; a visible control resumes it. Hover/focus pause, hidden-document suspension, reduced-motion static mode, and timer/subscription cleanup are implemented. Image fitting is contain, with a fixed 16:9 stage, so the component does not crop faces, dresses or shoes. Actual framing still requires inspection of the real files and a mobile browser.

Asset blocker: the supported Library preparation request with explicit Windows destination returned transfers but no local workspace paths. Both intended consumer files are absent, and Python for the mandatory Library transfer/identity helper is unavailable. The Library image read returned metadata/pointers, not viewable image pixels. No raw-URL transfer, alternate download route, new software install, or substitute photo was used. Thus real pixels have not been inspected and heroSlides remains empty; the existing placeholder stays visible. Add verified local assets to hero-slides.ts only after the supported transfer succeeds.

Validation: synthetic lifecycle tests cover timing/wrap, pause/resume, hover/focus, visibility, dots/swipes/vertical gesture cancellation, reduced motion, zero/one-slide behavior, repeated unmount/remount and cleanup. Existing rendered home test also passes. These tests do not validate real photos or real iPhone rendering.
