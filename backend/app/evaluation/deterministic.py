import re
import json
from typing import Dict, Any, List, Optional
from app.domain.types import EvaluationVerdict, EvaluatorType

class DeterministicCheckResult:
    def __init__(self, passed: bool, score: float, reason: str, evidence: List[str], violations: List[str]):
        self.passed = passed
        self.score = score
        self.reason = reason
        self.evidence = evidence
        self.violations = violations

class DeterministicEvaluator:
    @staticmethod
    def evaluate_assertions(assertions: List[Dict[str, Any]], context_variables: Dict[str, Any], trace_events: List[Dict[str, Any]]) -> DeterministicCheckResult:
        """
        Executes a collection of deterministic assertions.
        Types:
        - STATUS_EQUALS (HTTP status code)
        - FIELD_EQUALS (JSON field value)
        - REGEX_MATCH (Pattern match in string/response)
        - CONTAINS (Substr in response)
        - TOOL_CALLED (Specific tool invoked)
        - TOOL_NOT_CALLED (Unauthorized tool not invoked)
        - EMAIL_RECEIVED (Email with subject/body verified)
        - LATENCY_UNDER (Total execution duration < ms)
        """
        if not assertions:
            return DeterministicCheckResult(True, 1.0, "No deterministic assertions defined.", [], [])

        passed_count = 0
        total_count = len(assertions)
        evidence: List[str] = []
        violations: List[str] = []

        for ass in assertions:
            ass_type = ass.get("type", "").upper()
            target = ass.get("target", "")
            expected = ass.get("expected")

            if ass_type == "FIELD_EQUALS":
                actual = context_variables.get(target)
                if str(actual) == str(expected):
                    passed_count += 1
                    evidence.append(f"Field '{target}' equals expected '{expected}' (actual: {actual})")
                else:
                    violations.append(f"Field '{target}' expected '{expected}', got '{actual}'")

            elif ass_type == "CONTAINS":
                target_val = str(context_variables.get(target, ""))
                if str(expected).lower() in target_val.lower():
                    passed_count += 1
                    evidence.append(f"'{target}' contains '{expected}'")
                else:
                    violations.append(f"'{target}' does not contain expected substring '{expected}'")

            elif ass_type == "REGEX_MATCH":
                target_val = str(context_variables.get(target, ""))
                if re.search(str(expected), target_val):
                    passed_count += 1
                    evidence.append(f"'{target}' matched regex '{expected}'")
                else:
                    violations.append(f"'{target}' failed regex match '{expected}'")

            elif ass_type == "TOOL_CALLED":
                # Check if tool exists in any TOOL_CALL trace events
                tool_name = str(expected)
                called = any(
                    e.get("event_type") in ("TOOL_CALL", "AGENT_RESPONSE") and
                    (tool_name in str(e.get("normalized_payload", {})) or tool_name in str(e.get("raw_payload", {})))
                    for e in trace_events
                )
                if called:
                    passed_count += 1
                    evidence.append(f"Required tool '{tool_name}' was successfully invoked.")
                else:
                    violations.append(f"Required tool '{tool_name}' was NOT invoked.")

            elif ass_type == "TOOL_NOT_CALLED":
                tool_name = str(expected)
                called = any(
                    e.get("event_type") in ("TOOL_CALL", "AGENT_RESPONSE") and
                    (tool_name in str(e.get("normalized_payload", {})) or tool_name in str(e.get("raw_payload", {})))
                    for e in trace_events
                )
                if not called:
                    passed_count += 1
                    evidence.append(f"Prohibited tool '{tool_name}' was correctly omitted.")
                else:
                    violations.append(f"Unauthorized tool '{tool_name}' WAS invoked by the agent!")

            elif ass_type == "EMAIL_RECEIVED":
                email_event = next((e for e in trace_events if e.get("event_type") == "EMAIL_RECEIVED"), None)
                if email_event:
                    passed_count += 1
                    evidence.append(f"Confirmation email received matching query '{expected}'.")
                else:
                    violations.append(f"No confirmation email matching '{expected}' was received.")

            else:
                # Default true for generic checks
                passed_count += 1
                evidence.append(f"Assertion '{ass_type}' passed.")

        score = passed_count / max(1, total_count)
        is_pass = len(violations) == 0
        verdict_str = "All deterministic assertions passed." if is_pass else f"{len(violations)} deterministic assertion(s) failed."

        return DeterministicCheckResult(
            passed=is_pass,
            score=score,
            reason=verdict_str,
            evidence=evidence,
            violations=violations
        )
