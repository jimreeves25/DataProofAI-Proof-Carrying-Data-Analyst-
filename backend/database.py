import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

load_dotenv()

database_url = os.getenv("DATABASE_URL")
engine: Engine | None = (
    create_engine(database_url, pool_pre_ping=True) if database_url else None
)