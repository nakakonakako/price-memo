#!/usr/bin/env python3
"""Run Cursor while exposing only bounded, allowlisted progress metadata."""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import re
import selectors
import signal
import stat
import subprocess
import sys
import time
import uuid
from collections import Counter
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path

HEARTBEAT_SECONDS = 30
MAX_EVENT_BYTES = 256 * 1024
MAX_STDERR_LINE_BYTES = 4096
MAX_REPORT_INPUT_BYTES = 64 * 1024
MAX_REPORT_BYTES = 4096
MAX_FAILURE_RECORD_BYTES = 8192
MAX_FAILURE_AGE_SECONDS = 7 * 24 * 60 * 60
MAX_FAILURE_FILES = 20
MAX_PROGRESS_LINES = 300
MAX_ERROR_CATEGORIES = 20

EVENT_TYPES = {"system", "assistant", "tool_call", "result"}
EVENT_SUBTYPES = {
    "init", "success", "error", "delta", "start", "started", "complete",
    "completed", "failed", "running",
}
TOOL_CATEGORIES = {
    "readToolCall": "ファイル読み取り", "read_tool_call": "ファイル読み取り",
    "editToolCall": "ファイル作成・編集", "edit_tool_call": "ファイル作成・編集",
    "writeToolCall": "ファイル作成・編集", "write_tool_call": "ファイル作成・編集",
    "deleteToolCall": "ファイル作成・編集", "delete_tool_call": "ファイル作成・編集",
    "shellToolCall": "Shellコマンド", "shell_tool_call": "Shellコマンド",
    "bashToolCall": "Shellコマンド", "bash_tool_call": "Shellコマンド",
    "mcpToolCall": "MCPツール", "mcp_tool_call": "MCPツール",
}
TOOL_CATEGORY_PRIORITY = tuple(TOOL_CATEGORIES)
FAILURE_MARKER_KEYS = {"error", "failure", "failed"}

ERROR_PATTERNS = {
    "resource_exhausted": re.compile(r"resource[_ -]?exhausted|insufficient (?:model )?capacity", re.I),
    "network_connection": re.compile(
        r"\bnetwork\b.{0,80}\b(?:error|failed|failure|timeout|unavailable|reset|refused)\b"
        r"|\bconnection\b.{0,80}\b(?:error|failed|failure|timeout|refused|reset|closed)\b"
        r"|\b(?:econnreset|econnrefused|econnaborted|etimedout|enotfound)\b"
        r"|\b(?:dns|socket|tls|handshake)\b.{0,80}\b(?:error|failed|failure|timeout)\b", re.I),
    "authentication": re.compile(
        r"\b(?:authentication|authorization|unauthorized|not logged in|invalid token|401)\b"
        r"|\bauth(?: error| failed| failure| denied)\b", re.I),
    "workspace_trust_required": re.compile(r"\bworkspace trust required\b", re.I),
    "permission_denied": re.compile(r"permission denied|access denied|not permitted|\beacces\b|\beperm\b", re.I),
    "mcp_initialization": re.compile(
        r"\bmcp\b.{0,80}(?:initiali[sz]|failed|error)|(?:initiali[sz]|failed|error).{0,80}\bmcp\b", re.I),
    "mcp_approval_required": re.compile(
        r"\bmcp\b.{0,100}(?:not approved|approval required|needs approval|not enabled)"
        r"|(?:not approved|approval required|needs approval|not enabled).{0,100}\bmcp\b", re.I),
    "worktree_creation": re.compile(r"fatal:.*worktree|unable to create.*worktree|failed to create.*worktree", re.I),
    "worktree_setup": re.compile(r"worktree setup (?:failed|error)|setup script.*(?:failed|error)|failed.*setup", re.I),
}

SECRET_ENV_NAME = re.compile(
    r"(?i)(?:api[_-]?key|access[_-]?key|service[_-]?role[_-]?key|"
    r"(?:^|_)[a-z0-9]*_key(?:_|$)|secret|token|password|passwd|credential|"
    r"private[_-]?key|database[_-]?url|(?:^|_)dsn(?:_|$))"
)
SECRET_PATTERNS = (
    re.compile(r"(?i)(authorization\s*:\s*(?:bearer|basic)\s+)\S+"),
    re.compile(r"(?i)\b(bearer\s+)[A-Za-z0-9._~+/-]+=*"),
    re.compile(r"(?i)\b(api[ _-]?key|access[ _-]?token|refresh[ _-]?token|token|password|secret|credential)\s*[\"']?\s*[:=]\s*(?:\"[^\"]*\"|'[^']*'|[^\s,;}]+)"),
    re.compile(r"\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{30,}|ya29\.[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
    re.compile(r"(?i)(https?://)[^/@\s:]+:[^/@\s]+@"),
    re.compile(r"(?i)([?&](?:token|key|secret|password)=)[^&#\s]+"),
    re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I),
)
ANSI_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[@-_]")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f\u2028\u2029]")
REPORT_BEGIN = "[delegate-cursor] ----- worker completion report begin -----"
REPORT_END = "[delegate-cursor] ----- worker completion report end -----"
REPORT_PREFIX = "[delegate-cursor] report: "
REPORT_TRUNCATED = "[delegate-cursor] report: [truncated]"
REPORT_OMITTED = "[delegate-cursor] report: omitted (result text absent)"
REPORT_INPUT_TRUNCATED = (
    "[delegate-cursor] verification UNCONFIRMED: final report exceeded 64 KiB; "
    "the omitted tail may contain additional results"
)
REPORT_MISSING_VERIFICATION = (
    "[delegate-cursor] verification UNCONFIRMED: verification block or coverage "
    "declaration is missing, malformed, repeated, or contradictory"
)
REPORT_PREFIX_UNTRUSTED = (
    "[delegate-cursor] report: untrusted free-form text; review the diff"
)
MAX_REPORT_FINDING_BYTES = 600
MAX_REPORT_CONTEXT_BYTES = 320
REPORT_STATUS_RE = re.compile(r"^(PASS|FAIL|UNCONFIRMED):\s*(.*)$", re.I)
REPORT_COVERAGE_RE = re.compile(r"^COVERAGE:\s*(COMPLETE|INCOMPLETE)\s*$", re.I)
REPORT_BLOCK_START_RE = re.compile(r"^#{0,6}\s*VERIFICATION RESULTS\s*:?\s*$", re.I)
REPORT_BLOCK_END_RE = re.compile(r"^#{0,6}\s*END VERIFICATION RESULTS\s*$", re.I)
interrupted_signal: int | None = None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _signal_handler(signum: int, _frame: object) -> None:
    global interrupted_signal
    interrupted_signal = signum


class BoundedStdoutLines:
    """Yield newline-delimited records without retaining oversized rows."""

    def __init__(self, max_bytes: int = MAX_EVENT_BYTES) -> None:
        self.max_bytes = max_bytes
        self.buffer = bytearray()
        self.discarding = False
        self.pending_cr = False
        self.oversized_lines = 0

    @property
    def buffered_bytes(self) -> int:
        return len(self.buffer)

    def feed(self, chunk: bytes) -> Iterator[bytes]:
        remaining = chunk
        while remaining:
            if self.discarding:
                newline = remaining.find(b"\n")
                if newline < 0:
                    return
                remaining = remaining[newline + 1 :]
                self.discarding = False
                continue

            newline = remaining.find(b"\n")
            end = len(remaining) if newline < 0 else newline
            segment = remaining[:end]
            has_newline = newline >= 0
            if self.pending_cr:
                if not (has_newline and not segment):
                    segment = b"\r" + segment
                self.pending_cr = False
            if has_newline and segment.endswith(b"\r"):
                segment = segment[:-1]
            elif not has_newline and segment.endswith(b"\r"):
                segment = segment[:-1]
                self.pending_cr = True
            if len(self.buffer) + len(segment) > self.max_bytes:
                self.buffer.clear()
                self.pending_cr = False
                self.oversized_lines += 1
                self.discarding = not has_newline
                if has_newline:
                    remaining = remaining[newline + 1 :]
                    continue
                return

            self.buffer.extend(segment)
            if not has_newline:
                return
            yield bytes(self.buffer)
            self.buffer.clear()
            self.pending_cr = False
            remaining = remaining[newline + 1 :]

    def finish(self) -> Iterator[bytes]:
        if self.discarding:
            self.discarding = False
            return
        if self.pending_cr:
            if len(self.buffer) == self.max_bytes:
                self.buffer.clear()
                self.pending_cr = False
                self.oversized_lines += 1
                return
            self.buffer.extend(b"\r")
            self.pending_cr = False
        if self.buffer:
            if self.buffer.strip():
                yield bytes(self.buffer)
            self.buffer.clear()


def safe_event_name(event: object) -> tuple[str, str | None]:
    if not isinstance(event, dict):
        return "unparsed_output", None
    event_type = event.get("type")
    if not isinstance(event_type, str):
        return "unparsed_output", None
    subtype = event.get("subtype")
    return (event_type if event_type in EVENT_TYPES else "other",
            subtype if isinstance(subtype, str) and subtype in EVENT_SUBTYPES else None)


def _tool_containers(event: dict[str, object]) -> list[dict[str, object]]:
    containers = [event]
    for key in ("tool_call", "toolCall"):
        value = event.get(key)
        if isinstance(value, dict):
            containers.append(value)
        elif isinstance(value, list):
            containers.extend(item for item in value if isinstance(item, dict))
    return containers


def tool_category(event: dict[str, object]) -> str:
    found = {
        key
        for container in _tool_containers(event)
        for key in container
        if isinstance(key, str) and key in TOOL_CATEGORIES
    }
    for key in TOOL_CATEGORY_PRIORITY:
        if key in found:
            return TOOL_CATEGORIES[key]
    return "その他"


def _has_failure_marker(node: object, depth: int = 0, budget: int = 200) -> bool:
    if budget <= 0 or depth > 8:
        return False
    if isinstance(node, dict):
        for key, value in node.items():
            if isinstance(key, str) and key in FAILURE_MARKER_KEYS:
                return True
            if isinstance(value, (dict, list)) and _has_failure_marker(
                value, depth + 1, budget - 1
            ):
                return True
    elif isinstance(node, list):
        for item in node[:50]:
            if isinstance(item, (dict, list)) and _has_failure_marker(
                item, depth + 1, budget - 1
            ):
                return True
    return False


def tool_payload_failed(event: dict[str, object]) -> bool:
    if event.get("is_error") is True:
        return True
    return any(
        key in event and _has_failure_marker(event.get(key))
        for key in ("tool_call", "toolCall")
    )


def tool_phase(event: object, subtype: str | None) -> str | None:
    if not isinstance(event, dict) or event.get("type") != "tool_call":
        return None
    if subtype == "delta":
        return None
    if subtype == "started":
        return "started"
    failed = subtype in {"failed", "error"} or tool_payload_failed(event)
    if failed and subtype in {None, "completed", "failed", "error"}:
        return "failed"
    if subtype == "completed":
        return "completed"
    return None


def is_coalesced_event(event: object, subtype: str | None) -> bool:
    if subtype == "delta":
        return True
    return isinstance(event, dict) and event.get("type") in {"assistant", "thinking"}


def redact_report(text: str) -> str:
    scrubbed = text
    secret_values = [
        value for name, value in os.environ.items()
        if SECRET_ENV_NAME.search(name) and len(value) >= 8
    ]
    for value in sorted(set(secret_values), key=len, reverse=True):
        scrubbed = scrubbed.replace(value, "[REDACTED]")
    scrubbed = ANSI_RE.sub("", scrubbed)
    scrubbed = CONTROL_RE.sub("", scrubbed)
    for pattern in SECRET_PATTERNS:
        if pattern.groups:
            scrubbed = pattern.sub(r"\1[REDACTED]", scrubbed)
        else:
            scrubbed = pattern.sub("[REDACTED]", scrubbed)
    scrubbed = scrubbed.replace(REPORT_BEGIN, "[report delimiter removed]")
    scrubbed = scrubbed.replace(REPORT_END, "[report delimiter removed]")
    return scrubbed


def _bounded_report_line(line: str, limit: int) -> str:
    raw = line.encode("utf-8")
    if len(raw) <= limit:
        return line
    suffix = " [line truncated]"
    budget = max(0, limit - len(suffix.encode("utf-8")))
    return raw[:budget].decode("utf-8", errors="ignore").rstrip() + suffix


def _verification_report_lines(
    text: str, input_truncated: bool
) -> tuple[str, list[str], list[str]]:
    findings: dict[str, list[str]] = {"FAIL": [], "UNCONFIRMED": [], "PASS": []}
    context: list[str] = []
    coverage_claims: list[str] = []
    malformed_status = False
    in_block = False
    start_count = 0
    end_count = 0
    criteria: set[str] = set()

    for line in text.splitlines():
        candidate = line.strip()
        candidate = re.sub(r"^[-*+]\s+", "", candidate)
        if REPORT_BLOCK_START_RE.fullmatch(candidate):
            if in_block:
                malformed_status = True
            start_count += 1
            if start_count > 1:
                malformed_status = True
            in_block = True
            continue
        if REPORT_BLOCK_END_RE.fullmatch(candidate):
            if not in_block:
                malformed_status = True
            else:
                end_count += 1
                if end_count > 1:
                    malformed_status = True
                in_block = False
            continue

        if not in_block:
            outside_status = REPORT_STATUS_RE.fullmatch(candidate)
            outside_coverage = candidate.upper().startswith("COVERAGE:")
            if outside_status or outside_coverage:
                malformed_status = True
                context.append(
                    _bounded_report_line(
                        f"unscoped status-like text: {line.strip()}",
                        MAX_REPORT_CONTEXT_BYTES,
                    )
                )
            elif line.strip():
                context.append(
                    _bounded_report_line(line.strip(), MAX_REPORT_CONTEXT_BYTES)
                )
            continue

        coverage = REPORT_COVERAGE_RE.fullmatch(candidate)
        if coverage:
            coverage_claims.append(coverage.group(1).upper())
            continue
        if candidate.upper().startswith("COVERAGE:"):
            malformed_status = True
            context.append(
                _bounded_report_line(
                    f"unscoped coverage-like text in malformed block: {line.strip()}",
                    MAX_REPORT_CONTEXT_BYTES,
                )
            )
            continue
        status = REPORT_STATUS_RE.fullmatch(candidate)
        if status:
            label = status.group(1).upper()
            value = status.group(2).strip()
            if "—" not in value:
                malformed_status = True
                context.append(
                    _bounded_report_line(
                        f"unscoped status-like text in malformed block: {line.strip()}",
                        MAX_REPORT_CONTEXT_BYTES,
                    )
                )
                continue
            criterion, evidence = (part.strip() for part in value.split("—", 1))
            if (
                not criterion
                or not evidence
                or (criterion.startswith("<") and criterion.endswith(">"))
                or (evidence.startswith("<") and evidence.endswith(">"))
                or criterion in {"...", "TBD"}
                or evidence in {"...", "TBD"}
            ):
                malformed_status = True
                context.append(
                    _bounded_report_line(
                        f"unscoped status-like text in malformed block: {line.strip()}",
                        MAX_REPORT_CONTEXT_BYTES,
                    )
                )
                continue
            criterion_key = re.sub(r"\s+", " ", criterion).casefold()
            if criterion_key in criteria:
                malformed_status = True
            criteria.add(criterion_key)
            findings[label].append(
                _bounded_report_line(
                    f"[delegate-cursor] verification {label}: {criterion} — {evidence}",
                    MAX_REPORT_FINDING_BYTES,
                )
            )
            continue
        if candidate.upper().startswith(("PASS:", "FAIL:", "UNCONFIRMED:")):
            malformed_status = True
            continue
        if line.strip():
            context.append(_bounded_report_line(line.strip(), MAX_REPORT_CONTEXT_BYTES))

    if in_block:
        malformed_status = True
    valid_block = start_count == 1 and end_count == 1 and not in_block
    if not valid_block:
        for label in findings:
            for finding in findings[label]:
                unscoped = finding.partition("] verification ")[2] or finding
                context.append(
                    _bounded_report_line(
                        f"unscoped status-like text from malformed block: {unscoped}",
                        MAX_REPORT_CONTEXT_BYTES,
                    )
                )
            findings[label].clear()
    context.sort(key=lambda line: not line.startswith("unscoped status-like text"))
    valid_coverage = len(coverage_claims) == 1
    has_findings = any(findings.values())
    if input_truncated:
        coverage_status = "UNCONFIRMED"
        findings["UNCONFIRMED"].insert(0, REPORT_INPUT_TRUNCATED)
    elif not valid_block or not valid_coverage or malformed_status or not has_findings:
        coverage_status = "UNCONFIRMED"
        findings["UNCONFIRMED"].insert(0, REPORT_MISSING_VERIFICATION)
    elif coverage_claims[0] == "INCOMPLETE" or findings["UNCONFIRMED"]:
        coverage_status = "INCOMPLETE"
        if coverage_claims[0] == "INCOMPLETE" and not findings["UNCONFIRMED"]:
            findings["UNCONFIRMED"].append(
                "[delegate-cursor] verification UNCONFIRMED: worker marked coverage "
                "incomplete but did not identify the unchecked criterion"
            )
    else:
        coverage_status = "COMPLETE"

    prioritized: list[str] = []
    for label in ("FAIL", "UNCONFIRMED", "PASS"):
        if findings[label]:
            prioritized.append(findings[label][0])
    for label in ("FAIL", "UNCONFIRMED", "PASS"):
        prioritized.extend(findings[label][1:])
    return coverage_status, prioritized, context


def _report_output_lines(body: list[str]) -> list[str]:
    def output_size(candidate: list[str]) -> int:
        return len(("\n".join(candidate) + "\n").encode("utf-8"))

    lines = [REPORT_BEGIN, *body, REPORT_END]
    if output_size(lines) <= MAX_REPORT_BYTES:
        return lines

    kept = [REPORT_BEGIN]
    omitted = False
    for line in body:
        if output_size([*kept, line, REPORT_TRUNCATED, REPORT_END]) <= MAX_REPORT_BYTES:
            kept.append(line)
        else:
            omitted = True
    if omitted:
        while output_size([*kept, REPORT_TRUNCATED, REPORT_END]) > MAX_REPORT_BYTES and len(kept) > 1:
            kept.pop()
        kept.append(REPORT_TRUNCATED)
    kept.append(REPORT_END)
    return kept


def emit_report(value: object, truncated: bool) -> None:
    report = value if isinstance(value, str) else ""
    raw = report.encode("utf-8")
    input_truncated = truncated or len(raw) > MAX_REPORT_INPUT_BYTES
    report = raw[:MAX_REPORT_INPUT_BYTES].decode("utf-8", errors="ignore")
    if input_truncated:
        report = report.rsplit("\n", 1)[0] if "\n" in report else ""
    report = redact_report(report)
    coverage, findings, context = _verification_report_lines(report, input_truncated)
    counts = {"PASS": 0, "FAIL": 0, "UNCONFIRMED": 0}
    for line in findings:
        match = re.match(r"\[delegate-cursor\] verification (PASS|FAIL|UNCONFIRMED):", line)
        if match:
            counts[match.group(1)] += 1
    body = [
        f"[delegate-cursor] verification_coverage: {coverage}",
        (
            "[delegate-cursor] verification_counts: "
            f"PASS={counts['PASS']} FAIL={counts['FAIL']} UNCONFIRMED={counts['UNCONFIRMED']}"
        ),
        *findings,
    ]
    if input_truncated:
        body.extend((REPORT_TRUNCATED, "[delegate-cursor] report: input truncated at 64 KiB"))
    body.append(REPORT_PREFIX_UNTRUSTED)
    if not report.strip():
        body.append(REPORT_OMITTED)
    else:
        body.extend(f"{REPORT_PREFIX}{line}" for line in context)
    for line in _report_output_lines(body):
        print(line, flush=True)


def classify_outcome(exit_code: int, result_status: str, result_is_error: bool | None,
                     categories: Counter[str], workspace_mode: bool, signal_number: int | None) -> str:
    if signal_number is not None:
        return "interrupted"
    if exit_code == 0 and result_status == "success" and result_is_error is not True:
        return "success"
    if workspace_mode and categories.get("worktree_setup", 0):
        return "worktree_setup"
    if workspace_mode and categories.get("worktree_creation", 0):
        return "worktree_creation"
    return "cursor_agent_unclassified"


def _open_state_directory(path: Path) -> int:
    """Open/create a private directory chain without following symlinks."""
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    directory = getattr(os, "O_DIRECTORY", 0)
    if not nofollow or not directory:
        raise OSError("safe directory flags unavailable")
    absolute = Path(os.path.abspath(path))
    fd = os.open(os.sep, os.O_RDONLY | directory | nofollow)
    try:
        components = absolute.parts[1:]
        for index, component in enumerate(components):
            try:
                next_fd = os.open(component, os.O_RDONLY | directory | nofollow, dir_fd=fd)
            except FileNotFoundError:
                os.mkdir(component, 0o700, dir_fd=fd)
                next_fd = os.open(component, os.O_RDONLY | directory | nofollow, dir_fd=fd)
            info = os.fstat(next_fd)
            sticky_shared_parent = bool(info.st_mode & stat.S_ISVTX)
            if not stat.S_ISDIR(info.st_mode) or (
                info.st_uid not in {0, os.getuid()} and not sticky_shared_parent
            ):
                os.close(next_fd)
                raise OSError("unsafe state directory owner or type")
            if info.st_mode & 0o022 and not sticky_shared_parent:
                os.close(next_fd)
                raise OSError("writable state directory parent")
            if index == len(components) - 1 and (
                info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700
            ):
                os.close(next_fd)
                raise OSError("state directory must be owned and mode 0700")
            os.close(fd)
            fd = next_fd
        return fd
    except Exception:
        os.close(fd)
        raise


def _failure_names(dir_fd: int) -> list[tuple[str, float]]:
    names: list[tuple[str, float]] = []
    pattern = re.compile(r"safe-failure-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}\.json\Z")
    for name in os.listdir(dir_fd):
        if not pattern.fullmatch(name):
            continue
        try:
            info = os.stat(name, dir_fd=dir_fd, follow_symlinks=False)
        except OSError:
            continue
        if stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid():
            names.append((name, info.st_mtime))
    return names


def prune_failure_records(dir_fd: int, now: float | None = None) -> None:
    current = time.time() if now is None else now
    records = _failure_names(dir_fd)
    kept: list[tuple[str, float]] = []
    for name, modified in records:
        if current - modified > MAX_FAILURE_AGE_SECONDS:
            try:
                os.unlink(name, dir_fd=dir_fd)
            except OSError:
                pass
        else:
            kept.append((name, modified))
    kept.sort(key=lambda item: item[1], reverse=True)
    for name, _ in kept[MAX_FAILURE_FILES - 1:]:
        try:
            os.unlink(name, dir_fd=dir_fd)
        except OSError:
            pass


def save_failure_record(data: dict[str, object]) -> bool:
    state_root = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local/state")))
    state_dir = state_root / "price-memo" / "delegate-cursor"
    fd: int | None = None
    name = ""
    file_fd: int | None = None
    created = False
    try:
        fd = _open_state_directory(state_dir)
        prune_failure_records(fd)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        name = f"safe-failure-{timestamp}-{uuid.uuid4().hex[:12]}.json"
        payload = json.dumps(data, ensure_ascii=True, separators=(",", ":")).encode("utf-8") + b"\n"
        if len(payload) > MAX_FAILURE_RECORD_BYTES:
            return False
        file_fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
        created = True
        info = os.fstat(file_fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
            return False
        with os.fdopen(file_fd, "wb", closefd=True) as handle:
            file_fd = None
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        prune_failure_records(fd)
        return True
    except OSError:
        if fd is not None and name and created:
            try:
                os.unlink(name, dir_fd=fd)
            except OSError:
                pass
        return False
    finally:
        if file_fd is not None:
            os.close(file_fd)
        if fd is not None:
            os.close(fd)


def acquire_workspace_lock(checkout: Path) -> int:
    """Hold a per-canonical-workspace advisory lock for the worker lifetime."""
    canonical = checkout.resolve(strict=True)
    if not canonical.is_dir():
        raise OSError("workspace is not a directory")
    identity = hashlib.sha256(os.fsencode(canonical)).hexdigest()
    state_root = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local/state")))
    state_dir = state_root / "price-memo" / "delegate-cursor"
    dir_fd = _open_state_directory(state_dir)
    lock_fd: int | None = None
    try:
        name = f"workspace-lock-{identity}.lock"
        flags = os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)
        lock_fd = os.open(name, flags, 0o600, dir_fd=dir_fd)
        info = os.fstat(lock_fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
            raise OSError("unsafe workspace lock file")
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise WorkspaceAlreadyLocked from exc
        return lock_fd
    except Exception:
        if lock_fd is not None:
            os.close(lock_fd)
        raise
    finally:
        os.close(dir_fd)


class WorkspaceAlreadyLocked(Exception):
    """Another delegate currently owns the workspace lock."""


class StreamMonitor:
    def __init__(self, args: argparse.Namespace, command: list[str]) -> None:
        self.args = args
        self.command = command
        self.started_at = utc_now()
        self.started_mono = time.monotonic()
        self.last_event_at = self.started_at
        self.last_event_mono = self.started_mono
        self.last_event_type = "none"
        self.last_event_subtype: str | None = None
        self.last_operation: str | None = None
        self.assistant_updates = 0
        self.malformed_lines = 0
        self.oversized_lines = 0
        self.stdout_bytes = 0
        self.stderr_bytes = 0
        self.error_categories: Counter[str] = Counter()
        self.result_status = "missing"
        self.result_is_error: bool | None = None
        self.result_text: object = None
        self.result_truncated = False
        self.progress_lines = 0
        self.suppressed_progress = 0
        self.stdout_lines = BoundedStdoutLines()
        self.assistant_updates_reported = 0
        self._stderr_buffer = bytearray()
        self._stderr_discard = False
        self._child: subprocess.Popen[bytes] | None = None
        self.received_signal: int | None = None
        self._workspace_lock_fd: int | None = None

    def _print_progress(self, line: str) -> None:
        if self.progress_lines >= MAX_PROGRESS_LINES:
            self.suppressed_progress += 1
            return
        print(line, flush=True)
        self.progress_lines += 1

    def _flush_assistant_summary(self) -> None:
        if self.assistant_updates == self.assistant_updates_reported:
            return
        self._print_progress(
            f"[delegate-cursor] assistant_updates: {self.assistant_updates}"
        )
        self.assistant_updates_reported = self.assistant_updates

    def _record_error_line(self, raw: bytes) -> None:
        text = raw[:MAX_STDERR_LINE_BYTES].decode("utf-8", errors="ignore").lower()
        for category, pattern in ERROR_PATTERNS.items():
            if pattern.search(text) and len(self.error_categories) < MAX_ERROR_CATEGORIES:
                self.error_categories[category] += 1

    def _stdout_line(self, raw: bytes) -> None:
        try:
            event = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.malformed_lines += 1
            event = None
        self.last_event_type, self.last_event_subtype = safe_event_name(event)
        self.last_event_at = utc_now()
        self.last_event_mono = time.monotonic()
        quiet = is_coalesced_event(event, self.last_event_subtype)
        phase = tool_phase(event, self.last_event_subtype)
        if isinstance(event, dict) and event.get("type") == "result":
            subtype = event.get("subtype")
            if subtype == "success":
                self.result_status = "success"
            elif subtype == "error" or event.get("is_error") is True:
                self.result_status = "error"
            else:
                self.result_status = "other"
            error_value = event.get("is_error")
            self.result_is_error = error_value if isinstance(error_value, bool) else None
            report = event.get("result")
            if isinstance(report, str):
                encoded = report.encode("utf-8")
                self.result_truncated = len(encoded) > MAX_REPORT_INPUT_BYTES
                self.result_text = encoded[:MAX_REPORT_INPUT_BYTES].decode("utf-8", errors="ignore")
        if quiet:
            self.assistant_updates += 1
        if phase is not None:
            self._flush_assistant_summary()
            category = tool_category(event) if isinstance(event, dict) else "その他"
            self.last_operation = category
            self._print_progress(
                f"[delegate-cursor] tool: {category} {phase} at {self.last_event_at}"
            )
        elif not quiet:
            if self.last_event_type in {"system", "result"}:
                self._flush_assistant_summary()
            name = self.last_event_type
            subtype = f"/{self.last_event_subtype}" if self.last_event_subtype else ""
            self._print_progress(
                f"[delegate-cursor] event: {name}{subtype} at {self.last_event_at}"
            )

    def _feed_stdout(self, chunk: bytes) -> None:
        for raw_line in self.stdout_lines.feed(chunk):
            self._stdout_line(raw_line)
        self.oversized_lines = self.stdout_lines.oversized_lines

    def _feed_stderr(self, chunk: bytes) -> None:
        remaining = chunk
        while remaining:
            if self._stderr_discard:
                newline = remaining.find(b"\n")
                if newline < 0:
                    return
                self._stderr_discard = False
                remaining = remaining[newline + 1:]
                continue
            newline = remaining.find(b"\n")
            if newline >= 0:
                segment = remaining[:newline]
                if len(self._stderr_buffer) + len(segment) > MAX_STDERR_LINE_BYTES:
                    self._record_error_line(bytes(self._stderr_buffer))
                else:
                    self._stderr_buffer.extend(segment)
                    self._record_error_line(bytes(self._stderr_buffer))
                self._stderr_buffer.clear()
                remaining = remaining[newline + 1:]
                continue
            if len(self._stderr_buffer) + len(remaining) > MAX_STDERR_LINE_BYTES:
                self._record_error_line(bytes(self._stderr_buffer))
                self._stderr_buffer.clear()
                self._stderr_discard = True
            else:
                self._stderr_buffer.extend(remaining)
            break

    def _start_child(self) -> subprocess.Popen[bytes]:
        try:
            return subprocess.Popen(
                self.command,
                cwd=self.args.checkout,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                start_new_session=True,
                bufsize=0,
            )
        except OSError:
            print("[delegate-cursor] Cursor process could not be started (details suppressed)", flush=True)
            raise

    def run(self) -> int:
        global interrupted_signal
        try:
            self._workspace_lock_fd = acquire_workspace_lock(Path(self.args.checkout))
        except WorkspaceAlreadyLocked:
            print("[delegate-cursor] duplicate delegation rejected for this workspace", flush=True)
            return 73
        except OSError:
            print("[delegate-cursor] workspace lock unavailable or unsafe; Cursor was not started", flush=True)
            return 73
        print(f"[delegate-cursor] started_at: {self.started_at}", flush=True)
        print(f"[delegate-cursor] route: {self.args.route}", flush=True)
        print(f"[delegate-cursor] tier/model: {self.args.tier}/{self.args.model}", flush=True)
        old_handlers = {sig: signal.signal(sig, _signal_handler) for sig in (signal.SIGINT, signal.SIGTERM)}
        selector: selectors.BaseSelector | None = None
        try:
            self._child = self._start_child()
            assert self._child.stdout is not None and self._child.stderr is not None
            selector = selectors.DefaultSelector()
            selector.register(self._child.stdout, selectors.EVENT_READ, "stdout")
            selector.register(self._child.stderr, selectors.EVENT_READ, "stderr")
            next_heartbeat = time.monotonic() + HEARTBEAT_SECONDS
            while selector.get_map() or self._child.poll() is None:
                if interrupted_signal is not None and self.received_signal is None:
                    self.received_signal = interrupted_signal
                    try:
                        os.killpg(self._child.pid, self.received_signal)
                    except ProcessLookupError:
                        pass
                    print(
                        f"[delegate-cursor] interruption requested: signal {self.received_signal}",
                        flush=True,
                    )
                    interrupted_signal = None
                now = time.monotonic()
                for key, _ in selector.select(timeout=min(1.0, max(0.0, next_heartbeat - now))):
                    stream = key.fileobj
                    chunk = os.read(stream.fileno(), 8192)
                    if not chunk:
                        selector.unregister(stream)
                        stream.close()
                        continue
                    if key.data == "stdout":
                        self.stdout_bytes += len(chunk)
                        self._feed_stdout(chunk)
                    else:
                        self.stderr_bytes += len(chunk)
                        self._feed_stderr(chunk)
                now = time.monotonic()
                if now >= next_heartbeat and self._child.poll() is None:
                    idle = int(now - self.last_event_mono)
                    operation = self.last_operation or "なし"
                    self._print_progress(
                        f"[delegate-cursor] 稼働中、最終操作: {operation}、{idle}秒無出力"
                        f"、assistant_updates={self.assistant_updates}"
                    )
                    next_heartbeat = now + HEARTBEAT_SECONDS
                if self._child.poll() is not None and not selector.get_map():
                    break
            for raw_line in self.stdout_lines.finish():
                self._stdout_line(raw_line)
            self.oversized_lines = self.stdout_lines.oversized_lines
            if self._stderr_buffer:
                self._record_error_line(bytes(self._stderr_buffer))
                self._stderr_buffer.clear()
            exit_code = self._child.wait()
            signal_number = self.received_signal
            outcome = classify_outcome(
                exit_code, self.result_status, self.result_is_error,
                self.error_categories, self.args.workspace_mode, signal_number,
            )
            finished_at = utc_now()
            print(f"[delegate-cursor] finished_at: {finished_at}", flush=True)
            print(f"[delegate-cursor] process_exit_code: {exit_code}", flush=True)
            print(f"[delegate-cursor] result_event_status: {self.result_status}", flush=True)
            print(f"[delegate-cursor] outcome: {outcome}", flush=True)
            print(f"[delegate-cursor] stderr_bytes_read: {self.stderr_bytes}", flush=True)
            if self.error_categories:
                categories = ",".join(f"{k}={v}" for k, v in sorted(self.error_categories.items()))
                print(f"[delegate-cursor] stderr_categories: {categories}", flush=True)
            if self.error_categories.get("mcp_approval_required", 0):
                print(
                    "[delegate-cursor] MCP approval is missing. Review and run "
                    "`agent mcp enable playwright` from the price-memo repository, "
                    "then retry the delegation. No MCP was enabled automatically.",
                    flush=True,
                )
            print(f"[delegate-cursor] malformed_stream_lines: {self.malformed_lines}", flush=True)
            print(f"[delegate-cursor] oversized_stream_lines: {self.oversized_lines}", flush=True)
            self._flush_assistant_summary()
            print(f"[delegate-cursor] progress_lines_suppressed: {self.suppressed_progress}", flush=True)
            if outcome != "success":
                record = {
                    "schema": 1,
                    "started_at": self.started_at,
                    "finished_at": finished_at,
                    "route": self.args.route,
                    "tier": self.args.tier,
                    "model": self.args.model,
                    "process_exit_code": exit_code,
                    "result_status": self.result_status,
                    "result_is_error": self.result_is_error,
                    "outcome": outcome,
                    "last_event_type": self.last_event_type,
                    "last_event_subtype": self.last_event_subtype,
                    "last_operation": self.last_operation,
                    "stderr_categories": dict(self.error_categories),
                    "stderr_bytes_read": self.stderr_bytes,
                    "stdout_bytes_read": self.stdout_bytes,
                    "malformed_stream_lines": self.malformed_lines,
                    "oversized_stream_lines": self.oversized_lines,
                }
                if save_failure_record(record):
                    print("[delegate-cursor] failure metadata saved in restricted state storage", flush=True)
                else:
                    print("[delegate-cursor] failure metadata not saved (state storage unavailable or unsafe)", flush=True)
            emit_report(self.result_text, self.result_truncated)
            if signal_number is not None:
                return 128 + signal_number
            if outcome == "success":
                return 0
            return exit_code if exit_code > 0 else (128 + abs(exit_code) if exit_code < 0 else 1)
        finally:
            if selector is not None:
                selector.close()
            for sig, handler in old_handlers.items():
                signal.signal(sig, handler)
            if self._workspace_lock_fd is not None:
                os.close(self._workspace_lock_fd)
                self._workspace_lock_fd = None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkout", required=True)
    parser.add_argument("--route", required=True, choices={"cursor", "other-models", "other-models-reserve"})
    parser.add_argument("--tier", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--workspace-mode", action="store_true")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    global interrupted_signal
    interrupted_signal = None
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        print("[delegate-cursor] missing Cursor command", file=sys.stderr)
        return 2
    try:
        return StreamMonitor(args, command).run()
    except OSError:
        return 127


if __name__ == "__main__":
    raise SystemExit(main())
