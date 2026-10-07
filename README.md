# PS08 - Proof-Carrying Data Analyst

Development environment for the PS08 MVP. Application features have not been implemented yet.

## Prerequisites

- Python 3.11 or newer
- Node.js and npm
- PostgreSQL for local database work
- Docker is not currently installed; it is only needed when the future execution sandbox is developed.

## Setup on Windows

From Command Prompt at the project root:

```cmd
py -3.11 -m venv backend\.venv
backend\.venv\Scripts\activate.bat
python -m pip install -r backend\requirements.txt
copy .env.example .env
npm.cmd --prefix frontend install
```

The current PowerShell execution policy blocks `.ps1` scripts and the `npm` PowerShell shim. Use Command Prompt activation and `npm.cmd` from PowerShell.

Set `OPENAI_API_KEY` and `DATABASE_URL` in `.env` for local use. Do not commit `.env` or put secrets in source code.

The basic SQLAlchemy configuration is in `backend/database.py`. It creates an engine from `DATABASE_URL` when configured; it does not connect until the engine is used and does not create a schema.

## Frontend

```cmd
npm.cmd --prefix frontend run dev
```

## Backend dependencies

Install the pinned environment with the command in the setup section. To activate the virtual environment later from Command Prompt, run `backend\.venv\Scripts\activate.bat` from the project root.