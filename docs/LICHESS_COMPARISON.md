# Lichess comparison and implementation tracker

Date: 2026-11-13. Lila source reviewed: `3e79a4579cb02b83d6fc7fe2e855cf8ff5949e20`.
Scope: repository inventory and focused reading of analysis, engines, board,
storage, scoring, practice, accessibility and tests. This was not a backend audit.

## Work selected now

- [x] Keep the live engine warm and cache completed results by history and settings.
  Implemented in `ae17ec4b`; both engines passed Chrome checks and 632 app tests.
- [x] Repair the maintained browser smoke test for the current product. Remove
  retired ratings assertions and cover current accuracy and analysis workflows.
- [x] Move independent sacrifice/exchange classification into an importable module
  and test it directly. Preserve classification behavior and existing notices.
- [x] Restore normal Tab access to review controls without disturbing modal focus.
- [x] Retain explored continuations in memory and provide an Explored lines selector.
  Manual moves, engine-line playback and best-move playback preserve replaced
  continuations. Switching restores evaluations and the previous selected move;
  settings changes invalidate saved evaluations. Loading another game clears lines.

## Comparison and decisions

1. **Responsibilities.** Lichess separates tree, board, protocol, storage and
   practice. Our engine and learning modules already do this, but `analysis.js`
   still mixes classification, rendering and persistence. Start with independent
   classification code; defer the remaining storage/classifier extraction until
   its callers can move together without a broad rewrite.
2. **Variations.** Lichess keeps children on move-tree nodes; ours truncates a
   continuation when branching. The implemented first version keeps line snapshots
   and offers a selector, reusing existing navigation and grading. A full tree UI,
   multi-variation PGN import/export and reload persistence remain deferred.
   Copy PGN exports the selected standalone line; retained alternatives are tab-local.
3. **Board.** Chessground is a standalone reusable board with dragging, arrows,
   resizing and movement/fading animations. Evaluate it before adding substantial
   custom board machinery. Adoption is deferred until our badge overlays and
   learning interactions have a tested integration; smoothness was not benchmarked.
4. **Tests.** Our browser smoke test still expected deleted rating controls.
   Repair it first. Direct unit tests should supplement the existing app harness.
5. **Accessibility.** Lichess has keyboard and nonvisual interfaces. Restore normal
   keyboard traversal now; a full nonvisual board is a separate feature.
6. **Persistence.** Lichess stores eligible local evaluations in IndexedDB by
   analysis identity and path (synthetic imports are excluded). Our live cache is
   intentionally tab-local. Persistent explored analysis is deferred with the tree
   model; no second storage architecture is needed merely to keep a cache.
7. **Scoring.** SF19 move accuracy already uses the Lichess-style curve. Lichess
   combines volatility-weighted and harmonic means; we use ordinary and harmonic
   means. Keep this documented difference. Lichess live annotation labels errors;
   it does not replace our Great/Brilliant policy. No scoring change selected.

## Sources

- [Analysis modules](https://github.com/lichess-org/lila/tree/3e79a4579cb02b83d6fc7fe2e855cf8ff5949e20/ui/analyse/src)
- [Tree](https://github.com/lichess-org/lila/blob/3e79a4579cb02b83d6fc7fe2e855cf8ff5949e20/ui/lib/src/tree/tree.ts)
- [Engine controller](https://github.com/lichess-org/lila/blob/3e79a4579cb02b83d6fc7fe2e855cf8ff5949e20/ui/lib/src/ceval/ctrl.ts)
- [Persistence](https://github.com/lichess-org/lila/blob/3e79a4579cb02b83d6fc7fe2e855cf8ff5949e20/ui/analyse/src/idbTree.ts)
- [Live labels](https://github.com/lichess-org/lila/blob/3e79a4579cb02b83d6fc7fe2e855cf8ff5949e20/ui/analyse/src/liveAnnotate.ts)
- [Accuracy](https://github.com/lichess-org/lila/blob/3e79a4579cb02b83d6fc7fe2e855cf8ff5949e20/modules/analyse/src/main/AccuracyPercent.scala)
- [Chessground](https://github.com/lichess-org/chessground/tree/b4f605018e1043640c917e82a74b214cb58e4a05)

## Verification

- All 632 app tests passed, including classification, cache, keyboard and modal tests.
- `node scripts/browser-smoke.mjs --working-tree chrome` passed with real SF19 and
  Lite: reviews, badges, accuracy, Concepts, responsive layouts, learning,
  reload/session recovery and one-time settings-reset behavior.
- Source verification passed. No engine/scoring equations or thresholds changed.
- Browser smoke now switches to Insights before measuring its contents and checks
  the current green default. Working-tree mode tests current source without a full
  release export. Temporary test copies/profiles are cleaned after the run.
- Firefox and the full historical research suite were not run in this follow-up.
- Retained-lines follow-up: all 636 app tests passed. Added tests for switching
  continuations with evaluations intact, exiting/reopening a review alternative,
  promotion identity, setting invalidation, new-game cleanup and selected-line PGN.
  The maintained Chrome smoke passed branch restoration with both SF19 and Lite,
  alongside its existing review, layout, learning and recovery checks.
