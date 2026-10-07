"""
llm_client.py — Single, centralised gateway to the OpenAI API.

RULES:
  - This is the ONLY module that calls the OpenAI SDK directly.
  - All other modules call LLMClient.generate() or LLMClient.generate_structured().
  - Never log the API key.
  - Handles timeouts, retries, and clear error propagation.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, Optional, Type, TypeVar

from openai import APIConnectionError, APITimeoutError, OpenAI, RateLimitError
from pydantic import BaseModel

from app.llm.llm_config import (
    LLM_MAX_RETRIES,
    LLM_MAX_TOKENS,
    LLM_TEMPERATURE,
    LLM_TIMEOUT_SECONDS,
    OPENAI_MODEL,
)

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_RETRYABLE = (APIConnectionError, APITimeoutError, RateLimitError)


class LLMError(Exception):
    """Raised when the LLM call cannot be completed after retries."""


class LLMClient:
    """
    Thin abstraction over the OpenAI chat-completion API.

    Responsibilities:
      - Generate text from (system_prompt, user_prompt)
      - Generate structured JSON that is parsed into a Pydantic model
      - Retry on transient errors
      - Timeout management
      - Masked logging (no API key exposure)

    NOT responsible for:
      - Reading files
      - Executing code
      - Verifying results
      - Making final truth decisions
    """

    def __init__(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            logger.warning("OPENAI_API_KEY is not set — LLM calls will fail.")
        # OpenAI client; timeout applied per-request via httpx timeout kwarg
        self._client = OpenAI(
            api_key=api_key,
            timeout=LLM_TIMEOUT_SECONDS,
            max_retries=0,          # we handle retries ourselves
        )
        self._model = OPENAI_MODEL
        logger.info("LLMClient initialised with model=%s", self._model)

    def _get_client(self, api_key: Optional[str] = None) -> OpenAI:
        key = api_key or os.getenv("OPENAI_API_KEY", "")
        if key and key != getattr(self._client, "api_key", None):
            return OpenAI(api_key=key, timeout=LLM_TIMEOUT_SECONDS, max_retries=0)
        return self._client

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        api_key: Optional[str] = None,
    ) -> str:
        """
        Generate plain text from system + user prompts.

        Returns the assistant message content as a string.
        Raises LLMError on unrecoverable failure.
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        response = self._call_with_retry(
            messages=messages,
            temperature=temperature or LLM_TEMPERATURE,
            max_tokens=max_tokens or LLM_MAX_TOKENS,
            response_format=None,
            api_key=api_key,
        )
        content = response.choices[0].message.content or ""
        logger.debug("LLM response length=%d chars", len(content))
        return content

    def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: Type[T],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        api_key: Optional[str] = None,
    ) -> T:
        """
        Generate structured output that is parsed into *schema* (a Pydantic model).

        Uses JSON response_format so the model is forced to return valid JSON,
        then validates against the Pydantic schema.
        Raises LLMError on failure.
        """
        # Inject schema description into the system prompt
        schema_json = json.dumps(schema.model_json_schema(), indent=2)
        augmented_system = (
            f"{system_prompt}\n\n"
            f"You MUST return a single valid JSON object matching this schema:\n"
            f"```json\n{schema_json}\n```\n"
            f"Do NOT include markdown fences or extra text — only the JSON object."
        )

        messages = [
            {"role": "system", "content": augmented_system},
            {"role": "user", "content": user_prompt},
        ]
        response = self._call_with_retry(
            messages=messages,
            temperature=temperature or LLM_TEMPERATURE,
            max_tokens=max_tokens or LLM_MAX_TOKENS,
            response_format={"type": "json_object"},
            api_key=api_key,
        )
        raw = response.choices[0].message.content or "{}"
        try:
            data = json.loads(raw)
            return schema.model_validate(data)
        except Exception as exc:
            raise LLMError(
                f"Structured output parse failed for {schema.__name__}: {exc}\nRaw: {raw[:500]}"
            ) from exc

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _call_with_retry(
        self,
        messages: list,
        temperature: float,
        max_tokens: int,
        response_format: Optional[Dict[str, Any]],
        api_key: Optional[str] = None,
    ) -> Any:
        client = self._get_client(api_key)
        last_exc: Optional[Exception] = None
        for attempt in range(1, LLM_MAX_RETRIES + 1):
            try:
                kwargs: Dict[str, Any] = dict(
                    model=self._model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                if response_format:
                    kwargs["response_format"] = response_format

                t0 = time.monotonic()
                response = client.chat.completions.create(**kwargs)
                elapsed_ms = (time.monotonic() - t0) * 1000
                logger.info(
                    "LLM call succeeded: model=%s attempt=%d latency=%.0fms",
                    self._model,
                    attempt,
                    elapsed_ms,
                )
                return response

            except _RETRYABLE as exc:
                last_exc = exc
                wait = 2 ** attempt
                logger.warning(
                    "LLM transient error (attempt %d/%d): %s — retrying in %ds",
                    attempt,
                    LLM_MAX_RETRIES,
                    type(exc).__name__,
                    wait,
                )
                time.sleep(wait)

            except Exception as exc:
                # Non-retryable
                raise LLMError(f"LLM call failed: {exc}") from exc

        raise LLMError(
            f"LLM call failed after {LLM_MAX_RETRIES} attempts: {last_exc}"
        )


# Singleton instance — import this in other modules
llm_client = LLMClient()
