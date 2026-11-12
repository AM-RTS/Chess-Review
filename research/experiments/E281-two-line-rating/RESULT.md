# E281 result and resume state

2026-11-12: registered implementation study; source and eligibility inspected.
No fitted candidate, rating-validity claim or production promotion yet.
Next: guarded pilot collection, measured bulk cost, then full collection and fit.

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
