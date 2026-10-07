"""
llm_config.py — Model/provider configuration.

All LLM-specific settings live here. Never hard-code model names or
temperatures elsewhere in the codebase.
"""
from __future__ import annotations

import os

# ---------------------------------------------------------------------------
# Model selection
# ---------------------------------------------------------------------------
# Set OPENAI_MODEL in your .env to override.
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# ---------------------------------------------------------------------------
# Generation parameters
# ---------------------------------------------------------------------------
LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.0"))
LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", "4096"))
LLM_TIMEOUT_SECONDS: float = float(os.getenv("LLM_TIMEOUT_SECONDS", "60.0"))
LLM_MAX_RETRIES: int = int(os.getenv("LLM_MAX_RETRIES", "3"))

# ---------------------------------------------------------------------------
# Analysis loop
# ---------------------------------------------------------------------------
MAX_REPLAN_ATTEMPTS: int = int(os.getenv("MAX_REPLAN_ATTEMPTS", "3"))
