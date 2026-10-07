"""
analyst_agent.py — AI planning agent for the Proof-Carrying Data Analyst.

The agent's job:
  1. Understand the user question.
  2. Analyse the DataProfile for issues (missing data, units, conflicts).
  3. Decide if the question is ANSWERABLE.
  4. If yes: produce a structured AnalysisPlan.
  5. If no: produce a refusal with reason.
  6. On REPLAN: receive previous failure context and create a new plan.

The agent does NOT:
  - Generate code
  - Execute code
  - Verify results
  - Make final truth decisions (that is the verifier's role)
"""
from __future__ import annotations

import json
import logging
from typing import List, Optional

from app.agents.prompts import ANALYST_SYSTEM_PROMPT, REPLAN_ADDITION
from app.llm.llm_client import llm_client
from app.models.schemas import AnalysisPlan, DataProfile, FileProfile

logger = logging.getLogger(__name__)


def _build_profile_text(profile: DataProfile) -> str:
    """Serialise DataProfile into a readable text for the LLM prompt."""
    lines: List[str] = []
    for fp in profile.files:
        lines.append(f"\nFile: {fp.filename} ({fp.format})")
        lines.append(f"  Rows: {fp.rows}, Columns: {fp.columns}")
        lines.append(f"  Column names: {fp.column_names}")
        for cp in fp.column_profiles:
            flags = []
            if cp.missing_count > 0:
                pct = cp.missing_pct
                flags.append(f"MISSING={cp.missing_count}({pct}%)")
            if cp.is_date_like:
                flags.append("DATE")
            if cp.is_currency_like:
                flags.append("CURRENCY")
            if cp.is_suspicious:
                flags.append(f"SUSPICIOUS:{cp.suspicion_reason}")
            flag_str = " [" + ", ".join(flags) + "]" if flags else ""
            lines.append(f"    - {cp.name} ({cp.dtype}){flag_str}")
        if fp.duplicate_rows > 0:
            lines.append(f"  ⚠ DUPLICATE ROWS: {fp.duplicate_rows}")
        for w in fp.warnings:
            lines.append(f"  ⚠ {w}")

    if profile.global_warnings:
        lines.append("\nGlobal Warnings:")
        for w in profile.global_warnings:
            lines.append(f"  ⚠ {w}")
    if profile.conflicting_columns:
        lines.append("\nConflicting Columns Across Files:")
        for c in profile.conflicting_columns:
            lines.append(f"  ⚠ {c}")
    if profile.cross_file_relationships:
        lines.append("\nDetected Cross-file Relationships:")
        for r in profile.cross_file_relationships:
            lines.append(f"  • {r}")
    return "\n".join(lines)


def _generate_heuristic_plan(
    question: str,
    profile: DataProfile,
) -> Optional[AnalysisPlan]:
    """Fallback heuristic planner when LLM is offline or not configured."""
    q_lower = question.lower()
    file_map = {fp.filename: fp for fp in profile.files}

    # Trap check 1: high missing values (>50%)
    for fp in profile.files:
        for cp in fp.column_profiles:
            if cp.missing_pct > 50.0:
                return AnalysisPlan(
                    answerable=False,
                    reason=(
                        f"Column '{cp.name}' in '{fp.filename}' has {cp.missing_pct}% "
                        f"missing values — insufficient data to answer reliably."
                    ),
                    datasets=[fp.filename],
                    operations=["inspect data quality", "detect missing values"],
                    required_columns=[cp.name],
                )

    # Trap check 2: conflicting columns across datasets
    if profile.conflicting_columns:
        return AnalysisPlan(
            answerable=False,
            reason=(
                f"Conflicting columns detected across files: {', '.join(profile.conflicting_columns)}. "
                f"Cannot determine reliable source without disambiguation."
            ),
            datasets=[fp.filename for fp in profile.files],
            operations=["cross-dataset conflict detection"],
            required_columns=[],
        )

    # Multi-table profit calculation
    if "profit" in q_lower and "expenses.csv" in file_map and "sales.csv" in file_map:
        return AnalysisPlan(
            answerable=True,
            datasets=["sales.csv", "expenses.csv"],
            operations=["merge sales and expenses on product", "calculate profit = revenue - expense", "find highest profit"],
            required_columns=["revenue_usd", "expense_usd", "product"],
        )

    # Use first available file
    fp = profile.files[0]
    fname = fp.filename

    # Collect column info
    num_cols = [
        cp for cp in fp.column_profiles
        if cp.dtype in ("float64", "int64") or cp.numeric_mean is not None
    ]
    str_cols = [cp for cp in fp.column_profiles if cp.dtype == "object"]

    # Detect operation type
    is_avg = any(w in q_lower for w in ("average", "mean", "avg"))
    is_count = any(w in q_lower for w in ("how many", "count", "number of"))
    is_max = any(w in q_lower for w in ("maximum", "highest", "largest", "max", "most", "top"))
    is_min = any(w in q_lower for w in ("minimum", "lowest", "smallest", "min", "least"))
    is_pct = any(w in q_lower for w in ("percent", "percentage", "ratio", "proportion"))

    # Binary/categorical pairs
    BINARY_PAIRS = [
        ("true", "false"), ("yes", "no"), ("pass", "fail"),
        ("passed", "failed"), ("positive", "negative"),
        ("approved", "rejected"), ("valid", "invalid"),
        ("success", "failure"), ("completed", "failed"),
        ("active", "inactive"), ("open", "closed"),
    ]

    filter_col = None
    filter_val = None
    for pos, neg in BINARY_PAIRS:
        if pos in q_lower or neg in q_lower:
            matched = pos if pos in q_lower else neg
            for cp in str_cols:
                sv_lower = [str(v).lower() for v in cp.sample_values]
                if any(matched in sv for sv in sv_lower) or any(
                    pos in sv or neg in sv for sv in sv_lower
                ):
                    filter_col = cp.name
                    filter_val = matched
                    break
        if filter_col:
            break

    # Also check actual sample values
    if not filter_col:
        for cp in str_cols:
            for sv in cp.sample_values:
                sv_str = str(sv).lower()
                if sv_str and sv_str in q_lower and len(sv_str) > 2:
                    filter_col = cp.name
                    filter_val = sv_str
                    break
            if filter_col:
                break

    # Find target numeric column
    target_col = None
    for nc in num_cols:
        if nc.name.lower() in q_lower:
            target_col = nc.name
            break
    if not target_col and num_cols:
        target_col = num_cols[0].name

    # Build operations list
    ops = []
    required = []

    if fp.duplicate_rows > 0:
        ops.append(f"deduplicate {fname}")

    if is_pct and filter_col:
        ops.append(f"calculate percentage where {filter_col} = '{filter_val}'")
        required = [filter_col]
    elif (is_count or not target_col) and filter_col:
        ops.append(f"count rows where {filter_col} = '{filter_val}'")
        required = [filter_col]
    elif is_count:
        ops.append("count total rows")
        required = []
    elif is_avg and target_col:
        ops.append(f"calculate mean of {target_col}")
        required = [target_col]
    elif is_max and target_col:
        ops.append(f"find maximum of {target_col}")
        required = [target_col]
    elif is_min and target_col:
        ops.append(f"find minimum of {target_col}")
        required = [target_col]
    elif target_col:
        ops.append(f"calculate sum of {target_col}")
        required = [target_col]
    else:
        ops.append("count total rows")

    return AnalysisPlan(
        answerable=True,
        datasets=[fname],
        operations=ops,
        required_columns=required,
    )


def plan_analysis(
    question: str,
    profile: DataProfile,
    previous_plan: Optional[AnalysisPlan] = None,
    previous_code: Optional[str] = None,
    previous_execution_output: Optional[str] = None,
    previous_failure_reason: Optional[str] = None,
    api_key: Optional[str] = None,
) -> AnalysisPlan:
    """
    Produce a structured analysis plan via LLM or deterministic fallback.

    In REPLAN mode, passes the failure context so the agent can
    adjust its approach.
    """
    import os
    is_replan = previous_plan is not None

    # Check if OpenAI is available
    has_key = bool(api_key or os.getenv("OPENAI_API_KEY"))

    if has_key:
        system_prompt = ANALYST_SYSTEM_PROMPT
        if is_replan:
            system_prompt += REPLAN_ADDITION

        profile_text = _build_profile_text(profile)

        user_parts = [
            f"QUESTION: {question}",
            f"\nAVAILABLE DATASETS PROFILE:\n{profile_text}",
        ]

        if is_replan:
            user_parts.append(
                f"\n\n--- PREVIOUS FAILED ATTEMPT ---"
                f"\nPrevious plan: {previous_plan.model_dump_json(indent=2)}"
            )
            if previous_code:
                user_parts.append(f"\nPrevious code (abbreviated):\n{previous_code[:1000]}")
            if previous_execution_output:
                user_parts.append(f"\nExecution output:\n{previous_execution_output}")
            if previous_failure_reason:
                user_parts.append(f"\nVerification failure reason: {previous_failure_reason}")
            user_parts.append(
                "\nPlease produce an IMPROVED plan that avoids the previous failure."
            )

        user_prompt = "\n".join(user_parts)

        logger.info(
            "Analyst agent %s analysis plan for: %s...",
            "REPLANNING" if is_replan else "planning",
            question[:80],
        )

        try:
            plan = llm_client.generate_structured(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                schema=AnalysisPlan,
                api_key=api_key,
            )
            logger.info(
                "LLM Plan produced: answerable=%s, datasets=%s, operations=%s",
                plan.answerable,
                plan.datasets,
                plan.operations,
            )
            return _apply_deterministic_refusal_checks(plan, profile, question)
        except Exception as exc:
            logger.warning("LLM planning error: %s — trying fallback heuristic planner", exc)

    # Offline / demo heuristic fallback
    heuristic = _generate_heuristic_plan(question, profile)
    if heuristic:
        logger.info("Heuristic Plan produced: answerable=%s", heuristic.answerable)
        return _apply_deterministic_refusal_checks(heuristic, profile, question)

    return AnalysisPlan(
        answerable=False,
        reason=(
            "OPENAI_API_KEY is not configured and the query cannot be answered by "
            "built-in heuristics. Please configure an OPENAI_API_KEY in .env."
        ),
    )


def _apply_deterministic_refusal_checks(
    plan: AnalysisPlan,
    profile: DataProfile,
    question: str,
) -> AnalysisPlan:
    """
    Apply rule-based refusal logic on top of the LLM's plan.

    This is the deterministic safety net — ensures the LLM cannot accidentally
    mark something as answerable when the data clearly doesn't support it.
    """
    if not plan.answerable:
        return plan  # Already refused

    required_files = plan.datasets
    required_cols = [c.lower() for c in plan.required_columns]

    # Build lookup: filename → FileProfile
    file_map = {fp.filename: fp for fp in profile.files}

    for fname in required_files:
        if fname not in file_map:
            return AnalysisPlan(
                answerable=False,
                reason=f"Required dataset '{fname}' is not available.",
            )
        fp = file_map[fname]

        for col_req in required_cols:
            # Find matching column (case-insensitive)
            matching = [
                cp for cp in fp.column_profiles
                if cp.name.lower() == col_req
            ]
            if matching:
                cp = matching[0]
                # Refuse if > 50% missing
                if cp.missing_pct > 50.0:
                    return AnalysisPlan(
                        answerable=False,
                        reason=(
                            f"Column '{cp.name}' in '{fname}' has "
                            f"{cp.missing_pct}% missing values — "
                            "insufficient data to answer reliably."
                        ),
                    )

    # Check for conflicting columns flagged in global warnings
    if profile.conflicting_columns:
        for col_req in required_cols:
            for conflict in profile.conflicting_columns:
                if col_req in conflict.lower():
                    return AnalysisPlan(
                        answerable=False,
                        reason=(
                            f"Column '{col_req}' has conflicting data across "
                            f"files: {conflict}. Cannot determine reliable source."
                        ),
                    )

    return plan
