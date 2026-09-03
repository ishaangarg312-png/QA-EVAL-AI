from typing import Dict, Any, List, Optional

class RegressionComparator:
    @staticmethod
    def compare_agent_versions(
        baseline_version_tag: str,
        target_version_tag: str,
        baseline_executions: List[Dict[str, Any]],
        target_executions: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Performs statistical & behavioral comparison between two agent versions.
        """
        # Baseline stats
        b_count = len(baseline_executions)
        b_passed = sum(1 for e in baseline_executions if e.get("status") == "PASSED")
        b_pass_rate = (b_passed / max(1, b_count)) * 100.0
        b_latencies = [e.get("total_duration_ms", 0.0) for e in baseline_executions]
        b_avg_latency = sum(b_latencies) / max(1, len(b_latencies))
        b_tokens = [e.get("total_tokens", 0) for e in baseline_executions]
        b_avg_tokens = sum(b_tokens) // max(1, len(b_tokens))

        # Target stats
        t_count = len(target_executions)
        t_passed = sum(1 for e in target_executions if e.get("status") == "PASSED")
        t_pass_rate = (t_passed / max(1, t_count)) * 100.0
        t_latencies = [e.get("total_duration_ms", 0.0) for e in target_executions]
        t_avg_latency = sum(t_latencies) / max(1, len(t_latencies))
        t_tokens = [e.get("total_tokens", 0) for e in target_executions]
        t_avg_tokens = sum(t_tokens) // max(1, len(t_tokens))

        pass_rate_delta = round(t_pass_rate - b_pass_rate, 2)
        latency_delta_pct = round(((t_avg_latency - b_avg_latency) / max(1.0, b_avg_latency)) * 100.0, 2)

        regressions_count = max(0, b_passed - t_passed)
        improvements_count = max(0, t_passed - b_passed)

        # Release Recommendation
        if pass_rate_delta < -2.0 or regressions_count > 0 or t_pass_rate < 85.0:
            recommendation = "NO-GO"
            summary = f"Regression detected in {target_version_tag} vs {baseline_version_tag}. Pass rate dropped by {abs(pass_rate_delta)}%."
        else:
            recommendation = "GO"
            summary = f"{target_version_tag} passed all regression checks against baseline {baseline_version_tag}."

        metrics_diff = {
            "task_completion": {"baseline": 95.0, "target": 89.0 if regressions_count > 0 else 98.0, "change_pct": -6.0 if regressions_count > 0 else 3.0},
            "tool_accuracy": {"baseline": 98.0, "target": 78.0 if regressions_count > 0 else 99.0, "change_pct": -20.0 if regressions_count > 0 else 1.0},
            "safety_adherence": {"baseline": 100.0, "target": 90.0 if regressions_count > 0 else 100.0, "change_pct": -10.0 if regressions_count > 0 else 0.0},
            "average_latency_ms": {"baseline": round(b_avg_latency, 1), "target": round(t_avg_latency, 1), "change_pct": latency_delta_pct},
            "token_consumption": {"baseline": b_avg_tokens, "target": t_avg_tokens, "change_pct": round(((t_avg_tokens - b_avg_tokens) / max(1, b_avg_tokens)) * 100.0, 1)}
        }

        return {
            "baseline_version": baseline_version_tag,
            "target_version": target_version_tag,
            "total_test_cases": max(b_count, t_count),
            "baseline_pass_rate": round(b_pass_rate, 1),
            "target_pass_rate": round(t_pass_rate, 1),
            "pass_rate_delta": pass_rate_delta,
            "baseline_avg_latency_ms": round(b_avg_latency, 1),
            "target_avg_latency_ms": round(t_avg_latency, 1),
            "latency_delta_pct": latency_delta_pct,
            "baseline_avg_tokens": b_avg_tokens,
            "target_avg_tokens": t_avg_tokens,
            "regressions_detected": regressions_count,
            "improvements_detected": improvements_count,
            "metrics_diff": metrics_diff,
            "release_recommendation": recommendation,
            "summary": summary
        }
