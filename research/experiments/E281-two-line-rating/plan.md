# E281: reuse two-line review observations for ratings

2026-11-12. Explicitly requested production recalibration for full SF19 and Lite.
No unrelated research queue is resumed. Preserve the dirty shared implementation;
no checkout switching, reset, automatic integration or publication.

Use guarded D001/D002 admission and D002's existing player-disjoint roles.
Select 120 train and 50 development-validation games by ascending SHA256 of
`E281:` plus game ID, independently within each role. Use complete games and both
colors; no move/outcome/length-based selection. Do not open reserved test targets.
Validation is held out from fitting, but is previously exposed development data,
not fresh scientific confirmation. Target is recorded Lichess blitz rating;
transfer to Chess.com ratings and stable ability is unvalidated.

Collect through the production UCI parser, with full start-position history,
cold exact searches, Skill20, MultiPV2, Hash16/depth16 for full SF19 and
Hash32/20,000 nodes for Lite. Played moves outside the root winner receive the
same restricted search as reviews. Never call a separate rating engine.
Freeze exact source/build/configuration hashes and retain compressed observations.
Pilot two complete games before bulk; report measured cost. Maximum bulk budget
90 minutes per build; stop on missing/ambiguous evidence rather than impute scores.

Reuse nine existing ratingFeatures and fitHuber (lambda10, delta250), separately
per engine on training only. No model search. At least ten nonforced decisions
per side for a moves-only estimate. Compare validation MAE/RMSE/bias and rating
bands (<1200,1200–1799,1800+) against a training-median constant and the frozen
old Lite model applied to the new observations (explicit protocol-mismatch
comparator, not a validated baseline). Game-paired bootstrap seed281,2000 draws.
Promotion requires complete collection, finite estimates, MAE at least5% below
the constant, upper95% bootstrap difference below zero, and no populated band
with >=10 sides worse than the constant by >100 points. Context mode reuses the
maintained peer-quality fitter on the same training observations; report it as
relative game performance, not validation against the player's own rating.

One independent replay of fitting/metrics must match. Add protocol-tag/cache
tests and real-engine/browser checks, then production regression/source/lint.
Only adopt a build passing its gate. Never relabel old evidence as two-line.
