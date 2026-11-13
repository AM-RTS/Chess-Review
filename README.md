# ♟ Chess Review

Free, open-source game review for your online chess games, powered by Stockfish NNUE running
locally in your browser. One click turns any **Chess.com** or **Lichess** game into a full
review — accuracy scores, move-by-move classifications, an evaluation graph. No account, no server, no manual PGN copying.

The automatic review layout gives the board the largest area beside one compact
sidebar. **Game Review** groups commentary, accuracy, moves, navigation, Engine,
and the expandable evaluation graph. **Insights** contains Concepts and learning.
The charcoal surfaces, green board default, striped move list, and clear navigation
follow the saved Chess.com review reference. Saved board and background choices
remain available. Narrow windows stack the sidebar below the board; **Reorganize**
still supports custom panel arrangements.

Board motion follows the saved reference: 180ms ease-in-out slides at the default
speed, captured-piece fades, simultaneous king/rook castling, and Great/Brilliant feedback badges
that show a white glyph over the dimmed piece, then settle into their own square’s
corner as the colored circular badge appears, over a matching category-colored
square flash. Other categories keep static badges. The solid evaluation bar uses flat white/charcoal colors and a
one-second ease-in fill transition, following board orientation. Single-step review and variation navigation
share the same animation path. Drag releases avoid replaying the slide; reduced
motion and the existing animation toggle remain supported.

**Analysis** in the review header or **Open analysis board** in the extension popup
opens an independent starting board. Play either side, undo/redo or branch from an
earlier move, and see live Stockfish evaluation, candidate lines, and category badges.
Use **Load position or game** for FEN/PGN input, **Reset board** for a fresh board,
and **Copy FEN / Copy PGN** to export. Reload restores that tab's explored line and
selected move. Live feedback can change while Stockfish searches; this mode does
not generate game accuracy or save experiments to the library.

Analysis and panel lines default to two, with two as the minimum configurable
value. Both engines use two analysis lines by default.

Great candidates automatically receive a separate two-line verification when a
best, high-quality move may be the only good option, including defensive resources
without a preceding opponent error. Another move that retains a clear advantage
(the existing clear-advantage setting, default +2 pawns) or also forces mate rules
out Great, even when the best move scores higher. Routine equal-material exchanges that preserve
the evaluation, straightforward material grabs, and immediate mate finishes retain
their ordinary grade. Exchange balance includes the whole capture/recapture sequence.
Brilliant independently recognizes sound voluntary piece sacrifices with near-best
evaluation; other winning alternatives do not disqualify them. In addition to the
expected-score quality threshold, the existing Excellent centipawn tolerance prevents
throwing away material in an already winning position from receiving Brilliant.
Both Great and Brilliant reject clearly losing results, using the existing clear-
advantage threshold (2 pawns by default) from the mover's perspective. A result
at or below -2 pawns does not qualify; a minor disadvantage can still qualify
when the other conditions hold. A losing forced-mate score never qualifies.
Both are available in reviews and live analysis. Brilliant
retains priority; Great verification never replaces accuracy evidence.


Moves with only one legal reply use the supplied Forced arrow badge on the board,
while remaining included under Best in the breakdown.

**Learn with Chess Review** opens from the button beneath Concepts. By default, the review panels morph into one learning workspace while
the board and top bar stay in place. **Settings → Visual → Learning experience**
offers **Morph in place**, **Morph in place 2**, **Morph in place 3**, **Studio Morph**, **Minimal morph**, **Board morph**, and
the original **Separate page** layout. Each morph has its own design and timing. The transition
also runs when returning to review and respects reduced-motion preferences.
**Morph in place 2** glides the intact board into a centered study layout and keeps
Settings available alongside learning, with reserved space on desktop windows.
**Morph in place 3** keeps the review board size and familiar piece handling while
the surrounding panels transition into learning.
The learning workspace includes 23 concept lessons with 47
exercises, 25,000 offline puzzles, 1/5/10-minute challenges, and 12 opening courses
with 24 annotated lines. Lessons use move, square-selection and position-reading
exercises. Opening practice supports both colors and automatic opponent replies.
Progress and bookmarks stay in your browser, and **Back to review** restores your
game position and orientation. The [learning objective and progress tracker](docs/LEARN_WITH_CHESS_REVIEW.md)
preserves the full development brief for work on another computer; [content sources](data/learning/SOURCES.md)
record licensing and validation scope.

The right-hand Settings panel includes an optional **Concepts** tab after Visual
and Engine. A separate **Concepts** panel to the right of Accuracy and Engine
uses those same findings,
ordered by likely relevance and phrased from your playing side. It follows the
selected move, includes every match, and separates insights with space. Its top
sits below the coach commentary, with its own scrolling area. Expand
an insight's evidence to inspect the original explanation and exact scope.
Accuracy and the existing move commentary retain their scoring and behavior.

The Settings Concepts panel remains the raw inspection and game-debug view.
Check **Enable concept analysis** to list supported findings for the
selected move, with exact verified scopes and game-wide debug metrics. It defaults
off and stops its worker immediately when disabled. Findings use completed E080
research's bounded mechanics; broader strategic benefits and coaching usefulness
remain unproven. Existing scores and coach comments are unchanged.

**Source:** https://github.com/T-Julsgaard/Chess-Review

**Chrome webshop**: https://chromewebstore.google.com/detail/chess-review/pdbffcjdmcadihmnmenkadndbdbigfam

**Firefox Add-ons**: https://addons.mozilla.org/en-US/firefox/addon/chess-review/

## Watch the introduction

Click the image below to watch the introduction video.

[![Watch the 69-second Chess Review introduction](marketing/video/media/chess-review-thumbnail.png)](https://t-julsgaard.github.io/Chess-Review/marketing/video/media/chess-review-intro.mp4)

## Features

- **One-click review** of any Chess.com or Lichess game — or paste a game URL / raw PGN.
- **Accuracy estimates** for both players, calculated from local Stockfish analysis using the extension's scoring rules. Scores can differ from other review tools.
- **Move classifications** from Brilliant to Blunder, with an evaluation graph and best-move arrows.
- **Opening detection** from an offline book, named even for PGNs without headers.
- **Rated alternatives** while reviewing a game, using the same classification rules
  as the played moves. Exploring does not change the original game or its accuracy.
- **Stockfish 19 is the default full engine**, with **Stockfish 19 Lite** available as a smaller alternative. Both run locally.
- **Recoverable analysis errors** with a Retry button; unfinished reviews are not
  saved as completed games.
- **Analysis runs on your machine** — game lookup requests go directly to the chess platforms; no developer backend or analytics.

## Usage

1. Open a finished game on **Chess.com** or **Lichess**.
2. Click the extension icon → **Analyze this game**, or press `Ctrl+Shift+Y`.
3. Stockfish reviews the game in an analysis tab.

You can also paste a game URL or PGN into the popup. If your username cannot be
detected, enter it once; it is remembered locally. Chess Review is intended for
review after play.

Settings let you choose an engine, board, pieces, sounds, coach and
category-badge appearance. Badge numbers describe move categories; they are
separate from position evaluation and game accuracy.

Estimated performance ratings have been removed. Recorded player ratings from game headers remain visible.

If a difficult played-move search exceeds the silence limit, review can continue
using its last valid completed-depth score. A visible time-limited analysis note
warns that accuracy and badges may change with deeper analysis. Missing valid
evidence or an unresponsive engine still produces an error.
## Scoring and reproducibility

Chess Review is open source and uses local Stockfish analysis with documented
scoring models. The repository includes the fitting tools, public-data evidence
and reference results needed to inspect and reproduce the bundled numerical
models.

With Node.js 24 or later, reproduce the historical calibration and reference scores
offline:

```sh
node tools/calibration/reproduce-public.mjs
```

This check replays the included evidence without rerunning engine searches. The
[methodology](tools/calibration/PUBLIC_METHOD.md) documents the inputs,
calculations and limitations. Historical rating experiments remain archived; the app no longer estimates ratings.

The full Git repository also retains the historical two-line rating observations,
fitting protocol and validation in
[E281](research/experiments/E281-two-line-rating/plan.md). Replay each engine's
refit with `node research/experiments/E281-two-line-rating/code/verify.mjs sf19 adjacent`
or `sf19lite adjacent`; these commands use the guarded public-data loader and run no engine searches.

Move categories follow documented classification rules. See the
[special annotations guide](tools/calibration/BRILLIANT_MOVES.md) for their
definitions and sources, and the [repository guide](docs/REPOSITORY.md) for the
supporting files.

## Research and future methods

The separate [research workspace](research/README.md) investigates improvements
to accuracy and move categories against our own documented
baseline. It records reproducible experiments, successful and unsuccessful
findings, evidence limits and implementation decisions. Research candidates
become part of the extension only through a documented promotion. See the
[research index](research/INDEX.md) for current state and next questions.

## Install

Install from the Chrome Web Store or Firefox Add-ons using the links above.
For a local Chrome installation:

1. Download or clone this repository.
2. Open `chrome://extensions` and enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the project folder.


## Privacy

Games are fetched from Chess.com's and Lichess's public APIs and analyzed locally
with bundled WebAssembly builds of Stockfish. Lookup requests include public player
usernames or game IDs. No games or analysis are sent to the developer or analytics services.
Firefox discloses the browsing activity and website content used for these requests.
Sharing a game copies an encoded, unencrypted PGN/metadata link to your clipboard;
anyone you send it to can read that information. See [PRIVACY.md](PRIVACY.md).

## Maintained-source checks

The Maintained source workflow runs `npm run verify:source` and `npm run verify:history`
before the test suites. The history check inspects reachable commits and historical text
blobs in batches targeting 16 MiB, so growing research history does not overflow one
combined subprocess output buffer. All existing content and path checks remain active.

The complete research suite runs in a separate Windows CI job with the original
Python runtime bound by the E211 saved observations. Setup verifies the pinned
archive, retained executable hash, and full build version; existing research
evidence and checks remain unchanged. See [runtime setup](tools/research-python/README.md).

## Release packages

Run `npm ci`, `npm test`, `npm run verify:engines`, and `npm run build`.
The build creates separate Chrome and Firefox ZIPs under `web-ext-artifacts/`,
with browser-specific manifests and no development dependencies or tests. Each build
has its own release directory, source snapshot, and SHA-256 package checksums.
See [RELEASE.md](RELEASE.md) for store reviewer notes and validation commands.

## License & attributions

Chess Review's own code is licensed under the **GNU General Public License v3.0** (see
[`LICENSE`](LICENSE)), matching the bundled Stockfish engine. Bundled third-party assets (engine,
pieces, sounds, opening book, libraries) keep their own licenses — see
[`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
Some asset redistribution rights remain unresolved as documented in the attributions;
the project's GPL license does not grant rights to those assets.
Corresponding source for the GPL/AGPL components is available
from the upstream projects listed there.

> **Disclaimer:** Chess Review is an independent, unofficial tool. It is **not affiliated with,
> endorsed by, or sponsored by Chess.com or Lichess**. Those names are used only to describe the
> sites it reads games from (nominative reference); all trademarks belong to their respective owners.
