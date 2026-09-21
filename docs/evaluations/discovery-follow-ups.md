# Discovery follow-up evaluation — 2026-09-22

## Existing v2 visual audit

Rendered the bold/kinetic, density, compact-spacing and motion pairs with the actual `Specimen` component at 1440×1100. Density and spacing reuse the same split composition: density changes compact to airy, while the follow-up narrows compact to balanced (or airy to expansive following an airy answer). They are distinct ranges but visually repetitive. Bold versus kinetic also changes palette, typography and composition; it cannot isolate motion preference. The motion pair holds those qualities constant.

Under normal motion, the still example had zero active animations and the moving example had four. With reduced motion both had zero. The visual audit confirmed the same composition in both motion cards; treating those static views as an animation preference would be misleading.

## Delivered behavior

New v3 sessions have ten main questions and an optional follow-up chooser. Choosing both or depends does not trigger either probe. Follow-up selections persist, use canonical spacing/motion order, and adapt to preceding density answers. Old catalogs remain intact. When a change invalidates the sequence, dependent answers are dropped rather than silently reassigned. Skipped motion supplies no profile evidence.

## Validation

Browser trial completed all ten main questions using “both,” finished without probes, reopened optional comparisons, chose motion, switched to reduced motion and skipped, then added spacing and resumed after reload. It completed the probes, retained the selection and recorded skipped motion without preference. At 390×844 the spacing view stacked the examples without horizontal overflow. Inspected desktop follow-up chooser, reduced-motion notice, and narrow spacing layout. No page errors observed. A separate browser regression resumed a versionless historical session, displayed the original first two v1 questions and persisted `direction-1` rather than a newer catalog ID.

Unit tests in `lib/follow-ups.test.ts` cover v1/v2 compatibility, ten-question completion, both/depends, deterministic optional questions, malformed selections, backtracking, hidden evidence exclusion and skipped-motion semantics. `local/sessions.mjs` preserves v3 selections through the server validator; collection imports default to v3.

This verifies the flow and persistence. Whether optional probes feel useful rather than repetitive still needs real user use; this trial does not certify taste learning.
