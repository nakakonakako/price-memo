#!/usr/bin/env python3
"""Fail closed unless local app configuration targets the approved Dev project."""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

DEVELOPMENT_PROJECT_REF = "irgahixsuvtopiwmtkku"
DEVELOPMENT_HOST = f"{DEVELOPMENT_PROJECT_REF}.supabase.co"
VITE_ENV_FILES = (
    "frontend/.env",
    "frontend/.env.local",
    "frontend/.env.development",
    "frontend/.env.development.local",
)
BACKEND_ENV_FILES = ("backend/app/.env", "backend/.env", ".env")
KEY_PATTERN = re.compile(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$")


class TargetError(Exception):
    """A safe-to-display configuration error."""


def fail(message: str) -> None:
    raise TargetError(message)


def read_selected_values(path: Path, selected: set[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        fail(f"Cannot read environment file {path.name}.")
        raise AssertionError from exc

    for line_number, line in enumerate(lines, start=1):
        match = KEY_PATTERN.match(line.strip())
        if not match or match.group(1) not in selected:
            continue
        key, raw_value = match.groups()
        if key in values:
            fail(f"{key} is duplicated in {path.name}.")
        value = raw_value.strip()
        if value.startswith(("'", '"')):
            quote = value[0]
            closing = value.find(quote, 1)
            if closing < 0 or value[closing + 1 :].strip().split("#", 1)[0].strip():
                fail(f"{key} has an invalid value in {path.name}:{line_number}.")
            value = value[1:closing]
        else:
            value = value.split("#", 1)[0].strip()
        if "$" in value or "`" in value:
            fail(f"{key} must be a literal value in {path.name}.")
        values[key] = value
    return values


def valid_development_url(value: str, key: str, source: str) -> None:
    try:
        parsed = urlsplit(value)
        valid = (
            parsed.scheme == "https"
            and parsed.hostname == DEVELOPMENT_HOST
            and parsed.username is None
            and parsed.password is None
            and parsed.port is None
            and parsed.path in ("", "/")
            and not parsed.query
            and not parsed.fragment
        )
    except ValueError:
        valid = False
    if not value or not valid:
        fail(f"{key} in {source} must target the approved development project.")


def validate_all_file_urls(
    root: Path, files: tuple[str, ...], key: str
) -> dict[str, str]:
    collected: dict[str, str] = {}
    for relative_path in files:
        path = root / relative_path
        if path.is_symlink() and not path.exists():
            fail(f"Environment file {relative_path} is a broken symlink.")
        if not path.exists():
            continue
        if not path.is_file():
            fail(f"Environment path {relative_path} is not a regular file.")
        values = read_selected_values(path, {key})
        if key in values:
            valid_development_url(values[key], key, relative_path)
            collected[relative_path] = values[key]
    return collected


def effective_backend_file(root: Path) -> Path | None:
    for relative_path in BACKEND_ENV_FILES:
        path = root / relative_path
        if path.is_symlink() and not path.exists():
            fail(f"Backend environment file {relative_path} is a broken symlink.")
        if path.exists():
            if not path.is_file():
                fail(f"Backend environment path {relative_path} is not a regular file.")
            return path
    return None


def validate(root: Path) -> None:
    if os.environ.get("PYTHON_DOTENV_DISABLED", "").casefold() in {
        "1",
        "true",
        "t",
        "yes",
        "y",
    }:
        fail("PYTHON_DOTENV_DISABLED prevents backend dotenv loading.")

    vite_values = validate_all_file_urls(root, VITE_ENV_FILES, "VITE_SUPABASE_URL")
    if len(vite_values) > 1:
        fail("VITE_SUPABASE_URL is defined in multiple Vite dotenv files.")
    process_vite_url = os.environ.get("VITE_SUPABASE_URL")
    effective_vite_url = process_vite_url if process_vite_url is not None else None
    if effective_vite_url is None:
        for relative_path in reversed(VITE_ENV_FILES):
            if relative_path in vite_values:
                effective_vite_url = vite_values[relative_path]
                break
    if effective_vite_url is None:
        fail("VITE_SUPABASE_URL is missing from the effective Vite environment.")
    valid_development_url(
        effective_vite_url, "VITE_SUPABASE_URL", "the effective Vite environment"
    )

    publishable_key = os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    if publishable_key is None:
        for relative_path in reversed(VITE_ENV_FILES):
            path = root / relative_path
            if path.is_file():
                values = read_selected_values(path, {"VITE_SUPABASE_PUBLISHABLE_KEY"})
                if "VITE_SUPABASE_PUBLISHABLE_KEY" in values:
                    publishable_key = values["VITE_SUPABASE_PUBLISHABLE_KEY"]
                    break
    if not publishable_key:
        fail(
            "VITE_SUPABASE_PUBLISHABLE_KEY is missing from the effective Vite environment."
        )

    backend_file = effective_backend_file(root)
    backend_values: dict[str, str] = {}
    if backend_file is not None:
        backend_values = read_selected_values(backend_file, {"SUPABASE_URL"})
    backend_url = os.environ.get("SUPABASE_URL")
    if backend_url is None:
        backend_url = backend_values.get("SUPABASE_URL")
    if backend_url is None:
        fail("SUPABASE_URL is missing from the effective backend environment.")
    source = (
        "the process environment"
        if "SUPABASE_URL" in os.environ
        else (
            backend_file.relative_to(root).as_posix()
            if backend_file
            else "backend dotenv"
        )
    )
    valid_development_url(backend_url, "SUPABASE_URL", source)


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] != "validate":
        print(
            "Usage: dev-supabase-target.py validate <repository-root>", file=sys.stderr
        )
        return 2
    try:
        validate(Path(sys.argv[2]).resolve())
    except TargetError as exc:
        print(f"[dev-env] {exc}", file=sys.stderr)
        return 2
    print(f"[dev-env] Supabase target validated ({DEVELOPMENT_PROJECT_REF}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
