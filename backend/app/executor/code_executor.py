"""
code_executor.py — Controlled Python execution environment.

Architecture:
  Generated Python
       ↓
  Static safety validation (code_safety.py)
       ↓
  Docker sandbox (preferred) OR development subprocess (fallback)
       ↓
  Capture stdout / stderr / exit code / timing
       ↓
  ExecutionResult

IMPORTANT:
  - Docker is the production execution path.
  - The development fallback is CLEARLY MARKED and must never be silently
    treated as equivalent to the secure sandbox.
  - Even the dev fallback runs in a separate subprocess with a timeout.
  - Datasets are made available via a temp directory passed to the subprocess.
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import List, Optional

from app.generator.code_safety import validate_code_safety
from app.models.schemas import ExecutionResult, ExecutionStatus, SafetyCheckResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
EXECUTION_TIMEOUT_SECONDS: float = float(os.getenv("EXECUTION_TIMEOUT_SECONDS", "30.0"))
USE_DOCKER: bool = os.getenv("USE_DOCKER", "false").lower() == "true"
DOCKER_IMAGE: str = os.getenv("DOCKER_IMAGE", "python-sandbox:latest")
DOCKER_MEMORY_LIMIT: str = os.getenv("DOCKER_MEMORY_LIMIT", "256m")
DOCKER_CPU_LIMIT: str = os.getenv("DOCKER_CPU_LIMIT", "0.5")


def _run_in_docker(
    code: str,
    data_dir: Path,
    timeout: float,
) -> ExecutionResult:
    """
    Execute code inside a Docker sandbox container.

    The container:
      - Receives datasets as a read-only mount at /data
      - Runs as non-root
      - Has no network access
      - Has CPU/memory limits
      - Cannot access host .env or project secrets
    """
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", delete=False, dir=data_dir
    ) as f:
        script_path = Path(f.name)
        f.write(code)

    try:
        cmd = [
            "docker", "run",
            "--rm",
            "--network", "none",
            "--memory", DOCKER_MEMORY_LIMIT,
            "--cpus", DOCKER_CPU_LIMIT,
            "--user", "nobody",
            "--read-only",
            "--tmpfs", "/tmp:size=64m",
            "-v", f"{data_dir.resolve()}:/data:ro",
            "-w", "/data",
            DOCKER_IMAGE,
            "python", script_path.name,
        ]
        t0 = time.monotonic()
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        elapsed_ms = (time.monotonic() - t0) * 1000

        if proc.returncode == 0:
            return ExecutionResult(
                status=ExecutionStatus.SUCCESS,
                stdout=proc.stdout.strip(),
                stderr=proc.stderr.strip(),
                exit_code=proc.returncode,
                execution_time_ms=elapsed_ms,
                result_value=proc.stdout.strip(),
            )
        else:
            return ExecutionResult(
                status=ExecutionStatus.FAILED,
                stdout=proc.stdout.strip(),
                stderr=proc.stderr.strip(),
                exit_code=proc.returncode,
                execution_time_ms=elapsed_ms,
                error=proc.stderr.strip() or "Non-zero exit code",
            )
    except subprocess.TimeoutExpired:
        return ExecutionResult(
            status=ExecutionStatus.TIMEOUT,
            error=f"Execution timed out after {timeout}s",
        )
    except Exception as exc:
        return ExecutionResult(
            status=ExecutionStatus.FAILED,
            error=f"Docker execution error: {exc}",
        )
    finally:
        try:
            script_path.unlink(missing_ok=True)
        except Exception:
            pass


def _run_dev_subprocess(
    code: str,
    data_dir: Path,
    timeout: float,
) -> ExecutionResult:
    """
    DEV FALLBACK ONLY — runs code in a subprocess on the host machine.

    ⚠ WARNING: This is NOT a secure sandbox.
    Only use for development and testing with trusted/generated code that has
    already passed the static safety validator.
    Never use in production without Docker.
    """
    logger.warning(
        "⚠ DEV FALLBACK: Executing code on host machine (NOT Docker sandbox). "
        "This is NOT secure for production."
    )

    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".py",
        delete=False,
        dir=data_dir,
        encoding="utf-8",
    ) as f:
        script_path = Path(f.name)
        f.write(code)

    try:
        t0 = time.monotonic()
        proc = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(data_dir),
            env={
                **os.environ,
                # Strip any secrets from the subprocess environment
                "OPENAI_API_KEY": "",
                "DATABASE_URL": "",
            },
        )
        elapsed_ms = (time.monotonic() - t0) * 1000

        if proc.returncode == 0:
            return ExecutionResult(
                status=ExecutionStatus.SUCCESS,
                stdout=proc.stdout.strip(),
                stderr=proc.stderr.strip(),
                exit_code=proc.returncode,
                execution_time_ms=elapsed_ms,
                result_value=proc.stdout.strip(),
            )
        else:
            return ExecutionResult(
                status=ExecutionStatus.FAILED,
                stdout=proc.stdout.strip(),
                stderr=proc.stderr.strip(),
                exit_code=proc.returncode,
                execution_time_ms=elapsed_ms,
                error=proc.stderr.strip() or f"Exit code {proc.returncode}",
            )

    except subprocess.TimeoutExpired:
        return ExecutionResult(
            status=ExecutionStatus.TIMEOUT,
            error=f"Execution timed out after {timeout}s",
        )
    except Exception as exc:
        return ExecutionResult(
            status=ExecutionStatus.FAILED,
            error=f"Subprocess execution error: {exc}",
        )
    finally:
        try:
            script_path.unlink(missing_ok=True)
        except Exception:
            pass


def execute_code(
    code: str,
    data_dir: Path,
    timeout: float = EXECUTION_TIMEOUT_SECONDS,
) -> ExecutionResult:
    """
    Main entry point for code execution.

    Steps:
      1. Static safety validation (deterministic — always runs)
      2. Docker sandbox (if USE_DOCKER=true)
      3. Dev subprocess fallback (if USE_DOCKER=false)

    Returns ExecutionResult in all cases.
    """
    # Step 1: Static safety check (always — never skip)
    safety: SafetyCheckResult = validate_code_safety(code)
    if not safety.safe:
        violation_summary = "; ".join(safety.violations[:5])
        logger.error("Code safety check FAILED: %s", violation_summary)
        return ExecutionResult(
            status=ExecutionStatus.UNSAFE,
            error=f"Code safety violations: {violation_summary}",
            exit_code=-1,
        )

    logger.info("Code safety check PASSED. Proceeding to execution.")

    # Step 2: Execute
    if USE_DOCKER:
        logger.info("Executing in Docker sandbox (image=%s)", DOCKER_IMAGE)
        return _run_in_docker(code=code, data_dir=data_dir, timeout=timeout)
    else:
        logger.info("Executing via dev subprocess (Docker disabled).")
        return _run_dev_subprocess(code=code, data_dir=data_dir, timeout=timeout)
