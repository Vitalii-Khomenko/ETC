# Security Policy

## Local-First Privacy

ETC Equipment ID Fixer is designed as a local browser tool. ETC files are
selected through the browser file picker, read in memory, changed in the same
tab, and exported through browser downloads.

The app does not intentionally use:

- remote upload endpoints,
- analytics or telemetry,
- cookies,
- localStorage or sessionStorage,
- WebSocket connections,
- third-party runtime JavaScript.

Generated templates derived from real ETC files can still contain customer
data. Keep them local unless they have been reviewed and anonymized.

Real `.etc` exports are ignored by `.gitignore` and should not be committed to
public repositories.

Export logs are generated locally with each download. They include source file
names, output file names, replacement settings, old `id`/`txt` values, and new
`id`/`txt` values, so treat them like ETC-derived data and keep them local
unless reviewed.

## Supported Deployment

The primary supported deployment is opening
`dist/ETC-Equipment-ID-Fixer.html` directly on a smartphone or laptop.

The split version (`index.html` + `css/` + `js/`) is suitable for maintenance
and can be hosted as a static site if needed. The split version includes a
stricter Content Security Policy because it does not need inline scripts or
inline styles.

## Content Security Policy

Current browser-level policy:

- `index.html` permits only same-origin scripts and styles and blocks network
  connections.
- `dist/ETC-Equipment-ID-Fixer.html` permits inline script/style because it
  must remain self-contained for field use, but still blocks network
  connections, object embedding, base URI changes, and form submission.

If the app is hosted behind a web server, prefer sending equivalent HTTP
headers:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

For the single-file build, `script-src` and `style-src` require
`'unsafe-inline'` unless the app is rebuilt into external local files.

## Input And Output Hardening

- File selection is limited by extension and size before reading.
- Numeric fields use strict whole-number validation, so mixed input such as
  `6abc` is rejected.
- Range mode is capped to protect mobile browsers from accidental oversized
  runs.
- The number step is strictly validated and capped.
- Download suffixes are limited to safe filename characters.
- Export log names are derived from sanitized output file names.
- Tags missing either `id` or `txt` are skipped instead of being partially
  rewritten.
- Placeholder matching is case-insensitive and accepts `A`/`a` in either
  `id` or `txt`; accepted tags still rewrite both attributes.

## Reporting Issues

Do not attach private customer ETC data to public issues. Describe the problem
with a minimal synthetic sample whenever possible.
