import os
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_runner_isolated.db")

import pytest
from sqlalchemy import text
from app.core.database import engine, Base

@pytest.fixture(scope="session", autouse=True)
async def setup_test_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN report_template JSON DEFAULT '{}'"))
        except Exception:
            pass
    yield
