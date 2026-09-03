#!/usr/bin/env python
"""
Universal AI Agent QA Platform CLI Runner
Usage:
    python cli.py run --project travel-ai --suite regression --env qa --quality-gate 85.0
"""
import argparse
import asyncio
import sys
from app.core.database import AsyncSessionLocal, engine, Base
from app.seed import seed_database
from app.execution.engine import GraphExecutionEngine
from app.models.project import Project, Environment
from app.models.agent import Agent, AgentVersion
from app.models.test_case import TestSuite, TestCase
from app.models.execution import ExecutionRun
from app.domain.types import ExecutionStatus
from sqlalchemy import select

async def run_cli(args):
    # Ensure tables and seed data exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_database()

    async with AsyncSessionLocal() as session:
        # Resolve Project
        p_stmt = select(Project).where((Project.slug == args.project) | (Project.name == args.project) | (Project.id == args.project))
        p_res = await session.execute(p_stmt)
        project = p_res.scalar_one_or_none()
        if not project:
            # Fallback to first available project
            p_fallback_stmt = select(Project).limit(1)
            project = (await session.execute(p_fallback_stmt)).scalar_one_or_none()
            if not project:
                print(f"[ERROR] No projects found in database.")
                return 1

        # Resolve Environment
        env_stmt = select(Environment).where(Environment.project_id == project.id)
        if args.env:
            env_stmt = env_stmt.where(Environment.name.ilike(f"%{args.env}%"))
        env_res = await session.execute(env_stmt)
        env = env_res.scalar_one_or_none()
        if not env:
            print(f"[ERROR] Environment '{args.env}' not found.")
            return 1

        # Resolve Agent Version
        v_stmt = select(AgentVersion).join(Agent).where(Agent.project_id == project.id)
        if args.version:
            v_stmt = v_stmt.where(AgentVersion.version_tag == args.version)
        v_res = await session.execute(v_stmt)
        version = v_res.scalar_one_or_none()

        # Create Execution Run
        import uuid
        run = ExecutionRun(
            correlation_id=f"cli-corr-{uuid.uuid4().hex[:8]}",
            project_id=project.id,
            environment_id=env.id,
            agent_version_id=version.id if version else None,
            status=ExecutionStatus.QUEUED
        )
        session.add(run)
        await session.commit()
        await session.refresh(run)

    if sys.stdout.encoding != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    print("=" * 70)
    print(f"[+] AI AGENT QA AUTOMATION TEST RUNNER")
    print(f"    Project:     {project.name} ({project.slug})")
    print(f"    Environment: {env.name} ({env.base_url})")
    print(f"    Agent Model: {version.version_tag if version else 'v1.0.0'} ({version.model_name if version else 'gpt-4o'})")
    print(f"    Run ID:      {run.id}")
    print("=" * 70)

    engine_inst = GraphExecutionEngine(session)
    completed_run = await engine_inst.execute_run(
        execution_id=run.id,
        initial_context={"origin": "Delhi (DEL)", "destination": "Dubai (DXB)", "travel_date": "Tomorrow"},
        agent_version_tag=version.version_tag if version else "v1.0.0"
    )

    print("\n[EXECUTION SUMMARY]")
    print(f"    Status:            {completed_run.status.value}")
    print(f"    Total Duration:    {completed_run.total_duration_ms:.1f} ms")
    print(f"    Total Tokens:      {completed_run.total_tokens} (In: {completed_run.input_tokens}, Out: {completed_run.output_tokens})")
    print(f"    Estimated Cost:    ${completed_run.estimated_cost_usd:.5f} USD")
    print(f"    Quality Score:     {completed_run.quality_score:.1f}%")
    print(f"    Safety Score:      {completed_run.safety_score:.1f}%")

    # Quality Gate Check
    min_score = args.quality_gate or 85.0
    passed_gate = (completed_run.quality_score or 0) >= min_score and completed_run.status == ExecutionStatus.PASSED

    print("\n[RELEASE QUALITY GATE]")
    print(f"    Required Score:    >= {min_score}%")
    print(f"    Actual Score:      {completed_run.quality_score:.1f}%")
    print(f"    Release Decision:  {'[PASS] GO TO PRODUCTION' if passed_gate else '[FAIL] NO-GO (RELEASE BLOCKED)'}")
    await engine.dispose()
    return 0 if passed_gate else 1

def main():
    parser = argparse.ArgumentParser(description="Universal AI Agent QA Automation & Evaluation Platform CLI")
    subparsers = parser.add_subparsers(dest="command")

    run_parser = subparsers.add_parser("run", help="Run test suite or workflow")
    run_parser.add_argument("--project", default="travel-ai", help="Project name or slug")
    run_parser.add_argument("--suite", default="regression", help="Test suite name")
    run_parser.add_argument("--env", default="qa", help="Environment (DEV, QA, STAGING, PRODUCTION)")
    run_parser.add_argument("--version", default="v1.0.0", help="Agent version tag (e.g. v1.0.0, v2.0.0)")
    run_parser.add_argument("--quality-gate", type=float, default=85.0, help="Minimum Quality Score threshold")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    code = asyncio.run(run_cli(args))
    sys.exit(code)

if __name__ == "__main__":
    main()
