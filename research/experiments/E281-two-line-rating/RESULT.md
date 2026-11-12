# E281: ratings reuse before/after two-line evaluations

2026-11-12: implemented locally for full SF19 and Lite. Both use separate refitted
models and their existing position evaluations. There is no independent rating
search or companion worker. Switching rating modes recalculates stored results
without resetting engines or reanalysing the game. Default/minimum lines remain2.
Accuracy and move classification calculations retain their existing searches.

| Moves-only development validation | Full SF19 | SF19 Lite |
| --- | ---: | ---: |
| Training games / player-sides |120 /240|120 /240|
| Held-out development games / player-sides |50 /100|50 /100|
| Mean absolute rating error |263.017|255.096|
| RMSE |331.429|322.619|
| Mean signed error |-2.506|-6.511|
| Training-median constant MAE |302.460|302.460|
| Old Lite formula on the same new inputs, MAE |254.485|240.062|
| Game-bootstrap95%MAE difference versus constant |[-77.307,-0.953]|[-85.686,-8.259]|

Both pass the prospectively fixed development gate against the constant. Neither
refit improves MAE over the old formula applied to the new observations on this
sample. This is an architectural/search-cost change with rough recalibration,
not a demonstrated predictive improvement. Low-rating subgroup errors exceed
400points. Previously exposed, player-disjoint development games do not provide
fresh scientific confirmation; Lichess blitz ratings do not establish Chess.com
ratings, stable ability, or an accurate performance rating for one game.

Production runtime replay matches refitting for340player-sides per engine in
BOTH modes. Real Chrome checks pass for both engines on the supplied game,
including25...Rg1+Brilliant and absence of companion workers.576production tests
pass. Source verification and extension lint pass with zero errors; the existing
Firefox service-worker and dynamic-innerHTML warnings remain. Firefox itself
was not retested. See P010 for implementation acceptance and limitations.

Full adjacent collection:170games,8898new searches,2988reused observations,
2394.258seconds. Lite:170games,136new searches,11752reused observations,
8.791seconds. Counts exclude the earlier failed/abandoned strict-evidence runs.
The existing full-depth played-move accuracy search can still time out on hard
positions; the user explicitly chose to leave that path unchanged.

## Recorded collection history and deviations

The obsolete strict collector and its partial-registration helper were removed
after the successful adjacent-position route replaced them. Their source remains
recoverable at commit19e9a256. The current collector, fitter, guarded registration,
Node bridge and verifier remain. Canonical inputs and negative evidence are retained;
temporary run directories and superseded scratch logs are removed, with an exact
file list in cleanup.json. No formatting/minification was used to hide code size.

Pilot: two complete Lite games,116 plies,191 searches,9.016seconds. The first
collector used object-indexed players instead of the dataset's array schema;
both initial build pilots failed without fitted outputs. Corrected before bulk.
The failed full pilot reached107 searches in67.277seconds before the schema
error. Eight-worker full collection is provisionally about20–30minutes;
Lite about3minutes.120training games allow short-game exclusion while retaining
the context fitter's100-game minimum. No validation scores inspected.
No isolated research checkout exists locally; the authorized implementation is
being developed in the existing dirty shared checkout without branch switching
or discarding changes. This deviates from the old isolated-checkout workflow.

Lite full collection completed170games/11752plies/19347searches in291.364seconds.
The initial derivative registration selected the flat `rating-evidence` format
for nested full-game observations; admission rejected it before fitting. Corrected
the metadata kind to `summary` without changing evidence bytes, and added explicit
normalized-history/recorded-rating checks before fitting. No guard was weakened.

Full-engine collection stopped after39complete games/4516searches/847.791seconds:
120second output-silence timeout. This coincided with concurrent regression work;
the machine has16GB RAM, and eight full engines plus the guard/test processes may
have caused memory pressure. This is a hypothesis, not an established cause.
Resume uses six workers and no concurrent full regression, with per-search failure
diagnostics. Same search/model settings and90minute total budget, including the
failed run. Partial outputs are admitted by hash before reuse, with identical
selection/configuration checks. The exact collected parser snapshot was recovered
and hash-verified; runtime changes since collection only removed rating-worker
lifecycle code, leaving numerical parsing/search behavior intact.

Six-worker resume also timed out, with39complete games retained and569additional
searches/465.440seconds. The diagnostic identifies a restricted played move at
index37/ply41, depth14/5.36million nodes/86.4seconds before the silence timeout.
This is a hard search, not evidence of random crashes or proof of memory pressure.
User approved adjacent-position rating evidence instead. Registered amendment
retains the original candidate/failures and splits. No further strict collection.

Adjacent Lite reuses11752roots and adds136searches in8.791seconds. Refitted
moves-only validation:100sides from50held-out development games,MAE255.096,
RMSE322.619,bias-6.511; training-median MAE302.460; paired95%MAE-difference
interval[-85.686,-8.259]. Old Lite formula applied to these new inputs scores
MAE240.062, so this is not a predictive improvement over that exploratory
comparator. Low-rating(<1200)MAE429.533 and high-rating(1800+)MAE377.571
show regression toward the middle. The fixed adoption gate against the constant
passes; no fresh confirmation or accurate-Chess.com claim.
Separate-process refit and production-rating replay agree for340sides in BOTH
modes. Real Chrome user-game review passes, retains25...Rg1+Brilliant, and
has no companion worker. Recorded-rating mode gives705.8/834.6; moves-only
gives1620.9/1718.6 for this out-of-pool Chess.com example. That discrepancy
is an explicit limitation, not evidence that the players have those strengths.
User authorized a clear rough/possibly-incorrect warning and continued estimates
at nondefault settings with a mismatch note. Full model/Chrome update pending.
