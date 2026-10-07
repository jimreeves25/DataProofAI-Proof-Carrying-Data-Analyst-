"""
main.py — FastAPI application entry point for the Proof-Carrying Data Analyst.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env before importing anything that reads env vars
load_dotenv()

from app.api.analysis import router as analysis_router  # noqa: E402

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    logger.info("=== Proof-Carrying Data Analyst starting ===")
    if not os.getenv("OPENAI_API_KEY"):
        logger.warning("⚠ OPENAI_API_KEY is not set — LLM features will not work.")
    yield
    logger.info("=== Proof-Carrying Data Analyst shutting down ===")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Proof-Carrying Data Analyst",
    description=(
        "Every numerical answer is backed by executable analysis code, "
        "actual execution results, and independent verification."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router)
