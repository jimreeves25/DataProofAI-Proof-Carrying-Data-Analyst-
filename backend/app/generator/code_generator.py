"""
code_generator.py — LLM-powered Python code generator for data analysis.

Receives:
  - User question
  - DataProfile
  - AnalysisPlan

Produces:
  - GeneratedCode (code + metadata)

The generated code is always validated by code_safety.py before execution.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List

from app.llm.llm_client import llm_client
from app.models.schemas import AnalysisPlan, DataProfile, FileProfile, GeneratedCode

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a deterministic Python data analysis code generator.

Your ONLY job is to write clean, executable Python code that answers the user's
question using the provided datasets.

RULES — YOU MUST FOLLOW ALL OF THEM:
1. Use only: pandas, numpy, scipy, scikit-learn (if needed).
2. Load datasets using pd.read_csv / pd.read_excel / pd.read_json / pd.read_parquet
   with the EXACT filenames provided — no path prefixes.
3. ALWAYS print() the final numeric or string answer on the LAST line.
4. The final printed value must be the direct answer (not a DataFrame, not a plot).
5. Handle missing values explicitly (dropna, fillna, or flag them).
6. Handle duplicates explicitly if the DataProfile warns about them.
7. Do NOT import: os, subprocess, socket, requests, urllib, shutil, sys, or any
   networking/filesystem library.
8. Do NOT use: eval, exec, __import__, open(), shell commands, or pip install.
9. Do NOT generate random data — only use the provided datasets.
10. Make the code REPRODUCIBLE (no random seeds, no time-dependent logic unless
    the question explicitly asks for it).
11. Add brief inline comments explaining each step.
12. If currency/unit columns are present and units are unknown, add a comment
    flagging this and still compute based on available data.

Return ONLY a JSON object with these fields:
{
  "code": "<complete Python code as a string>",
  "expected_output_type": "<one of: number, string, table, percentage, boolean>",
  "calculation_description": "<one sentence describing what the code calculates>",
  "datasets_used": ["<filename1>", ...]
}
"""


def _build_profile_summary(profile: DataProfile) -> str:
    """Convert DataProfile into a concise text description for the LLM prompt."""
    lines: List[str] = []
    for fp in profile.files:
        lines.append(f"\n--- File: {fp.filename} ({fp.format}) ---")
        lines.append(f"  Rows: {fp.rows}, Columns: {fp.columns}")
        lines.append(f"  Columns: {fp.column_names}")
        for cp in fp.column_profiles:
            notes = []
            if cp.missing_count > 0:
                notes.append(f"missing={cp.missing_count}")
            if cp.is_date_like:
                notes.append("date-like")
            if cp.is_currency_like:
                notes.append("currency-like")
            note_str = f" [{', '.join(notes)}]" if notes else ""
            lines.append(f"    {cp.name} ({cp.dtype}){note_str}")
        if fp.duplicate_rows > 0:
            lines.append(f"  ⚠ {fp.duplicate_rows} duplicate rows")
        for w in fp.warnings:
            lines.append(f"  ⚠ {w}")
    if profile.global_warnings:
        lines.append("\nGlobal warnings:")
        for w in profile.global_warnings:
            lines.append(f"  ⚠ {w}")
    if profile.cross_file_relationships:
        lines.append("\nDetected relationships:")
        for r in profile.cross_file_relationships:
            lines.append(f"  • {r}")
    return "\n".join(lines)


def _generate_heuristic_code(
    question: str,
    profile: DataProfile,
    plan: AnalysisPlan,
) -> GeneratedCode:
    """Generate clean deterministic Python code matching the plan."""
    file_map = {fp.filename: fp for fp in profile.files}
    q_lower = question.lower()

    # Multi-dataset join case (e.g. sales + expenses)
    if len(plan.datasets) >= 2 and "sales.csv" in plan.datasets and "expenses.csv" in plan.datasets:
        code = (
            "import pandas as pd\n\n"
            "# Load datasets\n"
            "sales = pd.read_csv('sales.csv')\n"
            "expenses = pd.read_csv('expenses.csv')\n\n"
            "# Aggregate by product\n"
            "s_grp = sales.groupby('product')['revenue_usd'].sum().reset_index()\n"
            "e_grp = expenses.groupby('product')['expense_usd'].sum().reset_index()\n\n"
            "# Join and calculate profit\n"
            "df = pd.merge(s_grp, e_grp, on='product')\n"
            "df['profit'] = df['revenue_usd'] - df['expense_usd']\n"
            "best = df.sort_values(by='profit', ascending=False).iloc[0]\n"
            "print(f\"{best['product']} with profit {round(best['profit'], 2)}\")\n"
        )
        return GeneratedCode(
            code=code,
            expected_output_type="string",
            calculation_description="Join sales and expenses on product to calculate profit by product",
            datasets_used=["sales.csv", "expenses.csv"],
        )

    # Single dataset case
    fname = plan.datasets[0] if plan.datasets else profile.files[0].filename
    fp = file_map.get(fname, profile.files[0])
    target_col = plan.required_columns[0] if plan.required_columns else (
        "revenue_usd" if "revenue_usd" in fp.column_names else fp.column_names[-1]
    )

    is_avg = any("mean" in op.lower() or "average" in op.lower() for op in plan.operations) or any(w in q_lower for w in ("average", "mean", "avg"))
    has_dupes = fp.duplicate_rows > 0 or any("deduplicate" in op.lower() for op in plan.operations)

    code_lines = [
        "import pandas as pd",
        f"df = pd.read_csv('{fname}')",
    ]
    if has_dupes:
        code_lines.append("# Deduplicate rows")
        code_lines.append("df = df.drop_duplicates()")

    if is_avg:
        code_lines.append(f"result = round(df['{target_col}'].mean(), 2)")
        code_lines.append("print(result)")
        desc = f"Calculate average of {target_col} from {fname}"
    else:
        code_lines.append(f"result = round(df['{target_col}'].sum(), 2)")
        code_lines.append("print(result)")
        desc = f"Calculate sum of {target_col} from {fname}"

    return GeneratedCode(
        code="\n".join(code_lines) + "\n",
        expected_output_type="number",
        calculation_description=desc,
        datasets_used=[fname],
    )


def generate_analysis_code(
    question: str,
    profile: DataProfile,
    plan: AnalysisPlan,
    previous_attempt: str | None = None,
    previous_error: str | None = None,
    api_key: str | None = None,
) -> GeneratedCode:
    """
    Generate Python analysis code for the given question and plan.

    If previous_attempt and previous_error are provided, the generator
    is told to fix the previous code's mistake (REPLAN mode).
    """
    import os
    has_key = bool(api_key or os.getenv("OPENAI_API_KEY"))

    if has_key:
        profile_summary = _build_profile_summary(profile)
        plan_json = plan.model_dump_json(indent=2)

        user_prompt_parts = [
            f"QUESTION: {question}",
            f"\nDATASET PROFILE:\n{profile_summary}",
            f"\nANALYSIS PLAN:\n{plan_json}",
        ]

        if previous_attempt and previous_error:
            user_prompt_parts.append(
                f"\n\n--- PREVIOUS ATTEMPT FAILED ---\n"
                f"Previous code:\n```python\n{previous_attempt}\n```\n"
                f"Error / verification failure:\n{previous_error}\n"
                f"Please fix the issues and generate improved code."
            )

        user_prompt = "\n".join(user_prompt_parts)

        logger.info("Generating analysis code for question: %s...", question[:80])

        try:
            result = llm_client.generate_structured(
                system_prompt=_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                schema=GeneratedCode,
                api_key=api_key,
            )

            logger.info(
                "Code generated via LLM: expected_output_type=%s, description=%s",
                result.expected_output_type,
                result.calculation_description,
            )
            return result
        except Exception as exc:
            logger.warning("LLM code generation failed: %s — using heuristic generator", exc)

    logger.info("Generating code via heuristic template...")
    return _generate_heuristic_code(question, profile, plan)
