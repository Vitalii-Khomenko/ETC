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

## Files

- `index.html` - split version with external `css/` and `js/`.
- `dist/ETC-Equipment-ID-Fixer.html` - single-file mobile build.
- `js/etc-fixer.js` - search and replacement engine.
- `tests/run_validation.py` - regression validation for logic and build output.

## Workflow

1. Open `dist/ETC-Equipment-ID-Fixer.html` in a browser.
2. Select the `.etc` file.
3. The app counts `ELECTRICALEQUIPMENT` tags, `Messpunkt` tags, and `A`/`a`
   placeholders. In range mode, `Quantity` is filled from the detected
   placeholder count.
4. Enter the start number, quantity, and number step. By default, replacement
   starts with the first matching `A` in file order.
5. Enable `Use dbno start filter` only when the run should start at a specific
   `dbno` or later.
6. Press `Preview`, then `Replace`.
7. Download the new `.etc` file and export log. The ETC output name is the
   original file name plus the configured suffix, for example `3_fixed.etc`.
   The log uses the exported file name plus `_export-log.txt`, for example
   `3_fixed_export-log.txt`.

Each export log records the export timestamp, source file name, output file
name, replacement settings, replacement count, warnings, and a row-by-row list
of old `id`/`txt` values and new `id`/`txt` values.

By default, `Only replace id/txt with A/a` is enabled: a tag is changed only when
`id` or `txt` is `A`/`a`. Disable it only when you intentionally want to
overwrite existing numeric IDs.

## Validation

```bash
python tests/run_validation.py
```

The validation suite also generates `templates/3-template-all-a.etc` from the
local `3.etc` sample, runs the replacement engine against that template, writes
`tests/generated/3-template-all-a-fixed.etc`, and checks that all available
Messpunkt placeholders are numbered correctly. This local real-file validation
is skipped when `3.etc` is not present, because real ETC exports should not be
committed to a public repository.
