"""
analysis.py — FastAPI router for the /api/v1/analyze endpoint.

POST /api/v1/analyze
  - Accepts: multipart form with question + one or more dataset files
  - Returns: AnalysisResponse (VERIFIED / UNANSWERABLE / FAILED / ERROR)

POST /api/v1/inspect
  - Accepts: multipart form with one or more dataset files
  - Returns: DataProfile (for debugging / frontend preview)
"""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import List

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse, FileResponse

from app.inspector.data_inspector import inspect_datasets
from app.models.schemas import AnalysisResponse, DataProfile
from app.services.analysis_service import run_analysis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["analysis"])

_ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".json", ".parquet"}
_MAX_FILE_SIZE_MB = 50


def _validate_extension(filename: str) -> None:
    suffix = Path(filename).suffix.lower()
    if suffix not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. "
                   f"Allowed: {sorted(_ALLOWED_EXTENSIONS)}",
        )


async def _save_upload(upload: UploadFile, dest_dir: Path) -> Path:
    """Save an UploadFile to dest_dir and return its path."""
    filename = upload.filename or "upload"
    _validate_extension(filename)
    dest = dest_dir / filename
    content = await upload.read()
    if len(content) > _MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"File '{filename}' exceeds {_MAX_FILE_SIZE_MB} MB limit.",
        )
    dest.write_bytes(content)
    return dest


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(
    question: str = Form(..., description="Natural language question about your data"),
    files: List[UploadFile] = File(..., description="Dataset files (CSV/Excel/JSON/Parquet)"),
    api_key: Optional[str] = Form(None, description="Optional OpenAI API key override"),
    x_openai_api_key: Optional[str] = Header(None, alias="X-OpenAI-API-Key"),
) -> AnalysisResponse:
    """
    Run the full Proof-Carrying Data Analysis pipeline.

    Accepts a question and one or more dataset files.
    Returns a verified answer with proof, or a controlled refusal.
    """
    if not question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    if not files:
        raise HTTPException(status_code=400, detail="At least one dataset file is required.")

    effective_key = (api_key or "").strip() or (x_openai_api_key or "").strip() or None

    # Save uploads to temp directory
    with tempfile.TemporaryDirectory(prefix="pcda_upload_") as tmp:
        tmp_path = Path(tmp)
        file_paths: List[Path] = []
        for upload in files:
            try:
                path = await _save_upload(upload, tmp_path)
                file_paths.append(path)
                logger.info("Uploaded file saved: %s (%d bytes)", path.name, path.stat().st_size)
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to process upload '{upload.filename}': {exc}",
                ) from exc

        try:
            result = run_analysis(
                question=question.strip(),
                uploaded_file_paths=file_paths,
                api_key=effective_key,
            )
        except Exception as exc:
            logger.exception("Unexpected error in run_analysis: %s", exc)
            raise HTTPException(
                status_code=500,
                detail=f"Internal analysis error: {exc}",
            ) from exc

    return result


@router.post("/inspect", response_model=DataProfile)
async def inspect(
    files: List[UploadFile] = File(..., description="Dataset files to inspect"),
) -> DataProfile:
    """
    Inspect datasets and return their DataProfile without running analysis.

    Useful for frontend file preview and debugging.
    """
    with tempfile.TemporaryDirectory(prefix="pcda_inspect_") as tmp:
        tmp_path = Path(tmp)
        file_paths: List[Path] = []
        for upload in files:
            try:
                path = await _save_upload(upload, tmp_path)
                file_paths.append(path)
            except HTTPException:
                raise

        try:
            return inspect_datasets(file_paths)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Inspection error: {exc}",
            ) from exc


@router.get("/demos")
async def list_demos() -> dict:
    """List sample demo scenarios and test datasets."""
    demo_dir = Path(__file__).resolve().parent.parent.parent.parent / "data" / "demo"
    demos = [
        {
            "id": "clean_sales",
            "name": "Clean Sales (sales.csv)",
            "files": ["sales.csv"],
            "suggested_question": "What is the total revenue?",
            "category": "Basic Calculation",
            "expected": "VERIFIED (~$514,616.67)",
        },
        {
            "id": "average_revenue",
            "name": "Average Revenue (sales.csv)",
            "files": ["sales.csv"],
            "suggested_question": "What is the average revenue per sale?",
            "category": "Statistical Metric",
            "expected": "VERIFIED (~$2,843.19)",
        },
        {
            "id": "multi_table_profit",
            "name": "Multi-Table Profit (sales.csv + expenses.csv)",
            "files": ["sales.csv", "expenses.csv"],
            "suggested_question": "Which product generated the highest profit?",
            "category": "Multi-Table Join",
            "expected": "VERIFIED (Product_B)",
        },
        {
            "id": "duplicate_sales",
            "name": "Deduplication Trap (duplicate_sales.csv)",
            "files": ["duplicate_sales.csv"],
            "suggested_question": "What is the total revenue after deduplication?",
            "category": "Data Quality / Duplicates",
            "expected": "VERIFIED (Deduplication handled)",
        },
        {
            "id": "missing_expenses",
            "name": "Missing Data Trap (missing_expenses.csv)",
            "files": ["missing_expenses.csv"],
            "suggested_question": "What were the total expenses in April?",
            "category": "Controlled Refusal",
            "expected": "UNANSWERABLE (Refusal due to >50% missing values)",
        },
        {
            "id": "conflicting_revenue",
            "name": "Conflicting Source Trap (sales.csv + conflicting_revenue.csv)",
            "files": ["sales.csv", "conflicting_revenue.csv"],
            "suggested_question": "What is the total revenue for Product_A?",
            "category": "Contradictory Sources",
            "expected": "UNANSWERABLE (Refusal due to conflicting revenue columns)",
        },
    ]
    return {"demos": demos}


@router.get("/demos/{filename}")
async def get_demo_file(filename: str):
    """Download demo dataset file."""
    demo_dir = Path(__file__).resolve().parent.parent.parent.parent / "data" / "demo"
    file_path = (demo_dir / filename).resolve()
    if not file_path.exists() or not str(file_path).startswith(str(demo_dir.resolve())):
        raise HTTPException(status_code=404, detail="Demo file not found.")
    return FileResponse(file_path, filename=filename, media_type="text/csv")


@router.get("/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok", "service": "Proof-Carrying Data Analyst"}
