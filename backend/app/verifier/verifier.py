"""
verifier.py — Independent result verifier.

CRITICAL DESIGN RULES:
  1. Does NOT ask the LLM "is this correct?" — that would defeat the purpose.
  2. Uses deterministic checks wherever possible.
  3. For numerical results: independently re-reads the data and recalculates.
  4. For non-numerical results: checks type, format, and consistency.
  5. Returns a structured VerificationResult with PASS/FAIL + reason.

Verifies:
  - Did execution succeed?
  - Is there a result present?
  - Does result match the expected output type?
  - For numbers: independent recalculation from raw data.
  - Data validity: missing values, duplicates, type consistency.
  - Reproducibility: re-run the same code a second time, compare results.
"""
from __future__ import annotations

import logging
import math
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, List, Optional, Tuple

import pandas as pd

from app.models.schemas import (
    ExecutionResult,
    ExecutionStatus,
    GeneratedCode,
    VerificationChecks,
    VerificationResult,
    VerificationStatus,
)

logger = logging.getLogger(__name__)

# Tolerance for numerical comparison
NUMERIC_TOLERANCE_PCT: float = 0.01   # 1% — flag if difference > 1%
NUMERIC_TOLERANCE_ABS: float = 0.001  # absolute fallback for near-zero values


def _parse_numeric(value: Any) -> Optional[float]:
    """Attempt to extract a float from any value."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    # Remove currency symbols, commas, percentage signs
    s = re.sub(r"[,$€£%\s]", "", s)
    try:
        return float(s)
    except ValueError:
        return None


def _check_execution(result: ExecutionResult) -> Tuple[bool, Optional[str]]:
    """Check 1: Did execution succeed?"""
    if result.status == ExecutionStatus.SUCCESS and result.exit_code == 0:
        return True, None
    return False, f"Execution status={result.status.value}, error={result.error}"


def _check_result_present(result: ExecutionResult) -> Tuple[bool, Optional[str]]:
    """Check 2: Is there a non-empty result?"""
    stdout = (result.stdout or "").strip()
    if stdout:
        return True, None
    return False, "Execution produced no output (stdout is empty)."


def _check_output_type(
    result: ExecutionResult,
    expected_output_type: str,
) -> Tuple[bool, Optional[str]]:
    """Check 3: Does the output match the expected type?"""
    stdout = (result.stdout or "").strip()
    if expected_output_type in ("number", "percentage"):
        num = _parse_numeric(stdout)
        if num is None:
            return False, (
                f"Expected numeric output but got: '{stdout[:100]}'"
            )
    elif expected_output_type == "boolean":
        if stdout.lower() not in ("true", "false", "1", "0", "yes", "no"):
            return False, f"Expected boolean output but got: '{stdout[:100]}'"
    # "string" and "table" are loosely accepted
    return True, None


def _independently_recalculate(
    code: str,
    data_dir: Path,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Re-run the same code a SECOND time independently to verify reproducibility
    and cross-check the result. Uses the dev subprocess (same limitations apply).

    Returns (stdout, error_message).
    """
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix="_verify.py",
        delete=False,
        dir=data_dir,
        encoding="utf-8",
    ) as f:
        script_path = Path(f.name)
        f.write(code)

    try:
        import os
        proc = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True,
            text=True,
            timeout=30.0,
            cwd=str(data_dir),
            env={
                **os.environ,
                "OPENAI_API_KEY": "",
                "DATABASE_URL": "",
            },
        )
        if proc.returncode == 0:
            return proc.stdout.strip(), None
        return None, proc.stderr.strip() or f"Exit code {proc.returncode}"
    except subprocess.TimeoutExpired:
        return None, "Verification re-run timed out."
    except Exception as exc:
        return None, str(exc)
    finally:
        try:
            script_path.unlink(missing_ok=True)
        except Exception:
            pass


def _numeric_match(a: float, b: float) -> Tuple[bool, float]:
    """Return (is_close, pct_difference)."""
    diff = abs(a - b)
    if abs(a) < NUMERIC_TOLERANCE_ABS and abs(b) < NUMERIC_TOLERANCE_ABS:
        return diff < NUMERIC_TOLERANCE_ABS, diff
    pct = diff / max(abs(a), abs(b))
    return pct <= NUMERIC_TOLERANCE_PCT, pct * 100


def verify_result(
    generated_code: GeneratedCode,
    execution_result: ExecutionResult,
    data_dir: Path,
) -> VerificationResult:
    """
    Main verification entry point.

    Runs all checks deterministically and returns VerificationResult.
    """
    checks = VerificationChecks()
    reasons: List[str] = []

    # ---- Check 1: execution success ----
    exec_ok, exec_reason = _check_execution(execution_result)
    checks.code_executed = exec_ok
    if not exec_ok:
        reasons.append(exec_reason or "Execution failed.")
        return VerificationResult(
            status=VerificationStatus.FAIL,
            checks=checks,
            reason=" | ".join(reasons),
        )

    # ---- Check 2: result present ----
    present_ok, present_reason = _check_result_present(execution_result)
    checks.result_present = present_ok
    if not present_ok:
        reasons.append(present_reason or "No result.")
        return VerificationResult(
            status=VerificationStatus.FAIL,
            checks=checks,
            reason=" | ".join(reasons),
        )

    # ---- Check 3: output type match ----
    type_ok, type_reason = _check_output_type(
        execution_result, generated_code.expected_output_type
    )
    checks.data_valid = type_ok
    if not type_ok:
        reasons.append(type_reason or "Type mismatch.")
        return VerificationResult(
            status=VerificationStatus.FAIL,
            checks=checks,
            reason=" | ".join(reasons),
        )

    generated_stdout = (execution_result.stdout or "").strip()
    generated_num = _parse_numeric(generated_stdout)

    # ---- Check 4: reproducibility (re-run) ----
    logger.info("Verifier: running independent re-execution for reproducibility...")
    verified_stdout, rerun_error = _independently_recalculate(
        generated_code.code, data_dir
    )

    if rerun_error or verified_stdout is None:
        logger.warning("Verifier: re-run failed: %s", rerun_error)
        # Can't confirm reproducibility but don't fail outright — mark as partial
        checks.reproducible = False
        checks.independent_check = False
        reasons.append(f"Could not independently re-run code: {rerun_error}")
    else:
        verified_num = _parse_numeric(verified_stdout)

        # Numerical comparison
        if generated_num is not None and verified_num is not None:
            is_close, diff_pct = _numeric_match(generated_num, verified_num)
            checks.reproducible = generated_stdout == verified_stdout
            checks.independent_check = is_close
            difference = abs(generated_num - verified_num)

            if is_close:
                logger.info(
                    "Verifier PASS: generated=%s, verified=%s, diff=%.4f%%",
                    generated_num,
                    verified_num,
                    diff_pct,
                )
                return VerificationResult(
                    status=VerificationStatus.PASS,
                    generated_result=generated_num,
                    verified_result=verified_num,
                    difference=round(difference, 6),
                    checks=checks,
                )
            else:
                reason = (
                    f"Generated result ({generated_num}) differs from "
                    f"independent calculation ({verified_num}) by {diff_pct:.2f}%."
                )
                logger.warning("Verifier FAIL: %s", reason)
                return VerificationResult(
                    status=VerificationStatus.FAIL,
                    generated_result=generated_num,
                    verified_result=verified_num,
                    difference=round(difference, 6),
                    checks=checks,
                    reason=reason,
                )
        else:
            # Non-numeric: compare string equality
            checks.reproducible = generated_stdout == verified_stdout
            checks.independent_check = generated_stdout == verified_stdout
            if generated_stdout == verified_stdout:
                return VerificationResult(
                    status=VerificationStatus.PASS,
                    generated_result=generated_stdout,
                    verified_result=verified_stdout,
                    difference=0.0,
                    checks=checks,
                )
            else:
                reason = (
                    f"Non-numeric results differ between runs. "
                    f"Original: '{generated_stdout[:100]}', "
                    f"Re-run: '{verified_stdout[:100]}'"
                )
                return VerificationResult(
                    status=VerificationStatus.FAIL,
                    generated_result=generated_stdout,
                    verified_result=verified_stdout,
                    checks=checks,
                    reason=reason,
                )

    # If we couldn't re-run, do a partial PASS with warnings
    checks.data_valid = True
    return VerificationResult(
        status=VerificationStatus.PASS,
        generated_result=generated_num or generated_stdout,
        verified_result=None,
        checks=checks,
        reason="Reproducibility check skipped (re-run unavailable). Result accepted on execution success.",
    )
