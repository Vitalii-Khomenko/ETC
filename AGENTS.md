# Project Instructions

## Language Policy

Use English only throughout this project.

This applies to:

- User-facing UI text.
- Browser alerts, prompts, buttons, labels, and validation messages.
- Documentation and README files.
- Code comments and inline developer notes.
- Script output and command-line prompts.
- Commit messages, pull request titles, pull request descriptions, and issue text.
- Generated example data, unless the ETC/XML input sample explicitly requires another language.

Do not add Russian or any other non-English text to project files.

## Development Notes

- Keep the app usable as a local browser-based ETC equipment ID fixer unless a task explicitly introduces a backend.
- Keep `dist/ETC-Equipment-ID-Fixer.html` self-contained for mobile field use.
- Keep the split version in `index.html`, `css/`, and `js/` aligned with the single-file version after logic changes.
- Preserve source file formatting around `ELECTRICALEQUIPMENT` tags.
- Preserve the placeholder safety default: change only tags where `id` or `txt` is `A`/`a` unless the user changes options.
- Keep numbering deterministic: start at the selected number and increment by the selected number step for each accepted replacement.
- Keep machine range numbering deterministic: group equipment by the open `BUILDING` machine and nearest open `CIRCUIT` section, then apply each enabled section group independently.
- Keep the machine diagram view synchronized with the current loaded content and replacement safety filters.
- Keep split section ranges deterministic: fixed `Count` values consume that many matching tags in file order, and a blank `Count` consumes the remaining tags in that section.
- Keep replacement start/range fields empty by default; keep the number step default at `1`.
- Start from the first matching `A` by default; use dbno only when the explicit filter is enabled.
- Update project documentation after each functional change.
- Run `python tests/run_validation.py` after every functional update.
- Keep `scripts/run_privacy_gate.py` passing before publishing changes.
- After each completed task, commit and push the intended project changes to GitHub unless the user explicitly asks not to publish.
- Before every commit or push, verify that private ETC-derived files, generated templates, generated outputs, and export logs are ignored or excluded from staging.
- Keep comments and developer notes concise, accurate, and in English.
