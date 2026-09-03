import re
import math
from typing import Dict, Any, List, Optional
from collections import Counter

class SemanticCheckResult:
    def __init__(self, passed: bool, score: float, reason: str, evidence: List[str], violations: List[str]):
        self.passed = passed
        self.score = score
        self.reason = reason
        self.evidence = evidence
        self.violations = violations

class SemanticEvaluator:
    @staticmethod
    def _tokenize(text: str) -> List[str]:
        return [w.lower() for w in re.findall(r"\w+", text) if len(w) > 1]

    @classmethod
    def calculate_cosine_similarity(cls, text_a: str, text_b: str) -> float:
        tokens_a = cls._tokenize(text_a)
        tokens_b = cls._tokenize(text_b)
        if not tokens_a or not tokens_b:
            return 0.0

        vec_a = Counter(tokens_a)
        vec_b = Counter(tokens_b)

        intersection = set(vec_a.keys()) & set(vec_b.keys())
        numerator = sum(vec_a[x] * vec_b[x] for x in intersection)

        sum_a = sum(v ** 2 for v in vec_a.values())
        sum_b = sum(v ** 2 for v in vec_b.values())
        denominator = math.sqrt(sum_a) * math.sqrt(sum_b)

        if not denominator:
            return 0.0
        return float(numerator) / denominator

    @classmethod
    def evaluate(
        cls,
        actual_text: str,
        expected_intent_or_text: str,
        threshold: float = 0.65
    ) -> SemanticCheckResult:
        if not expected_intent_or_text:
            return SemanticCheckResult(True, 1.0, "No semantic reference provided.", [], [])

        sim = cls.calculate_cosine_similarity(actual_text, expected_intent_or_text)
        # Boost score slightly if key business tokens match (e.g. Dubai, Confirmed, Flight)
        actual_tokens = set(cls._tokenize(actual_text))
        expected_tokens = set(cls._tokenize(expected_intent_or_text))
        overlap = len(actual_tokens & expected_tokens) / max(1, len(expected_tokens))

        combined_score = min(1.0, (sim * 0.6) + (overlap * 0.4))
        passed = combined_score >= threshold

        evidence = [
            f"Semantic similarity score: {combined_score:.2f} (threshold: {threshold:.2f})",
            f"Key concept overlap: {len(actual_tokens & expected_tokens)}/{len(expected_tokens)} expected terms present"
        ]
        violations = [] if passed else [f"Semantic similarity {combined_score:.2f} below threshold {threshold:.2f}"]

        return SemanticCheckResult(
            passed=passed,
            score=combined_score,
            reason=f"Semantic evaluation {'PASSED' if passed else 'FAILED'} with {combined_score * 100:.1f}% alignment.",
            evidence=evidence,
            violations=violations
        )
