import os
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_runner_isolated.db")

import pytest
from sqlalchemy import text
from app.core.database import engine, Base
from app.main import app
from app.api.v1.auth import get_authenticated_user
from app.models.organization import User

@pytest.fixture(scope="session", autouse=True)
async def setup_test_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN report_template JSON DEFAULT '{}'"))
        except Exception:
            pass
    yield

@pytest.fixture(scope="session", autouse=True)
def override_auth():
    test_user = User(
        id="test-admin-id",
        email="admin@test.com",
        full_name="Test Administrator",
        role="ADMIN",
        is_active=True
    )
    async def mock_get_authenticated_user():
        return test_user

    app.dependency_overrides[get_authenticated_user] = mock_get_authenticated_user
    yield
    app.dependency_overrides.pop(get_authenticated_user, None)
