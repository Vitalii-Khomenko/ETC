# Validation Notes

The current test suite is a regression suite for the live browser
implementation. It exercises the replacement engine with Node and verifies that
the generated mobile HTML stays self-contained.

Run validation with:

```bash
python tests/run_validation.py
```

Run the publishing privacy gate directly with:

```bash
python scripts/run_privacy_gate.py
```

## Current Regression Cases

| Case | Expected behavior |
| --- | --- |
| Replacement | Any tag with `id` or `txt` equal to `A`/`a` becomes the requested number in both attributes. |
| Range replacement | A start number such as `55667788` increments by the configured number step for every accepted tag. |
| First A default | Range mode starts from the first matching `A` unless the dbno start filter is explicitly enabled. |
| Number step | A step of `2` produces values such as `55667788`, `55667790`, and `55667792`. |
| Quantity limit | Range mode stops after the requested quantity. |
| Machine detection | `BUILDING` blocks are detected as machine groups and report their own matching `A`/`a` counts. |
| Machine ranges | Enabled machines use independent start numbers and number steps while preserving file order inside each machine. |
| Machine diagram | The diagram data groups shown equipment by machine and displays one-sided placeholder values such as `A / 3313616`. |
| Safety filter | Existing numeric IDs are not overwritten while `Only replace id/txt with A/a` is enabled and neither attribute is `A`/`a`. |
| Strict input parsing | Mixed numeric text such as `6abc` is rejected instead of being treated as `6`. |
| Replacement limit | Range mode refuses quantities above the mobile safety limit. |
| Output suffix safety | Download suffixes are limited to safe filename characters. |
| Export log | Export logs include the timestamp, source file, output file, replacement count, machine label, and old/new `id`/`txt` values. |
| Download retry safety | Browser download object URLs remain alive long enough for save dialog cancellation and retry. |
| Privacy gate | Publishing checks reject private ETC-derived paths, unsafe runtime APIs, unsafe DOM HTML APIs, weak CSP, and non-English project text. |
| Real template run | `templates/3-template-all-a.etc` is generated from `3.etc`, then processed through the JS engine and checked end-to-end. |
| Local machine sample | When local `5.etc` exists, validation checks that machine diagram grouping finds multiple machines and grouped placeholders. |
| Single-file build | `dist/ETC-Equipment-ID-Fixer.html` has inline CSS and JS and no external local references. |

## Important Limitation

These tests protect current replacement behavior. They are not a replacement
for manual review of real ETC exports before production use.
