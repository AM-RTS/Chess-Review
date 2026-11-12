# P010: reuse two-line evaluations for rough ratings

2026-11-12, user-authorized local implementation. Evidence:
[E281](../experiments/E281-two-line-rating/RESULT.md).

Both SF19 builds use at least two main analysis lines. Rating features now use
the root before each played move and the existing root after it, reversing the
child's side-to-move expected score. Best/forced moves have zero loss; terminal
mate/draw handling and missing/stale evidence have explicit regression checks.
Each engine has its own nine-feature Huber fit and contextual peer model.

Removed the full engine's Lite rating companion and its lifecycle. No additional
rating search runs. Existing played-move searches still serve accuracy and
classification; their timeout behavior is not changed. Rating-mode switches
reuse the same engine/cache results. A new cache fingerprint and model-version
tags reject prior rating observations. The UI warns that single-game estimates
can be wrong by hundreds of points. User explicitly authorized approximate
estimates at other search settings, with a mismatch note.

120training/50development games per engine, both colors kept together and
player-disjoint roles preserved. Moves-only MAE is263.017full/255.096Lite on
100held-out development sides each, versus302.460for the constant. The old
formula applied to these inputs scores254.485/240.062, respectively: no claimed
predictive improvement. Previously exposed development data, rating-pool transfer,
provisional status and single-game ability limitations remain explicit.

Acceptance: exact separate-process refits, both rating modes replayed through the
production scorer on340sides per engine,576production tests, source verification,
and real Chrome user-game checks for both engines. Lint has zero errors and two
existing warnings. This is provisional development-tested personal-app behavior,
not confirmation of a superior or generally accurate numerical rating method.

No store publication, remote upload, or unrelated research-queue resumption.
