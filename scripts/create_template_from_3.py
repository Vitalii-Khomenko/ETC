"""Create a local A-placeholder ETC template from the sample 3.etc file."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "3.etc"
OUTPUT_PATH = ROOT / "templates" / "3-template-all-a.etc"
TAG_RE = re.compile(r"<ELECTRICALEQUIPMENT\b[^>]*>")
ATTR_RE = re.compile(r'([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"')


def parse_attrs(tag: str) -> dict[str, str]:
    return {name: value for name, value in ATTR_RE.findall(tag)}


def replace_attr(tag: str, attr_name: str, value: str) -> str:
    attr_pattern = re.compile(rf'(\b{re.escape(attr_name)}\s*=\s*")[^"]*(")')
    return attr_pattern.sub(rf"\1{value}\2", tag, count=1)


def convert_text(text: str) -> tuple[str, int]:
    changed = 0

    def replace_tag(match: re.Match[str]) -> str:
        nonlocal changed
        tag = match.group(0)
        attrs = parse_attrs(tag)
        if attrs.get("type") != "Messpunkt":
            return tag
        if "id" not in attrs or "txt" not in attrs:
            return tag
        changed += 1
        tag = replace_attr(tag, "id", "A")
        return replace_attr(tag, "txt", "A")

    return TAG_RE.sub(replace_tag, text), changed


def main() -> None:
    text = SOURCE_PATH.read_text(encoding="utf-8")
    converted, changed = convert_text(text)
    OUTPUT_PATH.parent.mkdir(exist_ok=True)
    OUTPUT_PATH.write_text(converted, encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)} with {changed} Messpunkt placeholders")


if __name__ == "__main__":
    main()
