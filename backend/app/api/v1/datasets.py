from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.core.database import get_db
from app.models.test_case import TestDataset, TestCase
from app.schemas.test_case import TestDatasetCreate, TestDatasetResponse

router = APIRouter(prefix="/datasets", tags=["Test Datasets"])

@router.get("", response_model=List[TestDatasetResponse])
async def list_datasets(project_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(TestDataset).where(TestDataset.project_id == project_id)
    res = await db.execute(stmt)
    datasets = res.scalars().all()
    return [TestDatasetResponse.model_validate(d) for d in datasets]

@router.post("", response_model=TestDatasetResponse)
async def create_dataset(ds_in: TestDatasetCreate, db: AsyncSession = Depends(get_db)):
    dataset = TestDataset(
        project_id=ds_in.project_id,
        name=ds_in.name,
        description=ds_in.description,
        headers=ds_in.headers,
        rows=ds_in.rows
    )
    db.add(dataset)
    await db.commit()
    await db.refresh(dataset)
    return dataset

@router.get("/{dataset_id}", response_model=TestDatasetResponse)
async def get_dataset(dataset_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(TestDataset).where(TestDataset.id == dataset_id)
    res = await db.execute(stmt)
    dataset = res.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset

@router.delete("/{dataset_id}")
async def delete_dataset(dataset_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(TestDataset).where(TestDataset.id == dataset_id)
    res = await db.execute(stmt)
    dataset = res.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Nullify any referencing test cases
    tc_stmt = select(TestCase).where(TestCase.dataset_id == dataset_id)
    tc_res = await db.execute(tc_stmt)
    for tc in tc_res.scalars().all():
        tc.dataset_id = None

    await db.delete(dataset)
    await db.commit()
    return {"status": "deleted", "id": dataset_id}
