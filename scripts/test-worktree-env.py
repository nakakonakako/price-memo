#!/usr/bin/env python3
"""Fixture tests for worktree dotenv link validation and setup ordering."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts/worktree-env-validate.py"
WORKTREE = ROOT / "scripts/worktree.sh"


class WorktreeEnvironmentValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="worktree-env-test-")
        self.base = Path(self.temp.name)
        self.home = self.base / "home"
        self.home.mkdir()
        self.workspace = self.base / "price-memo"
        self.workspace.mkdir()
        (self.workspace / "scripts").mkdir()
        shutil.copy2(WORKTREE, self.workspace / "scripts/worktree.sh")
        shutil.copy2(VALIDATOR, self.workspace / "scripts/worktree-env-validate.py")
        (self.workspace / "frontend").mkdir()
        (self.workspace / "backend/app").mkdir(parents=True)
        (self.workspace / "README.md").write_text("fixture baseline\n", encoding="utf-8")
        subprocess.run(["git", "init", "-q", str(self.workspace)], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "config", "user.name", "Fixture"], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "config", "user.email", "fixture@example.invalid"], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "add", "scripts", "README.md"], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "commit", "-qm", "fixture"], check=True)
        self.config = self.home / ".config/price-memo/development"
        self.config.mkdir(parents=True)
        self.env = self.config / "frontend/.env"
        self.env.parent.mkdir()
        self.env.write_text("NEVER_PRINT_THIS_FIXTURE_SECRET=1\n", encoding="utf-8")
        self.environment = {**os.environ, "HOME": str(self.home)}

    def tearDown(self) -> None:
        self.temp.cleanup()

    def validate(self, mode: str, expected: bool = True) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            [
                "python3",
                str(VALIDATOR),
                mode,
                str(self.workspace),
                "--environment",
                "development",
                "--repository",
                "price-memo",
            ],
            env=self.environment,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode == 0, expected, result.stderr)
        if not expected:
            self.assertEqual(result.returncode, 2, result.stderr)
        self.assertNotIn("NEVER_PRINT_THIS_FIXTURE_SECRET", result.stdout + result.stderr)
        return result

    def link(self) -> Path:
        target = self.workspace / "frontend/.env"
        target.symlink_to(self.env)
        return target

    def test_normal_development_link(self) -> None:
        self.link()
        self.validate("strict")

    def test_new_worktree_allows_missing_link_before_setup(self) -> None:
        self.validate("pre")
        self.validate("strict", expected=False)

    def test_missing_settings_directory_is_valid_when_no_links_exist(self) -> None:
        shutil.rmtree(self.config)
        self.validate("pre")
        self.validate("strict")

    def test_manual_environment_selection_remains_supported(self) -> None:
        staging = self.home / ".config/price-memo/staging/.env"
        staging.parent.mkdir(parents=True)
        staging.touch()
        result = subprocess.run(
            ["bash", str(self.workspace / "scripts/worktree.sh"), "setup", str(self.workspace), "--environment", "staging", "--env-only"],
            env=self.environment,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(os.readlink(self.workspace / ".env"), str(staging))

    def test_other_environment_link_is_rejected(self) -> None:
        other = self.home / ".config/price-memo/production/frontend/.env"
        other.parent.mkdir(parents=True)
        other.touch()
        (self.workspace / "frontend/.env").symlink_to(other)
        self.validate("pre", expected=False)

    def test_broken_link_is_rejected(self) -> None:
        (self.workspace / "frontend/.env").symlink_to(self.config / "missing.env")
        self.validate("pre", expected=False)

    def test_link_with_missing_source_is_rejected(self) -> None:
        self.link()
        self.env.unlink()
        self.validate("pre", expected=False)

    def test_indirect_absolute_link_is_rejected_even_when_resolve_matches(self) -> None:
        alias = self.base / "environment-alias"
        alias.symlink_to(self.env)
        target = self.workspace / "frontend/.env"
        target.symlink_to(alias)
        self.assertEqual(target.resolve(), self.env.resolve())
        result = self.validate("pre", expected=False)
        self.assertIn("does not directly target", result.stderr)

    def test_relative_link_is_rejected(self) -> None:
        target = self.workspace / "frontend/.env"
        target.symlink_to(os.path.relpath(self.env, target.parent))
        result = self.validate("pre", expected=False)
        self.assertIn("does not directly target", result.stderr)

    def test_settings_directory_symlink_at_each_level_is_rejected(self) -> None:
        for relative in (".config", ".config/price-memo", ".config/price-memo/development"):
            with self.subTest(relative=relative):
                link_path = self.home / relative
                destination = self.base / f"settings-{relative.replace('/', '-')}-real"
                link_path.rename(destination)
                link_path.symlink_to(destination, target_is_directory=True)
                result = self.validate("pre", expected=False)
                self.assertIn("symlink", result.stderr.lower())
                link_path.unlink()
                destination.rename(link_path)

    def test_settings_non_directory_component_is_rejected(self) -> None:
        config_root = self.home / ".config"
        config_root.rename(self.base / "config-directory")
        config_root.write_text("fixture", encoding="utf-8")
        result = self.validate("pre", expected=False)
        self.assertIn("not a directory", result.stderr.lower())

    def test_settings_source_parent_symlink_is_rejected(self) -> None:
        parent = self.config / "frontend"
        destination = self.base / "frontend-settings"
        parent.rename(destination)
        parent.symlink_to(destination, target_is_directory=True)
        result = self.validate("pre", expected=False)
        self.assertIn("symlink", result.stderr.lower())

    def test_dotenv_lookup_directory_symlink_is_rejected(self) -> None:
        for relative in ("frontend", "backend", "backend/app"):
            with self.subTest(relative=relative):
                lookup = self.workspace / relative
                moved = self.base / f"lookup-{relative.replace('/', '-')}-real"
                lookup.rename(moved)
                lookup.symlink_to(moved, target_is_directory=True)
                result = self.validate("pre", expected=False)
                self.assertIn("symlink", result.stderr.lower())
                lookup.unlink()
                moved.rename(lookup)

    def test_dotenv_lookup_non_directory_parent_is_rejected(self) -> None:
        backend = self.workspace / "backend"
        shutil.rmtree(backend)
        backend.write_text("fixture", encoding="utf-8")
        result = self.validate("pre", expected=False)
        self.assertIn("not a directory", result.stderr.lower())

    def test_regular_file_at_managed_path_is_rejected(self) -> None:
        (self.workspace / "frontend/.env").write_text("secret", encoding="utf-8")
        self.validate("pre", expected=False)

    def test_symlinked_environment_source_is_rejected(self) -> None:
        self.env.unlink()
        alias = self.base / "source-alias"
        alias.write_text("fixture secret", encoding="utf-8")
        self.env.symlink_to(alias)
        self.validate("pre", expected=False)

    def test_unexpected_dotenv_paths_are_rejected_in_lookup_directories(self) -> None:
        for directory in (self.workspace, self.workspace / "frontend", self.workspace / "backend", self.workspace / "backend/app"):
            with self.subTest(directory=directory):
                candidate = directory / ".env.extra"
                candidate.touch()
                self.validate("pre", expected=False)
                candidate.unlink()

    def test_receipt_only_services_dotenv_scope_is_not_added(self) -> None:
        services = self.workspace / "backend/app/services"
        services.mkdir()
        (services / ".env.extra").touch()
        self.validate("pre")

    def test_setup_rejects_bad_path_before_npm_or_uv(self) -> None:
        (self.workspace / "package-lock.json").touch()
        (self.workspace / "frontend/package-lock.json").touch()
        (self.workspace / "backend/pyproject.toml").touch()
        bin_dir = self.base / "bin"
        bin_dir.mkdir()
        command_log = self.base / "commands.log"
        for tool in ("npm", "uv"):
            executable = bin_dir / tool
            executable.write_text(f"#!/bin/sh\necho {tool} >> '{command_log}'\n", encoding="utf-8")
            executable.chmod(0o755)
        bad = self.workspace / "frontend/.env"
        bad.write_text("secret", encoding="utf-8")
        result = subprocess.run(
            ["bash", str(self.workspace / "scripts/worktree.sh"), "setup", str(self.workspace)],
            env={**self.environment, "PATH": f"{bin_dir}:{os.environ['PATH']}"},
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(command_log.exists())
        self.assertTrue(bad.is_file())

    def test_setup_preserves_existing_worktree_changes(self) -> None:
        tracked = self.workspace / "README.md"
        tracked.write_text("existing uncommitted change\n", encoding="utf-8")
        untracked = self.workspace / "existing-untracked.txt"
        untracked.write_text("keep me\n", encoding="utf-8")
        result = subprocess.run(
            ["bash", str(self.workspace / "scripts/worktree.sh"), "setup", str(self.workspace), "--env-only"],
            env=self.environment,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(tracked.read_text(encoding="utf-8"), "existing uncommitted change\n")
        self.assertEqual(untracked.read_text(encoding="utf-8"), "keep me\n")


if __name__ == "__main__":
    unittest.main()
