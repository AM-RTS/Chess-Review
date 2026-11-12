# Chess Review research

Improve how Chess Review measures move quality, game accuracy and rating
performance, and how it explains moves. Success means useful, independently
assessed improvements over our own frozen baseline. Matching Chess.com or
Lichess scores is not an objective or an acceptance criterion.

This is a maintained research workspace, separate from the active methodology
in [`tools/calibration/`](../tools/calibration/README.md), the runtime in `lib/`
and `analysis.js`, and the bundled model in `data/calibration.json`. Research
results do not become extension behavior automatically.

Current routing is in [INDEX.md](INDEX.md). Numerical research is paused;
[E280's registered timing run](experiments/E280-timestamped-progress-pilot/RESULT.md)
remains deferred. [P009](promotions/P009-brilliant-evidence-coherence.md) records
the separately authorized annotation-evidence implementation. The historical
numerical decisions remain in [NUMERICAL-REVIEW.md](NUMERICAL-REVIEW.md).
No replacement accuracy or rating model is confirmed.

2026-11-12 exception: the user explicitly requested
[E281](experiments/E281-two-line-rating/plan.md), reusing two-line review results
for separate SF19/Lite rating models. This does not resume unrelated numerical
studies or authorize confirmation claims from reused development games.

## Start here

1. Read [INDEX.md](INDEX.md) for current state, prior findings and the next task.
2. Follow [DATA_POLICY.md](DATA_POLICY.md) and run the data eligibility preflight
   before starting/resuming a goal or using any games or derived data.
3. Read [BASELINE.md](BASELINE.md) when comparing with the extension.
4. Read [PROTOCOL.md](PROTOCOL.md) before designing or assessing an experiment.
5. Open only the relevant experiment, dataset or finding after that.

| Location | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Scoped instructions for efficient, resumable research. |
| [concepts/](concepts/README.md) | Frozen catalog review plus approved scheduling and build-first policies; canonical evidence stays in experiment trackers. |
| [INDEX.md](INDEX.md) | Compact experiment register, decisions and backlog. |
| [BASELINE.md](BASELINE.md) | Pinned starting implementation and known evidence limits. |
| [PROTOCOL.md](PROTOCOL.md) | Measurement, validation and promotion requirements. |
| [DATA_POLICY.md](DATA_POLICY.md) | Mandatory public-data eligibility, verifiable lineage and run checks. |
| [MEASUREMENT.md](MEASUREMENT.md) | Output definitions, development gates and research sources. |
| [experiments/](experiments/README.md) | One folder per experiment: plan, code, retained evidence and result. |
| [datasets/](datasets/README.md) | Dataset provenance, split ownership and reuse records. |
| [findings/](findings/README.md) | Durable positive, negative and inconclusive conclusions. |
| [promotions/](promotions/README.md) | Implementation decisions and exact adoption scope. |
| [templates/](templates/experiment.md) | Experiment, finding and promotion record templates. |
| `runs/` | Ignored bulk downloads, engine caches and intermediate outputs. |

Retain small, sufficient evidence in Git. For large evidence, retain a manifest
with hashes, acquisition/rebuild instructions and an accessible immutable
location; a local ignored path alone does not make a result reproducible.
Research is available in the Git repository. The current packaging allowlist
excludes `research/` from extension ZIPs and release source snapshots; those
snapshots retain the active calibration instead.

## Workflow commands

- `npm run research:status` reports the latest completed coach study, checking
  tracker counts and occurrence IDs against the original list. Add `-- --json`
  for machine-readable metadata. It does not read games or evaluate a candidate.
- `npm run research:coach-tests -- E065` runs focused development tests; supply
  multiple experiment IDs when dependent studies are affected. Run the dataset
  eligibility preflight required by the study first; guarded tests still enforce
  their own access policy. Temporary contributor IDs such as `FRIEND-01` are
  supported too, and their tests participate in the later full coach suite.
- `npm run research:coach-tests` runs every available coach study's test files
  from E020 onward. This is the final cumulative coach regression, not a
  replacement for numerical research tests in `npm run test:research`.
- `npm run research:build-status` reports provisional code coverage separately
  from accepted mechanics and detects changed/missing build dependencies.
- `npm run research:backlog` groups remaining claims in approved queue order,
  distinguishing provisional implementations from code still to build. Both
  commands accept `-- --json` and load metadata/source bytes only, not games.

The user approved [implementation first, combined validation later](concepts/BUILD-FIRST.md)
on 2026-10-09. Generate remaining research code in larger compatible batches,
using focused positive/negative checks, affected dependencies and cheap pilots.
Code-ready batches are provisional; their full regression, exhaustive semantic
cross-checks and exact reproductions move to the later combined source freeze.
Reuse unchanged hash-bound observations while checking integration behavior.
Preserve original plans and record dated amendments for unfinished studies;
already-running frozen reproductions retain their fixed inputs and outputs.
Accepted evidence and tracker counts remain separate from build coverage.
Reuse the existing development and clean verification
checkouts under the safeguards in [AGENTS.md](AGENTS.md); do not accumulate new
branches or working clones. Source verification excludes local `research/runs/`
outputs and copies, checks maintained research/evidence, and rejects tracking
generated run files. Extension linting follows the packaging allowlist and
validates all shipped JSON directly; historical research archives and negative
fixtures stay outside that extension-specific check.
Reachable-history checks reject those generated paths.

## Evidence and open work

The latest accepted coach lineage ends at [E082](experiments/E082-rook-ending-facts/RESULT.md).
Use its [cumulative tracker](experiments/E082-rook-ending-facts/evidence/concept-status.md)
and `npm run research:status` for current accepted mechanics; provisional build
coverage is separate. [E270](experiments/E270-combined-validation/RESULT.md) retains
the combined regression and the ongoing independent semantic audit. Real-game
precision, broad strategic meanings and teaching usefulness remain open.

[Promotion decisions](promotions/README.md) record what is implemented in the
extension, including usable provisional observations. Implementation availability
does not advance research acceptance. The numerical calibration baseline is
[B000](BASELINE.md); production correctness fixes have their own promotion records.

[Findings](INDEX.md) retain the negative and inconclusive numerical outcomes,
consumed confirmation panels and pending blinded human reviews. Preserve those
records before proposing fresh experiments. The [maintenance review](../docs/RESEARCH-MAINTENANCE.md)
explains which apparent duplicates are required evidence and which decisions
remain open. Do not refresh frozen hashes or delete failed runs during cleanup.
