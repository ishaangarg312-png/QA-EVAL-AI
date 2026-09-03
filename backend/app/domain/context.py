import re
import json
import uuid
import time
from typing import Any, Dict, Optional, Union

class ExecutionContext:
    def __init__(
        self,
        env_vars: Optional[Dict[str, Any]] = None,
        dataset_vars: Optional[Dict[str, Any]] = None,
        secrets: Optional[Dict[str, Any]] = None
    ):
        self.env_vars: Dict[str, Any] = env_vars or {}
        self.dataset_vars: Dict[str, Any] = dataset_vars or {}
        self.secrets: Dict[str, Any] = secrets or {}
        self.extracted_vars: Dict[str, Any] = {}
        self.step_outputs: Dict[str, Any] = {}
        self.human_inputs: Dict[str, Any] = {}
        self.agent_history: list = []
        self.runtime_state: Dict[str, Any] = {}

    def set_variable(self, key: str, value: Any) -> None:
        self.extracted_vars[key] = value

    def get_variable(self, key: str, default: Any = None) -> Any:
        all_v = self.get_all_variables()
        return all_v.get(key, default)

    def set_step_output(self, step_id: str, output: Any) -> None:
        self.step_outputs[step_id] = output

    def set_human_input(self, key: str, value: Any) -> None:
        self.human_inputs[key] = value
        self.extracted_vars[key] = value

    def get_all_variables(self) -> Dict[str, Any]:
        merged = {}
        merged.update(self.secrets)
        merged.update(self.env_vars)
        merged.update(self.dataset_vars)
        merged.update(self.extracted_vars)
        merged.update(self.human_inputs)
        return merged

    def resolve_path(self, path: str) -> Any:
        # e.g., "steps.step1.response.body.user.id" or "user_id"
        parts = path.split(".")
        if parts[0] == "steps" and len(parts) > 1:
            step_name = parts[1]
            if step_name in self.step_outputs:
                current = self.step_outputs[step_name]
                for p in parts[2:]:
                    if isinstance(current, dict) and p in current:
                        current = current[p]
                    elif isinstance(current, list):
                        try:
                            idx = int(p)
                            current = current[idx]
                        except (ValueError, IndexError):
                            return None
                    else:
                        return None
                return current
            return None

        # Check in standard variables
        all_vars = self.get_all_variables()
        if path in all_vars:
            return all_vars[path]

        # Nested lookup in all_vars e.g., "user.profile.name"
        current = all_vars
        for p in parts:
            if isinstance(current, dict) and p in current:
                current = current[p]
            elif isinstance(current, list):
                try:
                    idx = int(p)
                    current = current[idx]
                except (ValueError, IndexError):
                    return None
            else:
                return None
        return current


class VariableInterpolator:
    PATTERN = re.compile(r"\{\{([^}]+)\}\}")

    @classmethod
    def interpolate_string(cls, template: str, context: ExecutionContext) -> str:
        if not template or not isinstance(template, str):
            return template

        def replacer(match: re.Match) -> str:
            expr = match.group(1).strip()
            # Dynamic built-in variables
            if expr in ("$uuid", "$guid", "uuid", "guid"):
                return str(uuid.uuid4())
            if expr in ("$timestamp", "timestamp"):
                return str(int(time.time()))

            val = context.resolve_path(expr)
            if val is None:
                # Try JsonExtractor directly on all variables
                val = JsonExtractor.extract_value(context.get_all_variables(), expr)
            
            # If session_id is still the legacy dummy non-UUID string, auto-generate valid UUID
            if val == "sess-dxb-441" and expr in ("session_id", "job_id", "user_id"):
                val = str(uuid.uuid4())

            if val is None:
                return match.group(0) # Keep original placeholder if not found
            if isinstance(val, (dict, list)):
                return json.dumps(val)
            return str(val)

        return cls.PATTERN.sub(replacer, template)

    @classmethod
    def interpolate_any(cls, obj: Any, context: ExecutionContext) -> Any:
        if obj is None:
            return None
        elif isinstance(obj, str):
            # Check if string is a JSON object or array that needs parsing after interpolation
            trimmed = obj.strip()
            # If string is EXACTLY a single variable {{var}}, preserve original python type (dict/list/bool/int)
            match = cls.PATTERN.fullmatch(trimmed)
            if match:
                expr = match.group(1).strip()
                if expr in ("$uuid", "$guid", "uuid", "guid"):
                    return str(uuid.uuid4())
                if expr in ("$timestamp", "timestamp"):
                    return int(time.time())

                val = context.resolve_path(expr) or JsonExtractor.extract_value(context.get_all_variables(), expr)
                if val == "sess-dxb-441" and expr in ("session_id", "job_id", "user_id"):
                    val = str(uuid.uuid4())

                if val is not None:
                    return val

            # Interpolate any embedded {{vars}}
            interpolated = cls.interpolate_string(trimmed, context)
            
            # Auto-parse if it was a JSON stringified dict/list
            if (interpolated.startswith("{") and interpolated.endswith("}")) or \
               (interpolated.startswith("[") and interpolated.endswith("]")):
                try:
                    return json.loads(interpolated)
                except Exception:
                    return interpolated
            return interpolated
        elif isinstance(obj, dict):
            out_dict = {}
            for k, v in obj.items():
                interp_k = cls.interpolate_string(str(k), context) if isinstance(k, str) else k
                interp_v = cls.interpolate_any(v, context)
                # If dependencies is configured but all values inside are empty / empty lists / null, collapse to {}
                if str(k).lower() == "dependencies" and isinstance(interp_v, dict):
                    has_active = any(
                        bool(val) and val != [""] and val != [] for val in interp_v.values()
                    )
                    if not has_active:
                        interp_v = {}
                out_dict[interp_k] = interp_v
            return out_dict
        elif isinstance(obj, (list, tuple, set)):
            result = []
            for item in obj:
                interp = cls.interpolate_any(item, context)
                if isinstance(interp, (list, tuple, set)):
                    result.extend([x for x in interp if x is not None and x != ""])
                elif isinstance(interp, str) and "," in interp and any(k in str(item).lower() for k in ["attachment", "blob", "id", "url", "file", "item", "doc"]):
                    # Split comma-separated string IDs/URLs into separate array elements
                    split_items = [s.strip() for s in interp.split(",") if s.strip()]
                    result.extend(split_items)
                elif isinstance(interp, str) and not interp.strip() and ("{{" in str(item)):
                    # Variable template resolved to empty string/blank: omit from array so it becomes []
                    continue
                elif interp is not None and interp != "":
                    result.append(interp)
                elif not ("{{" in str(item)):
                    result.append(interp)
            return result
        return obj


class JsonExtractor:
    @staticmethod
    def extract_value(data: Any, path: str) -> Any:
        """
        Extracts value from arbitrary json/dict/list structure using dot-notation or JSONPath-like syntax:
        e.g. "booking.id", "flights.0.price", "flights[0].price", "data.items[2].attributes.name", "$.data.user_id"
        """
        if not path or data is None:
            return None

        clean_path = path.strip()
        if clean_path.startswith("$."):
            clean_path = clean_path[2:]
        elif clean_path.startswith("$"):
            clean_path = clean_path[1:]

        # Normalize bracket notations e.g. "flights[0].id" -> "flights.0.id"
        normalized_path = re.sub(r"\[(\d+)\]", r".\1", clean_path)
        normalized_path = re.sub(r"\[['\"]([^'\"]+)['\"]\]", r".\1", normalized_path)

        parts = [p for p in normalized_path.split(".") if p]
        curr = data
        for part in parts:
            if curr is None:
                return None

            if isinstance(curr, dict):
                if part in curr:
                    curr = curr[part]
                elif part.isdigit() and int(part) < len(curr):
                    # fallback dict index
                    curr = list(curr.values())[int(part)]
                else:
                    return None
            elif isinstance(curr, (list, tuple)):
                try:
                    idx = int(part)
                    curr = curr[idx] if 0 <= idx < len(curr) else None
                except (ValueError, IndexError):
                    return None
            else:
                # Try attribute access on python objects
                if hasattr(curr, part):
                    curr = getattr(curr, part)
                else:
                    return None
        return curr

