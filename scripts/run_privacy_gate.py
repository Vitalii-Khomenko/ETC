"""Run publish-time privacy and static security checks."""

from __future__ import annotations

import fnmatch
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

PRIVATE_PATH_PATTERNS = [
    "*.etc",
    "templates/*.etc",
    "tests/generated/*",
    "tests/generated/**",
    "*_fixed.*",
    "*_export-log.txt",
    "*.tmp",
    "*.bak",
]

TEXT_EXTENSIONS = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".md",
    ".py",
    ".txt",
}

TEXT_FILE_NAMES = {
    ".gitignore",
}

FORBIDDEN_RUNTIME_PATTERNS = [
    (r"\bfetch\s*\(", "runtime network fetch"),
    (r"\bXMLHttpRequest\b", "runtime XMLHttpRequest"),
    (r"\bWebSocket\b", "runtime WebSocket"),
    (r"\bsendBeacon\s*\(", "runtime sendBeacon"),
    (r"\blocalStorage\b", "browser localStorage"),
    (r"\bsessionStorage\b", "browser sessionStorage"),
    (r"\bdocument\.cookie\b", "browser cookies"),
]

FORBIDDEN_DOM_PATTERNS = [
    (r"\binnerHTML\b", "innerHTML"),
    (r"\bouterHTML\b", "outerHTML"),
    (r"\binsertAdjacentHTML\b", "insertAdjacentHTML"),
    (r"\bdocument\.write\b", "document.write"),
    (r"\beval\s*\(", "eval"),
    (r"\bnew\s+Function\b", "new Function"),
]


def run_git(args: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=check,
        text=True,
        capture_output=True,
    )


def git_lines(args: list[str]) -> list[str]:
    completed = run_git(args)
    return [line.strip() for line in completed.stdout.splitlines() if line.strip()]


def normalize(path: str | Path) -> str:
    return str(path).replace("\\", "/").lstrip("./")


def matches_private_pattern(path: str | Path) -> bool:
    value = normalize(path)
    return any(fnmatch.fnmatch(value, pattern) for pattern in PRIVATE_PATH_PATTERNS)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def is_text_path(path: str | Path) -> bool:
    value = Path(str(path))
    return value.suffix.lower() in TEXT_EXTENSIONS or value.name in TEXT_FILE_NAMES


def fail(message: str) -> None:
    print(f"Privacy gate failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def assert_no_private_tracked_or_staged_files() -> None:
    tracked = git_lines(["ls-files"])
    private_tracked = [path for path in tracked if matches_private_pattern(path)]
    if private_tracked:
        fail(f"private files are tracked: {', '.join(private_tracked)}")

    staged = git_lines(["diff", "--cached", "--name-only"])
    private_staged = [path for path in staged if matches_private_pattern(path)]
    if private_staged:
        fail(f"private files are staged: {', '.join(private_staged)}")

    status = git_lines(["status", "--short"])
    untracked_private = []
    for line in status:
        if not line.startswith("?? "):
            continue
        path = line[3:].strip().strip('"')
        if matches_private_pattern(path):
            untracked_private.append(path)
    if untracked_private:
        fail(f"private files are untracked instead of ignored: {', '.join(untracked_private)}")


def assert_known_private_files_are_ignored() -> None:
    candidates = [
        ROOT / "3.etc",
        ROOT / "5.etc",
        *sorted((ROOT / "templates").glob("*.etc")),
        *sorted((ROOT / "tests" / "generated").glob("*")),
    ]
    for path in candidates:
        if not path.exists():
            continue
        relative = normalize(path.relative_to(ROOT))
        completed = run_git(["check-ignore", "-q", relative], check=False)
        if completed.returncode != 0:
            fail(f"private local file is not ignored: {relative}")


def assert_no_cyrillic_in_tracked_text() -> None:
    cyrillic_re = re.compile(r"[\u0400-\u04FF]")
    for relative in git_lines(["ls-files"]):
        if not is_text_path(relative):
            continue
        path = ROOT / relative
        if not path.exists():
            continue
        if cyrillic_re.search(read_text(path)):
            fail(f"tracked project file contains Cyrillic text: {relative}")


def assert_runtime_sources_are_local_only() -> None:
    source_paths = [
        ROOT / "index.html",
        *sorted((ROOT / "js").glob("*.js")),
    ]
    for path in source_paths:
        text = read_text(path)
        relative = normalize(path.relative_to(ROOT))
        for pattern, label in FORBIDDEN_RUNTIME_PATTERNS:
            if re.search(pattern, text):
                fail(f"{label} found in {relative}")
        for pattern, label in FORBIDDEN_DOM_PATTERNS:
            if re.search(pattern, text):
                fail(f"unsafe DOM API {label} found in {relative}")


def assert_csp_and_dist_are_hardened() -> None:
    index_html = read_text(ROOT / "index.html")
    dist_html = read_text(ROOT / "dist" / "ETC-Equipment-ID-Fixer.html")
    for label, text in [("index.html", index_html), ("dist/ETC-Equipment-ID-Fixer.html", dist_html)]:
        for directive in ["connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]:
            if directive not in text:
                fail(f"CSP directive {directive} is missing from {label}")

    if "<script src=" in dist_html:
        fail("single-file build still references an external script")
    if '<link rel="stylesheet"' in dist_html:
        fail("single-file build still references an external stylesheet")


def main() -> None:
    run_git(["rev-parse", "--show-toplevel"])
    assert_no_private_tracked_or_staged_files()
    assert_known_private_files_are_ignored()
    assert_no_cyrillic_in_tracked_text()
    assert_runtime_sources_are_local_only()
    assert_csp_and_dist_are_hardened()
    print("Privacy gate passed")


if __name__ == "__main__":
    main()
