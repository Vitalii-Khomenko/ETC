# Technical Notes

This document describes the current ETC Equipment ID Fixer behavior and the
technical rules behind the UI, replacement engine, export flow, and validation
suite.

## Runtime Model

The app is a local browser tool. There is no backend, no upload endpoint, and
no runtime network access. A user selects a local `.etc`, `.xml`, or `.txt`
file, the browser reads it into memory, replacement plans are calculated in the
same tab, and the browser exports a new file plus a text export log.

Two builds are maintained:

- `index.html` with external files in `css/` and `js/` for development.
- `dist/ETC-Equipment-ID-Fixer.html` as a self-contained field build.

The self-contained file is rebuilt by `python tests/run_validation.py` through
`scripts/build_singlefile_dist.py`.

## Source Responsibilities

- `js/etc-fixer.js` owns parsing, grouping, validation, replacement plans, file
  rewriting, title formatting, and export log generation.
- `js/main.js` owns browser state, rendering, preview/apply/download actions,
  layout mode switching, diagram disclosure state, and UI event handlers.
- `js/utils.js` owns supported file checks, file-size limits, filename
  sanitization, browser file reading, download object URLs, and log rendering.
- `css/style.css` owns the phone/laptop layouts, machine range editor, diagram,
  status colors, and responsive controls.
- `tests/run_validation.py` is the project regression suite. It runs Node-based
  engine checks, static UI checks, local real-file checks when private samples
  are present, the single-file build, and the privacy gate.

## ETC Parsing

The parser is intentionally targeted to the ETC export format used by the field
program. It scans opening tags and double-quoted attributes rather than acting
as a complete XML parser.

Current grouping rules:

- Each open `BUILDING` block is treated as a machine.
- Each open `CIRCUIT` block inside a machine is treated as a section.
- Equipment outside a `BUILDING` is assigned to an explicit unassigned group.
- Equipment inside a machine but outside a `CIRCUIT` is assigned to a fallback
  section.
- File order is preserved for numbering inside every accepted range.

The code edits only opening `ELECTRICALEQUIPMENT` tags. Formatting outside the
changed `id` and `txt` attributes is preserved.

## Replacement Acceptance

By default, a tag is accepted only when:

- the tag is an opening `ELECTRICALEQUIPMENT` tag,
- both `id` and `txt` attributes exist,
- `id` or `txt` is `A` or `a`,
- `Only replace id/txt with A/a` is enabled,
- `Only type = Messpunkt` is enabled and the tag has `type="Messpunkt"`.

The placeholder check is case-insensitive and one-sided:

- `id="A" txt="A"` is accepted.
- `id="a" txt="a"` is accepted.
- `id="A" txt="3313616"` is accepted.
- `id="3313616" txt="a"` is accepted.

When a tag is accepted, both `id` and `txt` are rewritten to the generated
number. Existing numeric IDs are protected while the placeholder safety option
is enabled.

## Numbering Rules

Numbering is deterministic:

- Start with the entered section group start number.
- Use the entered section group step, defaulting to `1`.
- Increment once per accepted replacement in file order.
- Fixed `Count` values consume that many accepted tags in the section.
- A blank final `Count` consumes all remaining accepted tags in that section.

Global replacement controls are kept hidden in the operator UI. The supported
operator workflow is machine/section range mode.

## Replacement Editor

The `2. Replacement` section is the working range editor. It intentionally shows
only items that can be changed with the current replacement filters:

- only machines with at least one replacement match,
- only sections with at least one replacement match.

This means toggling `Only type = Messpunkt` can change the replacement editor,
because it changes which tags are eligible for replacement.

Each matching section shows:

- `Groups`, the number of numbering subgroups for that section,
- `Count`, the number of accepted tags consumed by that group,
- `Start`, the first generated number for that group,
- `Step`, the increment for that group,
- a preview range for the generated numbers.

The group count is read before the section editor is redrawn, so entering a
new group count such as `2` creates the additional group row instead of
resetting back to `1`.

Match counts are highlighted only when the count is greater than zero. A
`0 match` value remains normal text.

## Review Diagram

The `3. Review` `Machine Diagram` tab is an overview, not the replacement
range editor. It always shows the full equipment type list, regardless of the
`Only type = Messpunkt` replacement filter. This keeps the machine and section
overview stable while the operator changes replacement filters.

The diagram still respects `Only replace id/txt with A/a` for candidate
highlighting, because that option changes whether existing numeric IDs should
be considered replaceable.

Diagram behavior:

- Machines and sections are grouped by `BUILDING` and `CIRCUIT`.
- Equipment chips show `dbno` and the current `id`/`txt` display value.
- Placeholder chips are highlighted.
- Candidate chips get an additional candidate marker.
- Values changed by the last `Replace` action are highlighted green.
- Machines or sections with matches, or just-replaced values, open by default.
- Inactive machine and section lists collapse by default.
- Manual expand/collapse state is preserved while the diagram rerenders.

The section body uses flex layout for chips. CSS includes a `[hidden]` override
so collapsed section lists actually hide their equipment flow.

## Title Formatting

Machine and section labels use `id`, `txt`, and `dbno`, but duplicate or nearly
duplicate `id`/`txt` values are shown once.

Examples:

- `RLO Anlage`, `RLO Anlage`, `dbno 27` becomes `RLO Anlage | dbno 27`.
- `RLo Schaltschrank`, `RLow Schaltschrank`, `dbno 43` becomes
  `RLo Schaltschrank | dbno 43`.

The duplicate check normalizes case and punctuation and treats one-character
differences in longer names as duplicate title parts.

## Layout Modes

The top `Phone` / `Laptop` switch changes presentation only. It does not write
browser storage and does not affect replacement logic.

- `Phone` keeps the narrow single-column mobile workflow.
- `Laptop` keeps the same vertical workflow but widens the workspace to fit a
  desktop browser window.

## Preview, Replace, And Download

`Preview` builds a replacement plan without modifying the loaded content.
`Replace` applies the same planning rules, rewrites content in memory, refreshes
the preview, and updates the Review diagram.

`Download + Log` creates direct links for both outputs:

- the fixed ETC file, using the original name plus `_fixed`,
- the export log, using the exported file name plus `_export-log.txt`.

The app clicks the links for convenience, but also leaves them visible. If the
browser save dialog is canceled or blocked, the user can press the links again
or press `Download + Log` again to create fresh object URLs.

Each export log records:

- export timestamp,
- source file name,
- output file name,
- replacement settings,
- replacement count,
- machine label,
- section label,
- range label,
- warnings,
- old and new `id`/`txt` values for each replacement.

## Security And Privacy Controls

The app is local-first, but ETC-derived files and logs can still contain
customer data. The repository therefore keeps real ETC files, generated
templates, fixed outputs, generated test outputs, and export logs ignored.

Runtime hardening:

- no `fetch`,
- no `XMLHttpRequest`,
- no `WebSocket`,
- no browser storage APIs,
- no cookies,
- no unsafe HTML injection APIs,
- network connections blocked by CSP,
- file extension and file size checks before reading,
- strict numeric parsing for number fields,
- capped replacement quantities,
- sanitized download filenames.

Publishing hardening:

- `python scripts/run_privacy_gate.py` rejects tracked or staged private paths,
  unignored known local samples, non-English tracked project text, unsafe
  runtime APIs, unsafe DOM APIs, weak CSP, and non-self-contained distribution
  output.
- `python tests/run_validation.py` runs the privacy gate after the regression
  suite and build.

## Validation Coverage

The regression suite covers:

- lowercase and one-sided placeholder detection,
- protected existing numeric IDs,
- deterministic numbering and number steps,
- dbno filter behavior in legacy batch mode,
- machine and section grouping,
- split section numbering groups,
- group count persistence,
- replacement editor filtering by matched machines and sections,
- Review diagram full type-list behavior,
- collapsible diagram disclosure,
- positive-only match count highlighting,
- green replaced-value highlighting,
- duplicate title suppression,
- export log content,
- download retry links,
- privacy and static security gates,
- single-file build self-containment.

The suite uses local ignored samples (`3.etc` and `5.etc`) when present. Those
checks are skipped when the samples are absent so private ETC exports do not
need to be committed.

## Current Operational Expectations

- Operators should use `Preview` before `Replace`.
- Operators should review the stable full `Machine Diagram` before exporting.
- Operators should fill every enabled section group start number before
  applying changes.
- Real ETC exports, generated templates, fixed files, export logs, and
  screenshots should stay local unless reviewed and anonymized.
- Project changes should be validated with `python tests/run_validation.py`
  before publishing.
