# ETC Equipment ID Fixer

Mobile-friendly HTML/JavaScript utility for `.etc` files. It updates `id` and
`txt` in opening `ELECTRICALEQUIPMENT` tags.

Main replacement example:

```xml
<ELECTRICALEQUIPMENT dbno="6" id="A" txt="A" type="Messpunkt" ...>
```

after replacement:

```xml
<ELECTRICALEQUIPMENT dbno="6" id="55667788" txt="55667788" type="Messpunkt" ...>
```

The placeholder check is case-insensitive and needs only one matching
attribute. These are all replacement candidates:

```xml
<ELECTRICALEQUIPMENT id="A" txt="A" ...>
<ELECTRICALEQUIPMENT id="a" txt="a" ...>
<ELECTRICALEQUIPMENT id="A" txt="3313616" ...>
<ELECTRICALEQUIPMENT id="3313616" txt="a" ...>
```

When a tag is accepted, both `id` and `txt` are rewritten to the new number.

Numbering example:

| Start number | Quantity | Number step | Result |
| --- | --- | --- | --- |
| `55667788` | detected `A` count | `1` | The first matching `A` becomes `55667788`, the next matching `A` becomes `55667789`, and numbering continues until the quantity is reached. |
| `55667788` | `3` | `2` | Generated values are `55667788`, `55667790`, and `55667792`. |

Machine range mode is enabled by default. The app reads each `BUILDING` tag as
a machine group and assigns matching `ELECTRICALEQUIPMENT` tags to the currently
open machine. Each machine row shows its detected `A`/`a` count and has its own
start number and number step.

Machine example:

```xml
<BUILDING dbno="1" id="MA25000944" txt="BHKW">
  <DISTRIBUTIONCABINET dbno="1" id="MA25000944" txt="BHKW">
    <ELECTRICALEQUIPMENT dbno="6" id="A" txt="A" type="Messpunkt" ...>
  </DISTRIBUTIONCABINET>
</BUILDING>
```

With machine ranges enabled, that equipment is numbered by the range assigned
to machine `MA25000944`.

The `Machine Diagram` tab shows the same grouping visually. Each machine is a
compact block, and each shown equipment item is a chip with its `dbno` and
`id`/`txt` value. `A`/`a` placeholders are highlighted so the operator can see
which measurements belong to which machine before replacement.

## Files

- `index.html` - split version with external `css/` and `js/`.
- `dist/ETC-Equipment-ID-Fixer.html` - single-file mobile build.
- `js/etc-fixer.js` - search and replacement engine.
- `scripts/run_privacy_gate.py` - publish-time privacy and static security gate.
- `tests/run_validation.py` - regression validation for logic and build output.

## Workflow

1. Open `dist/ETC-Equipment-ID-Fixer.html` in a browser.
2. Select the `.etc` file.
3. The app counts `ELECTRICALEQUIPMENT` tags, `Messpunkt` tags, and `A`/`a`
   placeholders, then groups matching placeholders by `BUILDING` machine.
4. Enter the global start number and number step, then press
   `Fill From Start Number` to fill machine rows automatically.
5. Adjust any machine row that needs its own start number or step.
6. Disable `Use machine ranges` only when one global range should be used for
   the whole file.
7. Enable `Use dbno start filter` only when the global run should start at a
   specific `dbno` or later.
8. Open `Machine Diagram` to review machine-to-equipment grouping in a compact
   visual layout.
9. Press `Preview`, then `Replace`.
10. Download the new `.etc` file and export log. The ETC output name is the
   original file name plus the configured suffix, for example `3_fixed.etc`.
   The log uses the exported file name plus `_export-log.txt`, for example
   `3_fixed_export-log.txt`.
   If a browser save dialog is canceled, press `Download + Log` again; the
   current export stays in memory and the app creates fresh download links.

Each export log records the export timestamp, source file name, output file
name, replacement settings, replacement count, machine label, warnings, and a
row-by-row list of old `id`/`txt` values and new `id`/`txt` values.

By default, `Only replace id/txt with A/a` is enabled: a tag is changed only when
`id` or `txt` is `A`/`a`. Disable it only when you intentionally want to
overwrite existing numeric IDs. `Only type = Messpunkt` is also enabled by
default for safer measurement-point updates.

## Validation

```bash
python tests/run_validation.py
```

The validation suite also runs `scripts/run_privacy_gate.py`. The privacy gate
checks that private ETC-derived files are not tracked or staged, local sample
outputs remain ignored, project text stays English-only, runtime sources do not
use network/storage APIs, unsafe DOM HTML APIs are absent, CSP still blocks
network access, and the single-file build remains self-contained.

Validation also generates `templates/3-template-all-a.etc` from the local
`3.etc` sample, runs the replacement engine against that template, writes
`tests/generated/3-template-all-a-fixed.etc`, and checks that all available
Messpunkt placeholders are numbered correctly. This local real-file validation
is skipped when `3.etc` is not present, because real ETC exports should not be
committed to a public repository.
