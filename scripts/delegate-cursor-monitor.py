#!/usr/bin/env python3
"""Run Cursor while exposing only bounded, allowlisted progress metadata."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys
import time
import uuid

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
    "shellToolCall": "Shellコマンド", "shell_tool_call": "Shellコマンド",
    "bashToolCall": "Shellコマンド", "bash_tool_call": "Shellコマンド",
    "mcpToolCall": "MCPツール", "mcp_tool_call": "MCPツール",
    "editToolCall": "ファイル作成・編集", "edit_tool_call": "ファイル作成・編集",
    "writeToolCall": "ファイル作成・編集", "write_tool_call": "ファイル作成・編集",
    "deleteToolCall": "ファイル作成・編集", "delete_tool_call": "ファイル作成・編集",
    "readToolCall": "ファイル読み取り", "read_tool_call": "ファイル読み取り",
}

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
interrupted_signal: int | None = None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _signal_handler(signum: int, _frame: object) -> None:
    global interrupted_signal
    interrupted_signal = signum


def safe_event_name(event: object) -> tuple[str, str | None]:
    if not isinstance(event, dict):
        return "unparsed_output", None
    event_type = event.get("type")
    if not isinstance(event_type, str):
        return "unparsed_output", None
    subtype = event.get("subtype")
    return (event_type if event_type in EVENT_TYPES else "other",
            subtype if isinstance(subtype, str) and subtype in EVENT_SUBTYPES else None)


def tool_category(event: dict[str, object]) -> str:
    containers = [event]
    value = event.get("tool_call", event.get("toolCall"))
    if isinstance(value, dict):
        containers.append(value)
    elif isinstance(value, list):
        containers.extend(item for item in value if isinstance(item, dict))
    for container in containers:
        for key, label in TOOL_CATEGORIES.items():
            if key in container:
                return label
    return "その他"


def tool_phase(event: dict[str, object], subtype: str | None) -> str | None:
    if event.get("type") != "tool_call" or subtype == "delta":
        return None
    failed = subtype in {"failed", "error"} or event.get("is_error") is True
    if failed:
        return "failed"
    if subtype in {"start", "started"}:
        return "started"
    if subtype in {"complete", "completed"}:
        return "completed"
    return None


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


def emit_report(value: object, truncated: bool) -> None:
    report = value if isinstance(value, str) else ""
    raw = report.encode("utf-8")
    input_truncated = truncated or len(raw) > MAX_REPORT_INPUT_BYTES
    report = raw[:MAX_REPORT_INPUT_BYTES].decode("utf-8", errors="ignore")
    report = redact_report(report)
    prefix = REPORT_BEGIN + "\n"
    suffix = "\n" + REPORT_END
    if not report.strip():
        body = REPORT_OMITTED
    else:
        body = "[delegate-cursor] report: untrusted free-form text; review the diff\n"
        body += "\n".join(REPORT_PREFIX + line for line in report.splitlines())
    content = prefix + body + suffix
    encoded = content.encode("utf-8")
    if input_truncated or len(encoded) > MAX_REPORT_BYTES:
        budget = MAX_REPORT_BYTES - len((prefix + "\n" + REPORT_TRUNCATED + suffix).encode("utf-8"))
        clipped = encoded[len(prefix.encode("utf-8")):len(prefix.encode("utf-8")) + max(0, budget)]
        body_clip = clipped.decode("utf-8", errors="ignore").rstrip()
        content = prefix + body_clip + "\n" + REPORT_TRUNCATED + suffix
    for line in content.splitlines():
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
        self._stdout_buffer = bytearray()
        self._stdout_discard = False
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

    def _record_error_line(self, raw: bytes) -> None:
        text = raw[:MAX_STDERR_LINE_BYTES].decode("utf-8", errors="ignore").lower()
        for category, pattern in ERROR_PATTERNS.items():
            if pattern.search(text) and len(self.error_categories) < MAX_ERROR_CATEGORIES:
                self.error_categories[category] += 1

    def _stdout_line(self, raw: bytes) -> None:
        if not raw.strip():
            return
        try:
            event = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.malformed_lines += 1
            return
        self.last_event_type, self.last_event_subtype = safe_event_name(event)
        self.last_event_at = utc_now()
        self.last_event_mono = time.monotonic()
        if not isinstance(event, dict):
            return
        if event.get("type") == "assistant":
            self.assistant_updates += 1
            return
        if event.get("type") == "result":
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
            return
        if event.get("type") == "tool_call":
            phase = tool_phase(event, self.last_event_subtype)
            if phase:
                category = tool_category(event)
                self.last_operation = category
                self._print_progress(f"[delegate-cursor] tool: {category} {phase} at {self.last_event_at}")
            return
        if self.last_event_type in {"system", "other", "unparsed_output"}:
            name = self.last_event_type
            subtype = f"/{self.last_event_subtype}" if self.last_event_subtype else ""
            self._print_progress(f"[delegate-cursor] event: {name}{subtype} at {self.last_event_at}")

    def _feed_stdout(self, chunk: bytes) -> None:
        remaining = chunk
        while remaining:
            if self._stdout_discard:
                newline = remaining.find(b"\n")
                if newline < 0:
                    return
                self._stdout_discard = False
                self.oversized_lines += 1
                remaining = remaining[newline + 1:]
                continue
            newline = remaining.find(b"\n")
            if newline >= 0:
                segment = remaining[:newline]
                if len(self._stdout_buffer) + len(segment) > MAX_EVENT_BYTES:
                    self._stdout_buffer.clear()
                    self.oversized_lines += 1
                else:
                    self._stdout_buffer.extend(segment)
                    self._stdout_line(bytes(self._stdout_buffer))
                    self._stdout_buffer.clear()
                remaining = remaining[newline + 1:]
                continue
            if len(self._stdout_buffer) + len(remaining) > MAX_EVENT_BYTES:
                self._stdout_buffer.clear()
                self._stdout_discard = True
            else:
                self._stdout_buffer.extend(remaining)
            break

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
                    self._print_progress(f"[delegate-cursor] interruption requested: signal {self.received_signal}")
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
            if self._stdout_buffer:
                if self._stdout_discard:
                    self.oversized_lines += 1
                else:
                    self._stdout_line(bytes(self._stdout_buffer))
                self._stdout_buffer.clear()
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
            print(f"[delegate-cursor] assistant_updates: {self.assistant_updates}", flush=True)
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
