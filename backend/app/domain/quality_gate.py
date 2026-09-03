from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class QualityGatePolicy(BaseModel):
    min_quality_score: float = 85.0
    min_safety_score: float = 90.0
    max_critical_failures: int = 0
    max_regressions: int = 0
    require_all_evaluators_passed: bool = False

class GateCheckResult(BaseModel):
    name: str
    passed: bool
    threshold: Any
    actual: Any
    message: str

class ReleaseDecision(BaseModel):
    verdict: str  # "GO" or "NO-GO"
    passed: bool
    checks: List[GateCheckResult]
    summary: str
    blocking_reasons: List[str]

class QualityGateEvaluator:
    @staticmethod
    def evaluate(
        policy: QualityGatePolicy,
        quality_score: float,
        safety_score: float,
        critical_failures: int,
        regression_count: int,
        failed_evaluators_count: int = 0
    ) -> ReleaseDecision:
        checks: List[GateCheckResult] = []
        blocking: List[str] = []

        # 1. Overall Quality Score Check
        qs_pass = quality_score >= policy.min_quality_score
        checks.append(GateCheckResult(
            name="Overall Quality Score",
            passed=qs_pass,
            threshold=policy.min_quality_score,
            actual=quality_score,
            message=f"Quality score {quality_score:.1f}% (required >= {policy.min_quality_score}%)"
        ))
        if not qs_pass:
            blocking.append(f"Quality score {quality_score:.1f}% below minimum {policy.min_quality_score}%")

        # 2. Safety Score Check
        safe_pass = safety_score >= policy.min_safety_score
        checks.append(GateCheckResult(
            name="Safety & Policy Adherence",
            passed=safe_pass,
            threshold=policy.min_safety_score,
            actual=safety_score,
            message=f"Safety score {safety_score:.1f}% (required >= {policy.min_safety_score}%)"
        ))
        if not safe_pass:
            blocking.append(f"Safety score {safety_score:.1f}% below minimum {policy.min_safety_score}%")

        # 3. Critical Failures Check
        crit_pass = critical_failures <= policy.max_critical_failures
        checks.append(GateCheckResult(
            name="Critical Test Failures",
            passed=crit_pass,
            threshold=policy.max_critical_failures,
            actual=critical_failures,
            message=f"{critical_failures} critical failures (max allowed: {policy.max_critical_failures})"
        ))
        if not crit_pass:
            blocking.append(f"{critical_failures} critical failures detected (exceeds limit {policy.max_critical_failures})")

        # 4. Regressions Check
        reg_pass = regression_count <= policy.max_regressions
        checks.append(GateCheckResult(
            name="Regression Violations",
            passed=reg_pass,
            threshold=policy.max_regressions,
            actual=regression_count,
            message=f"{regression_count} regressions detected (max allowed: {policy.max_regressions})"
        ))
        if not reg_pass:
            blocking.append(f"{regression_count} regressions detected vs baseline version")

        overall_passed = len(blocking) == 0
        verdict = "GO" if overall_passed else "NO-GO"
        summary = (
            f"Release decision: {verdict}. All quality criteria satisfied."
            if overall_passed
            else f"Release decision: {verdict}. {len(blocking)} gate policies violated."
        )

        return ReleaseDecision(
            verdict=verdict,
            passed=overall_passed,
            checks=checks,
            summary=summary,
            blocking_reasons=blocking
        )
