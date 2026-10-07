"""
code_safety.py — Deterministic static safety validator for generated Python.

MUST NOT rely on the LLM to decide whether code is safe.
Uses AST analysis + regex pattern matching.

Blocks:
  - Dangerous imports (os, subprocess, socket, requests, urllib, shutil, etc.)
  - eval / exec / __import__ / compile
  - open() used outside the approved data directory
  - Shell commands
  - pip / package installation
  - Network access patterns
  - System calls
"""
from __future__ import annotations

import ast
import re
from typing import List

from app.models.schemas import SafetyCheckResult

# ---------------------------------------------------------------------------
# Blocklists
# ---------------------------------------------------------------------------

BLOCKED_IMPORTS = {
    "os",
    "subprocess",
    "socket",
    "requests",
    "urllib",
    "urllib2",
    "urllib3",
    "http",
    "httpx",
    "shutil",
    "pty",
    "sys",
    "ctypes",
    "multiprocessing",
    "threading",
    "concurrent",
    "signal",
    "resource",
    "pwd",
    "grp",
    "fcntl",
    "termios",
    "tty",
    "rlcompleter",
    "code",
    "codeop",
    "importlib",
    "pkgutil",
    "runpy",
    "zipimport",
    "zipfile",
    "tarfile",
    "gzip",
    "bz2",
    "lzma",
    "popen2",
    "commands",
    "cmd",
    "telnetlib",
    "ftplib",
    "smtplib",
    "poplib",
    "imaplib",
    "nntplib",
    "xmlrpc",
    "ssl",
    "asyncio",      # prevent networking via asyncio
    "aiohttp",
    "paramiko",
    "fabric",
    "invoke",
    "pip",
    "setuptools",
    "distutils",
    "ensurepip",
}

BLOCKED_BUILTINS = {
    "eval",
    "exec",
    "compile",
    "__import__",
    "breakpoint",
    "input",
    "open",       # validated separately with path check
}

# Regex patterns to catch obfuscated attempts
_BLOCKED_PATTERNS = [
    re.compile(r"\bsubprocess\b"),
    re.compile(r"\bos\.system\b"),
    re.compile(r"\bos\.popen\b"),
    re.compile(r"\bos\.exec\b"),
    re.compile(r"\bos\.spawn\b"),
    re.compile(r"\bos\.fork\b"),
    re.compile(r"\beval\s*\("),
    re.compile(r"\bexec\s*\("),
    re.compile(r"\bcompile\s*\("),
    re.compile(r"__import__\s*\("),
    re.compile(r"__builtins__"),
    re.compile(r"__globals__"),
    re.compile(r"__class__\s*\.\s*__bases__"),
    re.compile(r"\bgetattr\s*\(.*__"),
    re.compile(r"\bsetattr\s*\("),
    re.compile(r"pip\s+install"),
    re.compile(r"pip3\s+install"),
    re.compile(r"\.install\s*\("),
    re.compile(r"!pip"),
    re.compile(r"!python"),
    re.compile(r"!bash"),
    re.compile(r"curl\s+"),
    re.compile(r"wget\s+"),
    re.compile(r"requests\."),
    re.compile(r"urllib\."),
    re.compile(r"socket\."),
    re.compile(r"shutil\."),
    re.compile(r"open\s*\(\s*['\"](?!data/)"),  # open() with non-data path
]


class _ImportVisitor(ast.NodeVisitor):
    """AST visitor that collects all imports and dangerous call patterns."""

    def __init__(self) -> None:
        self.violations: List[str] = []

    def visit_Import(self, node: ast.Import) -> None:  # noqa: N802
        for alias in node.names:
            base = alias.name.split(".")[0]
            if base in BLOCKED_IMPORTS:
                self.violations.append(f"Blocked import: '{alias.name}'")
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:  # noqa: N802
        if node.module:
            base = node.module.split(".")[0]
            if base in BLOCKED_IMPORTS:
                self.violations.append(f"Blocked import: 'from {node.module} import ...'")
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        # Check for dangerous built-in calls
        func_name = None
        if isinstance(node.func, ast.Name):
            func_name = node.func.id
        elif isinstance(node.func, ast.Attribute):
            func_name = node.func.attr

        if func_name in BLOCKED_BUILTINS:
            if func_name == "open":
                # Allow open() ONLY if first arg looks like a data-relative path
                if node.args:
                    first = node.args[0]
                    if isinstance(first, ast.Constant) and isinstance(first.value, str):
                        path = first.value
                        if not (path.startswith("data/") or path.startswith("/data/")):
                            self.violations.append(
                                f"Blocked open() with non-data path: '{path}'"
                            )
                    else:
                        # Dynamic path — flag as suspicious
                        self.violations.append(
                            "Blocked open() with dynamic path argument (cannot verify safety)."
                        )
                else:
                    self.violations.append("Blocked open() call with no arguments.")
            else:
                self.violations.append(f"Blocked dangerous builtin: '{func_name}()'")

        self.generic_visit(node)


def validate_code_safety(code: str) -> SafetyCheckResult:
    """
    Validate generated Python code for security violations.

    Returns SafetyCheckResult with safe=True only when no violations found.
    Uses BOTH AST analysis and regex pattern matching.
    """
    violations: List[str] = []

    # ------------------------------------------------------------------ AST
    try:
        tree = ast.parse(code)
        visitor = _ImportVisitor()
        visitor.visit(tree)
        violations.extend(visitor.violations)
    except SyntaxError as exc:
        violations.append(f"Syntax error in generated code: {exc}")

    # ------------------------------------------------------------------ Regex
    for pattern in _BLOCKED_PATTERNS:
        if pattern.search(code):
            violations.append(f"Blocked pattern detected: {pattern.pattern!r}")

    return SafetyCheckResult(
        safe=len(violations) == 0,
        violations=violations,
    )
