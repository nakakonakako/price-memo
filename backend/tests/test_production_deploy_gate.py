from __future__ import annotations

import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
freshness_spec = importlib.util.spec_from_file_location(
    "assert_latest_deploy_main", ROOT / "scripts/assert_latest_deploy_main.py"
)
assert freshness_spec and freshness_spec.loader
freshness = importlib.util.module_from_spec(freshness_spec)
freshness_spec.loader.exec_module(freshness)


DEPLOY_SHA = "a" * 40
LATEST_SHA = "b" * 40
ACTION_SHA = "c06454f78cc3db27964829fd0e357cbb0d3536f8"


class ProductionDeployGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workflow = (ROOT / ".github/workflows/deploy.yml").read_text()
        cls.preflight = cls.workflow.split("  production-db-preflight:\n", 1)[1].split(
            "\n  build-and-push:", 1
        )[0]
        cls.build = cls.workflow.split("  build-and-push:\n", 1)[1].split(
            "\n  deploy:", 1
        )[0]
        cls.deploy = cls.workflow.split("  deploy:\n", 1)[1]

    def test_workflow_preserves_main_push_and_requires_all_gate_results(self) -> None:
        self.assertIn("  push:\n    branches:\n      - main", self.workflow)
        self.assertNotIn("pull_request:", self.workflow)
        self.assertIn("needs: quality", self.preflight)
        self.assertIn("needs: [quality, production-db-preflight]", self.build)
        self.assertIn("needs.quality.result == 'success'", self.build)
        self.assertIn("needs.production-db-preflight.result == 'success'", self.build)
        self.assertIn(
            "needs: [quality, production-db-preflight, build-and-push]", self.deploy
        )
        for dependency in ("quality", "production-db-preflight", "build-and-push"):
            self.assertIn(f"needs.{dependency}.result == 'success'", self.deploy)
        self.assertNotIn("always()", self.build + self.deploy)
        self.assertNotIn("continue-on-error", self.build + self.deploy)

    def test_reader_action_is_pinned_and_uses_only_price_memo_reader_inputs(
        self,
    ) -> None:
        self.assertIn("environment: production-db-check", self.preflight)
        self.assertIn("permissions:\n      contents: read", self.preflight)
        self.assertIn("runs-on: ubuntu-latest", self.preflight)
        self.assertIn("actions/setup-python@v5", self.preflight)
        self.assertIn('python-version: "3.12"', self.preflight)
        self.assertIn("git postgresql-client", self.preflight)
        self.assertIn("command -v psql", self.preflight)
        self.assertIn(f"consumer-production-db-check@{ACTION_SHA}", self.preflight)
        self.assertIn("app-id: price-memo", self.preflight)
        self.assertIn("app-commit-sha: ${{ github.sha }}", self.preflight)
        for setting in (
            "PROD_SUPABASE_POOLER_HOST",
            "PROD_SUPABASE_PROJECT_REF",
            "MIGRATION_READER_PASSWORD",
        ):
            self.assertIn(setting, self.preflight)
        self.assertIn(
            "migration_preflight_login.${{ vars.PROD_SUPABASE_PROJECT_REF }}",
            self.preflight,
        )
        self.assertNotIn("WRITER", self.preflight.upper())
        self.assertNotIn("SERVICE_ROLE", self.preflight.upper())
        self.assertNotIn(
            "production-db-check", (ROOT / ".github/workflows/ci.yml").read_text()
        )

    def test_deploy_rechecks_current_main_immediately_before_external_deploy(
        self,
    ) -> None:
        self.assertIn("actions/setup-python@v5", self.deploy)
        self.assertIn('python-version: "3.12"', self.deploy)
        freshness_step = "python3 scripts/assert_latest_deploy_main.py"
        self.assertEqual(self.deploy.count(freshness_step), 2)
        first_check = self.deploy.index(freshness_step)
        second_check = self.deploy.index(
            freshness_step, first_check + len(freshness_step)
        )
        self.assertLess(first_check, self.deploy.index("SCP Transfer"))
        self.assertGreater(second_check, self.deploy.index("SCP Transfer"))
        self.assertLess(second_check, self.deploy.index("SSH Deploy"))
        self.assertIn("uses: appleboy/scp-action", self.deploy)
        self.assertIn("uses: appleboy/ssh-action", self.deploy)

    def test_latest_main_freshness_check_passes_only_for_exact_current_sha(
        self,
    ) -> None:
        env = {
            "GITHUB_REPOSITORY": "nakakonakako/price-memo",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_SHA": DEPLOY_SHA,
        }
        expected_command = ["git", "ls-remote", "origin", "refs/heads/main"]
        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(
                freshness.subprocess,
                "run",
                return_value=freshness.subprocess.CompletedProcess(
                    expected_command, 0, f"{DEPLOY_SHA}\trefs/heads/main\n", ""
                ),
            ) as run,
        ):
            self.assertEqual(freshness.main(), 0)
        run.assert_called_once_with(
            expected_command, check=False, capture_output=True, text=True, timeout=15
        )

        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(
                freshness.subprocess,
                "run",
                return_value=freshness.subprocess.CompletedProcess(
                    expected_command, 0, f"{LATEST_SHA}\trefs/heads/main\n", ""
                ),
            ),
        ):
            self.assertEqual(freshness.main(), 1)

    def test_latest_main_lookup_failure_or_wrong_context_fails_closed(self) -> None:
        env = {
            "GITHUB_REPOSITORY": "nakakonakako/price-memo",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_SHA": DEPLOY_SHA,
        }
        command = ["git", "ls-remote", "origin", "refs/heads/main"]
        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(
                freshness.subprocess,
                "run",
                return_value=freshness.subprocess.CompletedProcess(
                    command, 128, "", "network or auth details"
                ),
            ),
        ):
            self.assertEqual(freshness.main(), 2)
        bad_env = {**env, "GITHUB_REF": "refs/pull/7/merge"}
        with (
            patch.dict(os.environ, bad_env, clear=True),
            patch.object(freshness.subprocess, "run") as run,
        ):
            self.assertEqual(freshness.main(), 2)
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
