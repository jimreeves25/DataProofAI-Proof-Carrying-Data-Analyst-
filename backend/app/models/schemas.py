"""
schemas.py — All Pydantic data models for the Proof-Carrying Data Analyst.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AnalysisStatus(str, Enum):
    VERIFIED = "VERIFIED"
    UNANSWERABLE = "UNANSWERABLE"
    FAILED = "FAILED"
    ERROR = "ERROR"


class VerificationStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    SKIP = "SKIP"


class ExecutionStatus(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"
    TIMEOUT = "timeout"
    UNSAFE = "unsafe"


# ---------------------------------------------------------------------------
# Data Inspector / Profile
# ---------------------------------------------------------------------------

class ColumnProfile(BaseModel):
    name: str
    dtype: str
    missing_count: int = 0
    missing_pct: float = 0.0
    unique_count: Optional[int] = None
    sample_values: List[Any] = Field(default_factory=list)
    numeric_min: Optional[float] = None
    numeric_max: Optional[float] = None
    numeric_mean: Optional[float] = None
    is_date_like: bool = False
    is_currency_like: bool = False
    is_suspicious: bool = False
    suspicion_reason: Optional[str] = None


class FileProfile(BaseModel):
    filename: str
    format: str
    rows: int
    columns: int
    column_names: List[str]
    column_profiles: List[ColumnProfile]
    duplicate_rows: int = 0
    warnings: List[str] = Field(default_factory=list)
    sample_rows: List[Dict[str, Any]] = Field(default_factory=list)
    relationships: List[str] = Field(default_factory=list)  # detected FK hints


class DataProfile(BaseModel):
    files: List[FileProfile]
    global_warnings: List[str] = Field(default_factory=list)
    cross_file_relationships: List[str] = Field(default_factory=list)
    conflicting_columns: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Analysis Plan
# ---------------------------------------------------------------------------

class AnalysisPlan(BaseModel):
    answerable: bool
    reason: Optional[str] = None          # why unanswerable, if applicable
    reason_code: Optional[str] = None     # machine-readable refusal code
    missing_information: List[str] = Field(default_factory=list)  # what is absent
    datasets: List[str] = Field(default_factory=list)
    operations: List[str] = Field(default_factory=list)
    required_columns: List[str] = Field(default_factory=list)
    warnings_acknowledged: List[str] = Field(default_factory=list)
    ambiguities: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Code Generation
# ---------------------------------------------------------------------------

class GeneratedCode(BaseModel):
    code: str
    expected_output_type: str          # "number", "string", "table", etc.
    calculation_description: str
    datasets_used: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Code Safety
# ---------------------------------------------------------------------------

class SafetyCheckResult(BaseModel):
    safe: bool
    violations: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

class ExecutionResult(BaseModel):
    status: ExecutionStatus
    stdout: str = ""
    stderr: str = ""
    exit_code: int = -1
    execution_time_ms: float = 0.0
    result_value: Optional[Any] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

class VerificationChecks(BaseModel):
    code_executed: bool = False
    result_present: bool = False
    data_valid: bool = False
    reproducible: bool = False
    independent_check: bool = False


class VerificationResult(BaseModel):
    status: VerificationStatus
    generated_result: Optional[Any] = None
    verified_result: Optional[Any] = None
    difference: Optional[float] = None
    checks: VerificationChecks = Field(default_factory=VerificationChecks)
    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Proof Package
# ---------------------------------------------------------------------------

class ProofEvidence(BaseModel):
    columns: List[str] = Field(default_factory=list)
    filters: List[str] = Field(default_factory=list)
    datasets_used: List[str] = Field(default_factory=list)


class AttemptRecord(BaseModel):
    attempt_number: int
    plan: AnalysisPlan
    generated_code: Optional[str] = None
    execution: Optional[ExecutionResult] = None
    verification: Optional[VerificationResult] = None
    replan_reason: Optional[str] = None


class ProofPackage(BaseModel):
    question: str
    answer: Optional[str] = None
    status: AnalysisStatus
    datasets_used: List[str] = Field(default_factory=list)
    calculation_code: Optional[str] = None
    execution: Optional[ExecutionResult] = None
    verification: Optional[VerificationResult] = None
    evidence: Optional[ProofEvidence] = None
    attempts: List[AttemptRecord] = Field(default_factory=list)
    refusal_reason: Optional[str] = None


# ---------------------------------------------------------------------------
# API Request / Response
# ---------------------------------------------------------------------------

class AnalysisResponse(BaseModel):
    status: AnalysisStatus
    answer: Optional[str] = None
    reason: Optional[str] = None
    reason_code: Optional[str] = None    # machine-readable refusal code (mirrors plan)
    missing_information: List[str] = Field(default_factory=list)
    proof: Optional[ProofPackage] = None
    attempts: int = 0
    pipeline_events: List[str] = Field(default_factory=list)
    planner_mode: str = "unknown"        # "llm" | "heuristic_fallback" | "unknown"
