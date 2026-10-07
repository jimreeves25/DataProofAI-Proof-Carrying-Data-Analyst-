"""
data_inspector.py — Deterministic dataset profiler.

Inspects every uploaded file using Python/pandas. Never calls the LLM
for basic statistics. The DataProfile produced here feeds the AI Agent.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.models.schemas import ColumnProfile, DataProfile, FileProfile

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Heuristic keywords
# ---------------------------------------------------------------------------
_CURRENCY_KEYWORDS = re.compile(
    r"(price|revenue|cost|expense|sales|profit|amount|salary|wage|usd|eur|gbp|inr|cad)",
    re.IGNORECASE,
)
_DATE_KEYWORDS = re.compile(
    r"(date|time|year|month|day|period|quarter|week|timestamp)",
    re.IGNORECASE,
)
_SUSPICIOUS_KEYWORDS = re.compile(
    r"(currency|unit|source|version|flag|status)",
    re.IGNORECASE,
)


def _infer_date_like(series: pd.Series, col_name: str) -> bool:
    """Return True if the column looks like dates."""
    if _DATE_KEYWORDS.search(col_name):
        return True
    if pd.api.types.is_datetime64_any_dtype(series):
        return True
    if series.dtype == object:
        sample = series.dropna().head(20).astype(str)
        hits = sum(
            bool(re.search(r"\d{4}[-/]\d{1,2}[-/]\d{1,2}", v)) for v in sample
        )
        return hits >= len(sample) * 0.5 if len(sample) > 0 else False
    return False


def _profile_column(series: pd.Series, col_name: str) -> ColumnProfile:
    total = len(series)
    missing = int(series.isna().sum())
    missing_pct = round(missing / total * 100, 2) if total else 0.0

    unique = series.nunique(dropna=True)
    sample_vals: List[Any] = series.dropna().head(5).tolist()
    # Make sure sample values are JSON-serialisable
    sample_vals = [
        v.item() if hasattr(v, "item") else v for v in sample_vals
    ]

    is_date = _infer_date_like(series, col_name)
    is_currency = bool(_CURRENCY_KEYWORDS.search(col_name))
    is_suspicious = bool(_SUSPICIOUS_KEYWORDS.search(col_name))
    suspicion_reason: Optional[str] = None
    if is_suspicious:
        suspicion_reason = f"Column name '{col_name}' matches suspicious keyword pattern."

    numeric_min = numeric_max = numeric_mean = None
    if pd.api.types.is_numeric_dtype(series):
        clean = series.dropna()
        if len(clean):
            numeric_min = float(clean.min())
            numeric_max = float(clean.max())
            numeric_mean = float(clean.mean())

    return ColumnProfile(
        name=col_name,
        dtype=str(series.dtype),
        missing_count=missing,
        missing_pct=missing_pct,
        unique_count=int(unique),
        sample_values=sample_vals,
        numeric_min=numeric_min,
        numeric_max=numeric_max,
        numeric_mean=numeric_mean,
        is_date_like=is_date,
        is_currency_like=is_currency,
        is_suspicious=is_suspicious,
        suspicion_reason=suspicion_reason,
    )


def _load_dataframe(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path, low_memory=False)
    if suffix in (".xls", ".xlsx"):
        return pd.read_excel(path)
    if suffix == ".json":
        return pd.read_json(path)
    if suffix == ".parquet":
        return pd.read_parquet(path)
    raise ValueError(f"Unsupported file format: {suffix}")


def _detect_format(path: Path) -> str:
    return path.suffix.lstrip(".").lower() or "unknown"


def inspect_file(path: Path) -> FileProfile:
    """Inspect a single file and return its FileProfile."""
    logger.info("Inspecting file: %s", path.name)
    filename = path.name
    fmt = _detect_format(path)

    try:
        df = _load_dataframe(path)
    except Exception as exc:
        logger.error("Failed to load %s: %s", filename, exc)
        return FileProfile(
            filename=filename,
            format=fmt,
            rows=0,
            columns=0,
            column_names=[],
            column_profiles=[],
            warnings=[f"Could not load file: {exc}"],
        )

    rows, cols = df.shape
    column_names = list(df.columns.astype(str))

    # Profile each column
    column_profiles = [_profile_column(df[col], str(col)) for col in df.columns]

    # Duplicate rows
    duplicate_rows = int(df.duplicated().sum())

    # Sample rows (JSON-safe)
    sample_rows: List[Dict[str, Any]] = []
    for record in df.head(3).to_dict(orient="records"):
        safe = {}
        for k, v in record.items():
            if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                safe[k] = None
            elif hasattr(v, "item"):
                safe[k] = v.item()
            else:
                safe[k] = v
        sample_rows.append(safe)

    # Build warnings
    warnings: List[str] = []
    for cp in column_profiles:
        if cp.missing_count > 0:
            warnings.append(
                f"WARNING: {cp.missing_count} missing values in '{cp.name}' "
                f"({cp.missing_pct}%)"
            )
    if duplicate_rows > 0:
        warnings.append(f"WARNING: {duplicate_rows} duplicate rows detected.")

    # Check mixed-format date columns
    date_cols = [cp.name for cp in column_profiles if cp.is_date_like]
    if len(date_cols) > 1:
        warnings.append(
            f"WARNING: Multiple date-like columns detected: {date_cols}. "
            "Verify consistent date formats."
        )

    # Check possible unit/currency mismatch within file
    currency_cols = [cp.name for cp in column_profiles if cp.is_currency_like]
    if currency_cols:
        warnings.append(
            f"WARNING: Possible currency/unit columns detected: {currency_cols}. "
            "Verify unit consistency."
        )

    return FileProfile(
        filename=filename,
        format=fmt,
        rows=rows,
        columns=cols,
        column_names=column_names,
        column_profiles=column_profiles,
        duplicate_rows=duplicate_rows,
        warnings=warnings,
        sample_rows=sample_rows,
    )


def _detect_cross_file_relationships(
    profiles: List[FileProfile],
) -> List[str]:
    """Heuristically detect shared column names across files (FK hints)."""
    relationships: List[str] = []
    col_to_files: Dict[str, List[str]] = {}
    for fp in profiles:
        for col in fp.column_names:
            col_lower = col.lower()
            col_to_files.setdefault(col_lower, []).append(fp.filename)
    for col, files in col_to_files.items():
        if len(files) > 1:
            relationships.append(
                f"Column '{col}' appears in: {', '.join(files)} — possible join key."
            )
    return relationships


def _detect_conflicting_columns(
    profiles: List[FileProfile],
) -> List[str]:
    """
    Flag cases where:
      1. Same column has different dtypes across files.
      2. Same metric column (revenue, expense, profit, etc.) exists in multiple files,
         creating conflicting/competing sources of truth.
    """
    conflicts: List[str] = []
    col_dtype_map: Dict[str, Dict[str, str]] = {}
    metric_cols_in_files: Dict[str, List[str]] = {}

    for fp in profiles:
        for cp in fp.column_profiles:
            cname = cp.name.lower()
            col_dtype_map.setdefault(cname, {})[fp.filename] = cp.dtype
            # Detect competing metric columns
            if any(term in cname for term in ("revenue", "expense", "profit", "cogs")):
                metric_cols_in_files.setdefault(cname, []).append(fp.filename)

    # 1. Dtype conflicts
    for col, dtype_by_file in col_dtype_map.items():
        dtypes = set(dtype_by_file.values())
        if len(dtypes) > 1:
            detail = ", ".join(f"{f}:{d}" for f, d in dtype_by_file.items())
            conflicts.append(
                f"Column '{col}' has conflicting dtypes across files: {detail}"
            )

    # 2. Competing metric sources across files
    for col, files in metric_cols_in_files.items():
        if len(files) > 1:
            conflicts.append(
                f"Conflicting metric '{col}' present in multiple files: {', '.join(files)}. "
                f"Source of truth is ambiguous."
            )

    return conflicts


def inspect_datasets(file_paths: List[Path]) -> DataProfile:
    """
    Inspect all uploaded datasets and return a unified DataProfile.

    This is the entry-point called by the analysis service.
    """
    profiles = [inspect_file(p) for p in file_paths]

    cross_rels = _detect_cross_file_relationships(profiles)
    conflicts = _detect_conflicting_columns(profiles)

    global_warnings: List[str] = []
    if conflicts:
        for c in conflicts:
            global_warnings.append(f"WARNING: {c}")

    return DataProfile(
        files=profiles,
        global_warnings=global_warnings,
        cross_file_relationships=cross_rels,
        conflicting_columns=conflicts,
    )
