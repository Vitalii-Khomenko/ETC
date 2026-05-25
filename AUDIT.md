# ETC Equipment ID Fixer Audit

Audit date: 2026-05-25

## Executive Summary

ETC Equipment ID Fixer is a local-first browser utility for editing ETC/XML-like
files. The application reads a selected local file in the browser, detects
`ELECTRICALEQUIPMENT` tags, replaces safe `A`/`a` placeholders in `id` and
`txt`, groups measurement equipment by `BUILDING` machine blocks, and exports a
modified file plus a local export log.

Overall audit verdict: the project is suitable for local field use with the
current safety defaults. The main privacy and correctness controls are present:
files are processed locally, network connections are blocked by CSP, user-facing
text is rendered with safe DOM APIs, generated outputs are ignored by Git, and
the replacement engine has regression coverage for the current behavior.

No critical or high-severity issue was found in the audited codebase. Remaining
risks are mostly operational: real ETC files and screenshots can contain private
customer data, the self-contained distribution requires inline script/style CSP
allowances, and the parser is intentionally lightweight rather than a complete
XML parser.

## Audit Scope

Audited project areas:

- `index.html`
- `css/style.css`
- `js/utils.js`
- `js/etc-fixer.js`
- `js/main.js`
- `scripts/build_singlefile_dist.py`
- `scripts/create_template_from_3.py`
- `tests/run_validation.py`
- `README.md`
- `SECURITY.md`
- `VALIDATION.md`
- `AGENTS.md`
- `rules.txt`
- `.gitignore`
- `dist/ETC-Equipment-ID-Fixer.html`

Private local ETC samples were not copied into this audit. They are treated as
customer-derived data and should remain ignored.

## Architecture Review

The project is intentionally simple and local-first:

- The split app is maintained through `index.html`, `css/`, and `js/`.
- The mobile field build is generated into `dist/ETC-Equipment-ID-Fixer.html`.
- `js/etc-fixer.js` contains the parsing, grouping, replacement, and export log
  logic.
- `js/main.js` owns browser UI state, rendering, button handlers, previews, and
  downloads.
- `js/utils.js` owns file-size limits, supported extension checks, filename
  sanitization, file reading, downloads, and UI logging.
- Validation is run through `python tests/run_validation.py`, which exercises
  the JavaScript engine with Node and rebuilds the self-contained HTML file.

This structure is appropriate for the current no-backend requirement. The
separation between engine logic and browser orchestration is good enough for
testing and future maintenance.

## Data Flow Review

Primary data flow:

1. The user selects a local `.etc`, `.xml`, or `.txt` file.
2. The browser reads the file with `FileReader`.
3. The app scans opening `BUILDING` and `ELECTRICALEQUIPMENT` tags.
4. The UI shows machine summaries, machine ranges, a machine diagram, and a
   preview table.
5. Replacement changes are applied in memory.
6. The browser downloads the modified ETC file and a text export log.

No server-side processing exists. No code intentionally sends ETC content,
machine names, IDs, logs, or analytics over the network.

## Replacement Logic Review

Current expected behavior:

- Only opening `ELECTRICALEQUIPMENT` tags are edited.
- `id` and `txt` are both rewritten to the same generated number.
- Placeholder detection is case-insensitive and accepts `A` or `a`.
- A tag is accepted when either `id` or `txt` is a placeholder.
- Tags missing either `id` or `txt` are skipped.
- `Only replace id/txt with A/a` is enabled by default.
- `Only type = Messpunkt` is enabled by default.
- Machine range mode is enabled by default.
- Machine range mode groups equipment by the currently open `BUILDING` block.
- Each enabled machine range has its own start number and number step.
- Global range mode remains available when machine range mode is disabled.
- The dbno start filter is only applied when explicitly enabled.

The deterministic numbering model is sound: each accepted replacement advances
by the selected step in file order within the relevant range.

## Machine Grouping And Diagram Review

The machine scanner tracks the current open `BUILDING` stack and assigns each
`ELECTRICALEQUIPMENT` tag to the active machine. Equipment outside a `BUILDING`
is placed into an explicit `Unassigned` group.

The machine diagram is a useful safety view because it lets an operator inspect
which measurement IDs belong to which machine before replacement. It is also
implemented safely from an injection perspective: values are assigned through
`textContent`, not HTML injection.

Operational caution: the diagram can show private machine IDs, machine names,
`dbno` values, and equipment IDs. Screenshots of the diagram should be treated
like ETC-derived data.

## Security And Privacy Review

Positive findings:

- Local-first design: file content remains in the browser tab.
- No runtime third-party JavaScript.
- No telemetry, cookies, browser storage, WebSockets, or fetch calls were found.
- Split build CSP blocks network connections through `connect-src 'none'`.
- Single-file build still blocks network connections, object embedding, base
  URI changes, and form submission.
- DOM rendering uses `textContent` and `createElement`, not `innerHTML`.
- Download names are sanitized.
- Output suffix input is restricted to a safe character set.
- File selection is limited by extension and file size.
- Real `.etc` files, generated templates, generated outputs, and export logs are
  ignored by `.gitignore`.
- Project rules require privacy checks before every commit or push.

Remaining risks:

- The self-contained `dist` build requires inline script and style allowances.
  This is an accepted tradeoff for offline/mobile field use.
- Export logs contain source filenames, output filenames, machine labels, old
  values, and new values. They must remain local unless reviewed.
- Generated templates derived from real ETC files can still contain private
  project/customer data.
- Local sample files used for validation must remain ignored and must not be
  copied into public docs, issues, screenshots, or commits.

## Input Validation Review

Current validation controls are appropriate for field use:

- File size is capped at 20 MB.
- Supported extensions are limited to `.etc`, `.xml`, and `.txt`.
- Start numbers must contain digits only.
- Start number length is capped.
- Quantity must be a positive whole number.
- Batch quantity is capped.
- Number step must be a positive whole number and is capped.
- dbno filter input is strictly parsed when enabled.
- Unsafe output suffixes are rejected.
- Tags without both `id` and `txt` are skipped instead of being partially
  rewritten.

One intentional limitation: the parser expects the ETC export style used by the
target program, especially double-quoted attributes. It is not a complete XML
parser.

## Build And Distribution Review

The build script creates a self-contained mobile HTML file by inlining CSS and
JavaScript in a deterministic order:

1. `js/utils.js`
2. `js/etc-fixer.js`
3. `js/main.js`

The validation suite verifies that the final `dist/ETC-Equipment-ID-Fixer.html`
does not contain external script or stylesheet references. This is important for
mobile offline field use.

The build process is simple and auditable. The main maintenance requirement is
to keep the split version and the single-file build aligned by running
validation after functional changes.

## Test Coverage Review

The validation suite currently covers:

- single replacement mode,
- batch replacement mode,
- deterministic numbering,
- number step behavior,
- first matching placeholder behavior,
- optional dbno filtering,
- lowercase placeholder handling,
- one-sided `id` or `txt` placeholder handling,
- numeric IDs protected by the placeholder safety filter,
- strict dbno parsing,
- oversized quantity rejection,
- invalid number step rejection,
- missing `id`/`txt` skip behavior,
- output suffix safety,
- export log content and filename,
- machine detection,
- independent machine ranges,
- machine diagram grouping,
- oversized machine range rejection,
- local template processing when the local sample exists,
- local machine diagram validation when the local sample exists,
- single-file build generation.

This is a strong regression suite for the current logic. The main gap is the
absence of automated browser interaction tests for actual UI clicking,
scrolling, and mobile layout behavior.

## Findings

### No Critical Or High Findings

No critical or high-severity security or correctness issues were found in the
audited code.

### Medium: Inline CSP Requirement For Single-File Build

The self-contained distribution requires inline scripts and styles. The CSP
still blocks network connections and dangerous embedding behavior, but inline
allowances reduce the defense-in-depth value of CSP.

Status: accepted tradeoff for offline/mobile field use.

Recommended control: keep the split build available for hosted use with the
stricter CSP, and keep the single-file build local/offline.

### Medium: ETC-Derived Data Can Escape Through Human Workflow

The app itself is local-first, but generated logs, templates, screenshots, and
manual copies can still expose customer-derived data.

Status: mitigated by `.gitignore`, `SECURITY.md`, and publishing rules.

Recommended control: continue checking staged files before every commit and do
not attach real ETC data to public issues or pull requests.

### Low: Lightweight ETC/XML Parsing

The parser uses targeted regular expressions for known ETC export patterns. It
preserves formatting and avoids heavy dependencies, but it is not a general XML
parser.

Status: acceptable for the current input format.

Recommended control: add regression tests for any new ETC syntax observed in
the field before changing replacement behavior.

### Low: Browser UI Is Not Covered By Automated End-To-End Tests

Current tests validate the engine and build output, but not full browser UI
flows such as file selection, tab switching, rendering, and downloads.

Status: acceptable for now.

Recommended control: consider a small Playwright smoke test if UI complexity
continues to grow.

### Low: Local Sample Validation Is Environment-Dependent

Validation uses local ignored sample files when present and skips those checks
when they are absent.

Status: intentional privacy tradeoff.

Recommended control: keep synthetic public fixtures small and anonymous if a
CI-compatible sample becomes necessary.

## Recommendations

1. Keep the current safety defaults enabled: placeholder-only replacement,
   Messpunkt-only replacement, and machine range mode.
2. Continue running `python tests/run_validation.py` after every functional
   update.
3. Continue committing and pushing only after staged-file and ignored-file
   privacy checks.
4. Keep real `.etc` exports, generated templates, generated fixed files, export
   logs, and customer screenshots out of Git.
5. Add a browser UI smoke test if the tabbed workflow or mobile layout becomes
   more complex.
6. Add targeted regression tests for any newly observed ETC syntax before
   expanding parser behavior.
7. Keep `dist/ETC-Equipment-ID-Fixer.html` rebuilt and aligned with the split
   source files after every logic or UI change.

## Audit Conclusion

The application has a clear local-first privacy model, reasonable input
validation, deterministic replacement behavior, and useful regression coverage.
The current implementation is appropriate for its intended field workflow as
long as private ETC-derived artifacts remain local and the validation suite is
run before publishing changes.

## Remediation Closure

Closure date: 2026-05-25

Audit follow-up is closed with the controls below:

| Audit item | Closure |
| --- | --- |
| Inline CSP requirement for the single-file build | Accepted as an offline/mobile distribution tradeoff. The privacy gate now verifies that both builds keep `connect-src 'none'`, `object-src 'none'`, `base-uri 'none'`, and `form-action 'none'`. |
| ETC-derived data can escape through human workflow | Closed with `scripts/run_privacy_gate.py`, `.gitignore`, publishing rules, and validation integration. The gate rejects tracked or staged private ETC-derived paths and checks known local sample outputs remain ignored. |
| Lightweight ETC/XML parsing | Accepted as scoped behavior for the known ETC export style. Existing regression tests cover current parser assumptions; project rules require new tests before parser behavior expands. |
| Browser UI automated coverage gap | Partially closed with static security/UI-adjacent checks in the privacy gate and engine coverage for machine diagram data. Full browser automation remains optional if the UI grows further. |
| Local sample validation depends on ignored files | Accepted as a privacy tradeoff. Validation skips local sample checks when samples are absent, and the privacy gate verifies samples and generated outputs remain ignored when present. |

Current required closure command:

```bash
python tests/run_validation.py
```

This command runs the regression suite, rebuilds the single-file distribution,
and executes the publishing privacy gate.
