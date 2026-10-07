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

    # Detect operation type from question
    is_avg = any(w in q_lower for w in ("average", "mean", "avg"))
    is_count = any(w in q_lower for w in ("how many", "count", "number of"))
    is_max = any(w in q_lower for w in ("maximum", "highest", "largest", "max", "most", "top"))
    is_min = any(w in q_lower for w in ("minimum", "lowest", "smallest", "min", "least"))
    is_pct = any(w in q_lower for w in ("percent", "percentage", "ratio", "proportion", "share"))
    has_dupes = fp.duplicate_rows > 0 or any("deduplicate" in op.lower() for op in plan.operations)

    # Detect all string (categorical) columns and numeric columns
    str_cols = [cp.name for cp in fp.column_profiles if cp.dtype == "object"]
    num_cols = [
        cp.name for cp in fp.column_profiles
        if cp.dtype in ("float64", "int64") or cp.numeric_mean is not None
    ]

    # --- Categorical value detection ---
    # Binary/categorical pairs to look for in the question
    BINARY_PAIRS = [
        ("true", "false"), ("yes", "no"), ("pass", "fail"),
        ("passed", "failed"), ("positive", "negative"),
        ("approved", "rejected"), ("valid", "invalid"),
        ("success", "failure"), ("completed", "failed"),
        ("active", "inactive"), ("open", "closed"),
    ]

    # Check if question mentions a specific categorical value
    filter_col: str | None = None
    filter_val: str | None = None

    for pos, neg in BINARY_PAIRS:
        if pos in q_lower or neg in q_lower:
            matched_word = pos if pos in q_lower else neg
            # Find which string column likely holds this value
            for cp in fp.column_profiles:
                if cp.dtype == "object":
                    sv_lower = [str(v).lower() for v in cp.sample_values]
                    if any(matched_word in sv for sv in sv_lower) or any(
                        pos in sv or neg in sv for sv in sv_lower
                    ):
                        filter_col = cp.name
                        filter_val = matched_word
                        break
            if filter_col:
                break

    # Also check if any actual column value appears in the question
    if not filter_col:
        for cp in fp.column_profiles:
            if cp.dtype == "object":
                for sv in cp.sample_values:
                    sv_str = str(sv).lower()
                    if sv_str and sv_str in q_lower and len(sv_str) > 2:
                        filter_col = cp.name
                        filter_val = sv_str
                        break
            if filter_col:
                break

    # Determine target numeric column
    target_col: str | None = None
    if plan.required_columns:
        for rc in plan.required_columns:
            for cp in fp.column_profiles:
                if cp.name.lower() == rc.lower() and (cp.dtype in ("float64", "int64") or cp.numeric_mean is not None):
                    target_col = cp.name
                    break
            if target_col:
                break
    if not target_col and num_cols:
        # Pick numeric col mentioned in question, else first
        for nc in num_cols:
            if nc.lower() in q_lower:
                target_col = nc
                break
        if not target_col:
            target_col = num_cols[0]

    code_lines = ["import pandas as pd", f"df = pd.read_csv('{fname}')"]
    if has_dupes:
        code_lines += ["# Deduplicate rows", "df = df.drop_duplicates()"]

    # --- PERCENTAGE of a categorical value ---
    if is_pct and filter_col and filter_val:
        code_lines += [
            f"# Count matching rows and total rows",
            f"total = len(df)",
            f"matching = (df['{filter_col}'].astype(str).str.lower() == '{filter_val}').sum()",
            f"result = round((matching / total * 100), 2) if total > 0 else 0",
            f"print(f'{{result}}%')",
        ]
        return GeneratedCode(
            code="\n".join(code_lines) + "\n",
            expected_output_type="percentage",
            calculation_description=f"Percentage of rows where {filter_col} = '{filter_val}'",
            datasets_used=[fname],
        )

    # --- COUNT of a categorical value ---
    if (is_count or not target_col) and filter_col and filter_val:
        code_lines += [
            f"# Count rows matching the condition",
            f"result = (df['{filter_col}'].astype(str).str.lower() == '{filter_val}').sum()",
            f"print(result)",
        ]
        return GeneratedCode(
            code="\n".join(code_lines) + "\n",
            expected_output_type="number",
            calculation_description=f"Count of rows where {filter_col} = '{filter_val}'",
            datasets_used=[fname],
        )

    # --- TOTAL ROW COUNT ---
    if is_count and not filter_col and not target_col:
        code_lines += ["result = len(df)", "print(result)"]
        return GeneratedCode(
            code="\n".join(code_lines) + "\n",
            expected_output_type="number",
            calculation_description=f"Total row count of {fname}",
            datasets_used=[fname],
        )

    # --- Numeric operations with optional filter ---
    if not target_col:
        code_lines += ["print(len(df))"]
        return GeneratedCode(
            code="\n".join(code_lines) + "\n",
            expected_output_type="number",
            calculation_description=f"Row count of {fname} (no numeric column found)",
            datasets_used=[fname],
        )

    # Apply filter if present
    if filter_col and filter_val:
        code_lines.append(f"df = df[df['{filter_col}'].astype(str).str.lower() == '{filter_val}']")

    if is_avg:
        code_lines += [f"result = round(df['{target_col}'].dropna().mean(), 2)", "print(result)"]
        desc = f"Average of {target_col} from {fname}"
        out_type = "number"
    elif is_max:
        code_lines += [f"result = df['{target_col}'].dropna().max()", "print(result)"]
        desc = f"Maximum of {target_col} from {fname}"
        out_type = "number"
    elif is_min:
        code_lines += [f"result = df['{target_col}'].dropna().min()", "print(result)"]
        desc = f"Minimum of {target_col} from {fname}"
        out_type = "number"
    elif is_count:
        code_lines += [f"result = df['{target_col}'].dropna().count()", "print(result)"]
        desc = f"Count of non-null {target_col} from {fname}"
        out_type = "number"
    else:
        code_lines += [f"result = round(df['{target_col}'].dropna().sum(), 2)", "print(result)"]
        desc = f"Sum of {target_col} from {fname}"
        out_type = "number"

    return GeneratedCode(
        code="\n".join(code_lines) + "\n",
        expected_output_type=out_type,
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
