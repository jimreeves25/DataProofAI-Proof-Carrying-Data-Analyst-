"""
analysis_service.py — Orchestrates the full PS08 proof-carrying pipeline.

Pipeline:
  1. Data Inspector  → DataProfile
  2. AI Agent        → AnalysisPlan  (or refusal)
  3. Code Generator  → GeneratedCode
  4. Safety Validator
  5. Code Executor   → ExecutionResult
  6. Verifier        → VerificationResult
  7. PASS → ProofPackage → AnalysisResponse
     FAIL → REPLAN (back to step 2, max MAX_REPLAN_ATTEMPTS times)

Every layer emits pipeline events for the frontend progress view.
"""
from __future__ import annotations

import logging
import shutil
import tempfile
from pathlib import Path
from typing import List, Optional, Tuple

from app.agents.analyst_agent import plan_analysis
from app.executor.code_executor import execute_code
from app.generator.code_generator import generate_analysis_code
from app.generator.code_safety import validate_code_safety
from app.inspector.data_inspector import inspect_datasets
from app.llm.llm_config import MAX_REPLAN_ATTEMPTS
from app.models.schemas import (
    AnalysisResponse,
    AnalysisStatus,
    AnalysisPlan,
    AttemptRecord,
    ExecutionStatus,
    ProofEvidence,
    ProofPackage,
    VerificationStatus,
)
from app.verifier.verifier import verify_result

logger = logging.getLogger(__name__)


def _format_answer(result_value: str, plan: AnalysisPlan) -> str:
    """Format the raw execution output as a human-readable answer."""
    if result_value:
        ops = ", ".join(plan.operations[:2]) if plan.operations else "calculation"
        return f"{result_value} (from {ops})"
    return result_value or "Result computed successfully."


def run_analysis(
    question: str,
    uploaded_file_paths: List[Path],
    api_key: Optional[str] = None,
) -> AnalysisResponse:
    """
    Main entry point: run the full proof-carrying analysis pipeline.

    Args:
        question: The user's natural-language question.
        uploaded_file_paths: Paths to the uploaded dataset files.
        api_key: Optional OpenAI API key override.

    Returns:
        AnalysisResponse with status, answer, proof, and pipeline events.
    """
    events: List[str] = []
    attempts: List[AttemptRecord] = []

    # Create a temporary working directory with copies of the data files
    # so the executor has a safe, isolated data directory
    work_dir = Path(tempfile.mkdtemp(prefix="pcda_"))
    try:
        # Copy uploaded files to work dir
        for src in uploaded_file_paths:
            shutil.copy2(src, work_dir / src.name)

        data_files = [work_dir / p.name for p in uploaded_file_paths]

        # ------------------------------------------------------------------ 1
        events.append("DATA_INSPECTION_STARTED")
        logger.info("=== DATA INSPECTION ===")
        try:
            profile = inspect_datasets(data_files)
        except Exception as exc:
            logger.error("Data inspection failed: %s", exc)
            return AnalysisResponse(
                status=AnalysisStatus.ERROR,
                reason=f"Failed to inspect datasets: {exc}",
                pipeline_events=events + ["DATA_INSPECTION_FAILED"],
            )
        events.append("DATA_INSPECTION_COMPLETE")

        # ------------------------------------------------------------------ 2 → LOOP
        previous_plan: Optional[AnalysisPlan] = None
        previous_code: Optional[str] = None
        previous_exec_output: Optional[str] = None
        previous_failure: Optional[str] = None

        for attempt_num in range(1, MAX_REPLAN_ATTEMPTS + 2):  # +1 for initial
            logger.info("=== ATTEMPT %d/%d ===", attempt_num, MAX_REPLAN_ATTEMPTS + 1)

            if attempt_num > 1:
                events.append(f"REPLAN_STARTED (attempt {attempt_num})")

            # ---- 2. AI Agent: plan ----
            events.append("PLANNING_ANALYSIS")
            try:
                plan = plan_analysis(
                    question=question,
                    profile=profile,
                    previous_plan=previous_plan,
                    previous_code=previous_code,
                    previous_execution_output=previous_exec_output,
                    previous_failure_reason=previous_failure,
                    api_key=api_key,
                )
            except Exception as exc:
                logger.error("Agent planning failed: %s", exc)
                events.append("PLANNING_FAILED")
                return AnalysisResponse(
                    status=AnalysisStatus.ERROR,
                    reason=f"Analysis planning error: {exc}",
                    proof=ProofPackage(
                        question=question,
                        status=AnalysisStatus.ERROR,
                        attempts=attempts,
                    ),
                    pipeline_events=events,
                    attempts=attempt_num,
                )

            events.append("PLAN_CREATED")

            # ---- Refusal check ----
            if not plan.answerable:
                logger.info("Agent REFUSED: %s", plan.reason)
                events.append("ANALYSIS_REFUSED")
                record = AttemptRecord(
                    attempt_number=attempt_num,
                    plan=plan,
                    replan_reason=plan.reason,
                )
                attempts.append(record)
                return AnalysisResponse(
                    status=AnalysisStatus.UNANSWERABLE,
                    answer=None,
                    reason=plan.reason,
                    proof=ProofPackage(
                        question=question,
                        status=AnalysisStatus.UNANSWERABLE,
                        refusal_reason=plan.reason,
                        attempts=attempts,
                    ),
                    pipeline_events=events,
                    attempts=attempt_num,
                )

            # ---- 3. Code Generator ----
            events.append("CODE_GENERATION_STARTED")
            try:
                generated = generate_analysis_code(
                    question=question,
                    profile=profile,
                    plan=plan,
                    previous_attempt=previous_code,
                    previous_error=previous_failure,
                    api_key=api_key,
                )
            except Exception as exc:
                logger.error("Code generation failed: %s", exc)
                events.append("CODE_GENERATION_FAILED")
                previous_failure = f"Code generation error: {exc}"
                previous_plan = plan
                if attempt_num > MAX_REPLAN_ATTEMPTS:
                    break
                continue
            events.append("CODE_GENERATED")

            # ---- 4. Safety Validator ----
            events.append("CODE_SAFETY_CHECK")
            safety = validate_code_safety(generated.code)
            if not safety.safe:
                violation_str = "; ".join(safety.violations)
                logger.warning("Code UNSAFE: %s", violation_str)
                events.append("CODE_SAFETY_FAILED")
                previous_failure = f"Generated code failed safety check: {violation_str}"
                previous_plan = plan
                previous_code = generated.code
                record = AttemptRecord(
                    attempt_number=attempt_num,
                    plan=plan,
                    generated_code=generated.code,
                    replan_reason=previous_failure,
                )
                attempts.append(record)
                if attempt_num > MAX_REPLAN_ATTEMPTS:
                    break
                continue
            events.append("CODE_SAFETY_PASSED")

            # ---- 5. Code Executor ----
            events.append("CODE_EXECUTION_STARTED")
            exec_result = execute_code(
                code=generated.code,
                data_dir=work_dir,
            )
            events.append("CODE_EXECUTED")
            logger.info(
                "Execution status=%s, stdout=%s",
                exec_result.status,
                (exec_result.stdout or "")[:100],
            )

            if exec_result.status not in (ExecutionStatus.SUCCESS,):
                previous_failure = f"Code execution failed: {exec_result.error or exec_result.stderr}"
                previous_plan = plan
                previous_code = generated.code
                previous_exec_output = f"stdout:{exec_result.stdout}\nstderr:{exec_result.stderr}"
                record = AttemptRecord(
                    attempt_number=attempt_num,
                    plan=plan,
                    generated_code=generated.code,
                    execution=exec_result,
                    replan_reason=previous_failure,
                )
                attempts.append(record)
                events.append("CODE_EXECUTION_FAILED")
                if attempt_num > MAX_REPLAN_ATTEMPTS:
                    break
                continue

            # ---- 6. Verifier ----
            events.append("VERIFICATION_STARTED")
            verification = verify_result(
                generated_code=generated,
                execution_result=exec_result,
                data_dir=work_dir,
            )
            logger.info("Verification status=%s", verification.status)

            record = AttemptRecord(
                attempt_number=attempt_num,
                plan=plan,
                generated_code=generated.code,
                execution=exec_result,
                verification=verification,
            )
            attempts.append(record)

            if verification.status == VerificationStatus.PASS:
                events.append("VERIFICATION_PASSED")
                events.append("ANSWER_GENERATED")

                result_str = str(exec_result.stdout or "").strip()
                answer = _format_answer(result_str, plan)

                proof = ProofPackage(
                    question=question,
                    answer=answer,
                    status=AnalysisStatus.VERIFIED,
                    datasets_used=plan.datasets,
                    calculation_code=generated.code,
                    execution=exec_result,
                    verification=verification,
                    evidence=ProofEvidence(
                        columns=plan.required_columns,
                        filters=[op for op in plan.operations if "filter" in op.lower()],
                        datasets_used=plan.datasets,
                    ),
                    attempts=attempts,
                )
                return AnalysisResponse(
                    status=AnalysisStatus.VERIFIED,
                    answer=answer,
                    proof=proof,
                    attempts=attempt_num,
                    pipeline_events=events,
                )
            else:
                events.append("VERIFICATION_FAILED")
                previous_failure = verification.reason
                previous_plan = plan
                previous_code = generated.code
                previous_exec_output = exec_result.stdout
                if attempt_num > MAX_REPLAN_ATTEMPTS:
                    break

        # ---- Max attempts reached ----
        logger.error("Max replan attempts (%d) reached.", MAX_REPLAN_ATTEMPTS)
        events.append("MAX_ATTEMPTS_REACHED")
        return AnalysisResponse(
            status=AnalysisStatus.FAILED,
            answer=None,
            reason=(
                f"Analysis failed after {MAX_REPLAN_ATTEMPTS + 1} attempts. "
                f"Last failure: {previous_failure}"
            ),
            proof=ProofPackage(
                question=question,
                status=AnalysisStatus.FAILED,
                refusal_reason=previous_failure,
                attempts=attempts,
            ),
            pipeline_events=events,
            attempts=MAX_REPLAN_ATTEMPTS + 1,
        )

    finally:
        # Clean up temporary work directory
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except Exception:
            pass
