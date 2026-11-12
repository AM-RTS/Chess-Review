# Ratings overengineering incident and proposed decision log

Recorded: 2026-11-12

Status: Incident documented. The proposed decision-log approach is deferred; it has not been adopted or tested. This document is a lasting incident record, not the proposed temporary task log.

## Requested outcome and accepted limitations

The user wanted estimated ratings to reuse the existing two-line analysis for both full Stockfish 19 and Stockfish 19 Lite, avoiding a separate rating search. Two lines were already the default and minimum in the app. The user requested recalibration and testing, then explicitly accepted that ratings would be rough estimates that could be incorrect. They also selected before/after evaluations as the inputs.

Some calibration and functional verification were within scope. The accepted uncertainty should have constrained the effort; it did not justify pursuing stronger validation indefinitely.

SCA and Ponytail already required proportional investigation, the smallest maintainable solution, reassessment after failures, and avoiding persistence based on prior investment. The user did not omit the objective, scope, permission to simplify, or acceptance of limitations.

## What happened

- The work expanded into collection and fitting scripts, engine-specific models, validation records, compatibility checks, tests, and documentation.
- The user questioned the size of the change, citing a diff of +716 and -85 lines. That was their reported concern, not an independently established count of rating-only production code.
- The recorded development validation did not establish a predictive improvement: the new fitted models had higher mean absolute error than the old formula on the same new inputs. A functioning implementation and passing tests did not establish that the growing effort was worthwhile.
- Difficult engine searches produced further work on timeout recovery. After the user asked for the next meaningful step, the assistant chose that adjacent problem rather than first reassessing the value and scope of the overall ratings effort.
- The user reported that hours had been wasted and instructed the assistant to remove ratings. Estimated-rating UI, controls, and runtime calculations were subsequently removed and the Chrome unpacked copy was updated. Recorded player ratings, accuracy, move classifications, and engine analysis were retained. Historical research artifacts remained.
- In the subsequent discussion, the assistant repeatedly suggested safeguards the user had already supplied, including clearer completion criteria. The assistant later acknowledged that this misplaced responsibility: the user's explicit acceptance of potentially incorrect estimates had already settled the precision requirement.

This record does not claim an independently measured duration or a complete audit of every tool call.

## Failure analysis

The observable pattern was local justification without sufficient overall reassessment: each next script, check, or fix had a technical rationale, while the combined cost stopped being proportional to the requested rough feature.

The assistant treated unfinished work in its chosen method as a reason to continue. It should instead have asked whether that work was necessary for the user's accepted outcome, changed the approach when appropriate, and surfaced substantial expansion before incurring its cost.

This was an execution and judgment failure, not a missing user instruction. The assistant already had authority to abandon an unproductive method, choose a smaller valid solution, or explain a consequential trade-off. Persistence toward the objective did not require persistence with the method.

These are conclusions from the recorded behavior. They do not establish a precise internal cause for the model's decisions.

## Controls discussed

The discussion distinguished instruction-based guidance from external enforcement:

- SCA and Ponytail already instruct the model to exercise judgment. Their existence did not ensure compliance in this incident.
- The inspected Ponytail 5.3.3 Codex hook registration loaded instructions at session/subagent start and tracked mode changes on user prompts. It did not contain a periodic tool-call reassessment hook or task deadline.
- A small periodic reminder hook was discussed: initially, every 12 completed tool calls within a turn, resetting on a new user message. The interval was a starting suggestion, not a validated optimum.
- The user clarified that interruptions must not create blockers or stall useful work. The proposed hook therefore became advisory context after a tool result, without blocking tools, requiring approval, or forcing a visible progress message.
- No periodic hook was installed. The later decision-log proposal also remains unimplemented.

The configuration inspection found access controls and experimental budget features, but did not establish a stable built-in deadline or automatic semantic scope gate that would reliably prevent this incident. Access restrictions can limit damage; they do not by themselves judge whether work is worthwhile. These findings are version-specific and should be rechecked before any future configuration change.

## Proposed approach: a temporary running decision log

The user proposed modifying SCA to maintain a Markdown file such as `RAM.md` or `TASK.md` during substantive work. They clarified that it should be a running log, not merely a temporary summary document.

Its purpose would be to externalize progress, results, and consequential decisions so that the model repeatedly sees the user's objective and its own evidence together. It could also preserve continuity across context compaction. The filename, location, exact format, and activation threshold are not settled.

The proposed log would contain:

- The user's intended outcome, explicit scope, and accepted limitations.
- Observable completion criteria.
- The selected approach and its justification; meaningful alternatives only when relevant.
- Brief entries recording significant attempts, results, failures, and uncertainties.
- Reassessment of whether remaining work is necessary, whether another approach is better, whether the effort is worthwhile, and what the simplest sufficient solution is.
- A concrete decision to continue, simplify, finish, or raise a consequential trade-off, followed by the next meaningful action.

Entries should preserve the sequence of consequential decisions rather than continually replacing the history. They should be concise outcomes and justifications, not a transcript of internal reasoning or a command-by-command diary.

Suggested update points were changes in evidence or direction, approach failures, and emerging scope expansion. Updating after every command, inventing alternatives for routine choices, or creating a log for trivial tasks would add unnecessary work. These are suggestions, not adopted rules.

An illustrative entry for this incident:

> Accepted limitation: ratings may be incorrect; no separate rating search is wanted. Proposed next step: further extensive calibration experiments. Are those experiments necessary to meet the accepted outcome? If not, skip them, verify the existing evaluations produce usable estimates, and disclose the uncertainty. If a specific experiment is necessary, state what decision it will change and keep it bounded.

This illustration does not mean that all requested recalibration should have been skipped. It shows the distinction between necessary implementation evidence and additional work beyond the accepted outcome.

## Lifecycle and boundaries to resolve later

- The user proposed clearing the temporary log after the task completes. Deleting a task-owned log was discussed as an alternative; the exact cleanup behavior is undecided.
- Concurrent chats or agents must not overwrite one another's logs. Separate task-owned files were suggested; no naming system was chosen.
- Never overwrite or delete a pre-existing user file simply because it is named `RAM.md` or `TASK.md`.
- Put lasting findings in existing project documentation when needed before clearing temporary material. Do not create documentation merely to narrate routine work.
- Do not record secrets or unnecessarily copy sensitive task inputs into the log.
- This incident document should remain; it is not subject to the proposed temporary-log cleanup.

## Would it have prevented the incident?

Possibly, but that is unproven. A progress log alone could have documented the same waste without changing the decisions. The model could fill it out mechanically or rationalize continued work.

The promising element is the explicit comparison between new work and the user's accepted completion criteria before consequential expansion. That could have made the contradiction between rough estimates and prolonged validation visible earlier. It is an instruction-based aid, not an enforcement mechanism or a guarantee of good judgment.

## Current decision

The user will consider the approach later. The only authorized action at this point is to document the incident and discussion. Do not treat this document as authorization to modify SCA, Ponytail, hooks, or the project's workflow.
