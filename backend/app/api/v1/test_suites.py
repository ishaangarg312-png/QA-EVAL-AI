from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.core.database import get_db
from app.models.test_case import TestSuite, TestCase
from app.schemas.test_case import TestSuiteCreate, TestSuiteResponse, TestCaseCreate, TestCaseResponse

router = APIRouter(prefix="/test-suites", tags=["Test Suites & Test Cases"])

@router.get("", response_model=List[TestSuiteResponse])
async def list_test_suites(project_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(TestSuite).where(TestSuite.project_id == project_id)
    res = await db.execute(stmt)
    suites = res.scalars().all()
    out = []
    for s in suites:
        tc_stmt = select(TestCase).where(TestCase.test_suite_id == s.id)
        tc_res = await db.execute(tc_stmt)
        cases = tc_res.scalars().all()
        out.append(TestSuiteResponse(
            id=s.id,
            project_id=s.project_id,
            name=s.name,
            description=s.description,
            tags=s.tags or [],
            created_at=s.created_at,
            test_cases=[TestCaseResponse.model_validate(c) for c in cases]
        ))
    return out

@router.post("", response_model=TestSuiteResponse)
async def create_test_suite(suite_in: TestSuiteCreate, db: AsyncSession = Depends(get_db)):
    suite = TestSuite(
        project_id=suite_in.project_id,
        name=suite_in.name,
        description=suite_in.description,
        tags=suite_in.tags
    )
    db.add(suite)
    await db.commit()
    await db.refresh(suite)
    return TestSuiteResponse(
        id=suite.id,
        project_id=suite.project_id,
        name=suite.name,
        description=suite.description,
        tags=suite.tags or [],
        created_at=suite.created_at,
        test_cases=[]
    )

@router.post("/{suite_id}/cases", response_model=TestCaseResponse)
async def create_test_case(suite_id: str, case_in: TestCaseCreate, db: AsyncSession = Depends(get_db)):
    case = TestCase(
        test_suite_id=suite_id,
        workflow_id=case_in.workflow_id,
        dataset_id=case_in.dataset_id,
        title=case_in.title,
        description=case_in.description,
        severity=case_in.severity,
        priority=case_in.priority,
        status=case_in.status,
        expected_trace=case_in.expected_trace,
        evaluator_configs=case_in.evaluator_configs
    )
    db.add(case)
    await db.commit()
    await db.refresh(case)
    return case
