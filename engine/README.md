# Bundled Stockfish engines

All engine code and evaluation networks are bundled. Nothing executable is downloaded at runtime.

| Engine | Purpose | Official files | Release |
| --- | --- | --- | --- |
| Stockfish 19 | Default full engine | `stockfish-19-single.js` / `.wasm` | [19.0.0](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.0) |
| Stockfish 19 Lite | Smaller alternative | `stockfish-19-lite-single.js` / `.wasm` | [19.0.0](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.0) |

The files are byte-for-byte official release assets, with SHA-256 checksums and original
URLs recorded in [`checksums.json`](checksums.json). Run `npm run verify:engines` to verify them.
`.gitattributes` preserves the original loader bytes.

The single-threaded builds work without cross-origin isolation. The extension already
parallelizes positions across independent workers, so additional multithreaded variants
would duplicate engines and require a different deployment setup. If startup fails, analysis offers Retry.

Stockfish 19 Lite uses a smaller network than full Stockfish 19. Its review scoring
and rating models are documented in the [public method](../tools/calibration/PUBLIC_METHOD.md).
Saved Stockfish 18 preferences migrate to full Stockfish 19, invalidating incompatible
cached evaluations. Historical SF18 numerical models and evidence remain for reproducibility.

## Sources and licenses

Stockfish.js by Nathan Rugg (nmrugg), copyright 2026 Chess.com, LLC, under GPLv3:

- [19 source and build instructions](https://github.com/nmrugg/stockfish.js/tree/v19.0.0)
- [Upstream license](https://github.com/nmrugg/stockfish.js/blob/v19.0.0/Copying.txt); included as [`../LICENSE`](../LICENSE)
- [Stockfish contributors](https://github.com/official-stockfish/Stockfish)
- 19 lite network/code: [sscg13](https://github.com/sscg13/Stockfish/tree/sf19-1mb), `nn-61e7af4bb97d`

For AMO, include these exact release and source links in Notes for Reviewers; see
[`../RELEASE.md`](../RELEASE.md). No local engine compilation is needed.

Both engines use at least two review lines. Ratings reuse the existing root
evaluations before and after each move, with a separately fitted model per build.
No companion rating worker or independent rating pass runs. The full engine's
played-move searches for accuracy remain unchanged. Ratings are rough estimates;
the fitted profiles and development validation are documented in E281.
