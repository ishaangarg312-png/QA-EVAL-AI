import time
import re
from typing import Dict, Any, Optional
from app.domain.context import ExecutionContext, JsonExtractor

class ChatUrlHandler:
    @classmethod
    def _interpolate_string(cls, template: str, context: ExecutionContext) -> str:
        """Interpolates variables from context with support for both {var} and {{var}} syntax."""
        if not template:
            return ""

        all_vars = context.get_all_variables()
        step_outputs = getattr(context, "step_outputs", {}) or {}

        # Combine all variables and look into step outputs
        flat_pool: Dict[str, Any] = {}
        if isinstance(all_vars, dict):
            flat_pool.update(all_vars)

        # Flatten step outputs for easy lookup
        for step_k, step_v in step_outputs.items():
            if isinstance(step_v, dict):
                flat_pool[step_k] = step_v
                # Also promote top-level keys like session_id, message_id, etc.
                for sub_k, sub_v in step_v.items():
                    if sub_k not in flat_pool and not isinstance(sub_v, (dict, list)):
                        flat_pool[sub_k] = sub_v
                    elif sub_k in ("captured_variables", "response", "body") and isinstance(sub_v, dict):
                        for inner_k, inner_v in sub_v.items():
                            if inner_k not in flat_pool and not isinstance(inner_v, (dict, list)):
                                flat_pool[inner_k] = inner_v

        # Replace double bracket {{var}} first
        def replace_double(match):
            key = match.group(1).strip()
            # Try JSON path extraction
            if "." in key:
                val = JsonExtractor.extract_value(step_outputs, key)
                if val is None:
                    val = JsonExtractor.extract_value(all_vars, key)
                if val is not None:
                    return str(val)

            # Try direct lookup
            if key in flat_pool and flat_pool[key] is not None:
                return str(flat_pool[key])
            if key.lower() in flat_pool and flat_pool[key.lower()] is not None:
                return str(flat_pool[key.lower()])

            # Case-insensitive search across flat_pool
            for fk, fv in flat_pool.items():
                if fk.lower() == key.lower() and fv is not None:
                    return str(fv)

            return match.group(0)

        result = re.sub(r'\{\{\s*([^{}]+?)\s*\}\}', replace_double, template)

        # Replace single bracket {var}
        def replace_single(match):
            key = match.group(1).strip()
            # Skip if it looks like regex or special chars
            if not re.match(r'^[a-zA-Z0-9_.\-]+$', key):
                return match.group(0)

            if "." in key:
                val = JsonExtractor.extract_value(step_outputs, key)
                if val is None:
                    val = JsonExtractor.extract_value(all_vars, key)
                if val is not None:
                    return str(val)

            if key in flat_pool and flat_pool[key] is not None:
                return str(flat_pool[key])

            for fk, fv in flat_pool.items():
                if fk.lower() == key.lower() and fv is not None:
                    return str(fv)

            return match.group(0)

        result = re.sub(r'\{([^{}]+?)\}', replace_single, result)
        return result

    @classmethod
    async def execute(cls, node_config: Dict[str, Any], context: ExecutionContext) -> Dict[str, Any]:
        start = time.perf_counter()
        node_config = node_config or {}

        base_url_tmpl = str(node_config.get("base_url") or "").strip()
        query_tmpl = str(node_config.get("query_template") or node_config.get("query_params") or node_config.get("query") or "").strip()
        var_name = str(node_config.get("variable_name") or "chat_url").strip() or "chat_url"

        # Interpolate variables in both base_url and query template
        resolved_base = cls._interpolate_string(base_url_tmpl, context)
        resolved_query = cls._interpolate_string(query_tmpl, context)

        # Merge base_url + dynamic query together cleanly
        if not resolved_base:
            merged_url = resolved_query
        elif not resolved_query:
            merged_url = resolved_base
        else:
            if resolved_query.startswith("/"):
                # Path extension (e.g. /conversation/123)
                merged_url = f"{resolved_base.rstrip('/')}/{resolved_query.lstrip('/')}"
            elif resolved_query.startswith("?") or resolved_query.startswith("&"):
                clean_query = resolved_query.lstrip("?&")
                sep = "&" if "?" in resolved_base else "?"
                merged_url = f"{resolved_base.rstrip('?&')}{sep}{clean_query}"
            else:
                # Query without leading ? or &, e.g. "id=123&user=456"
                sep = "&" if "?" in resolved_base else "?"
                merged_url = f"{resolved_base.rstrip('?&')}{sep}{resolved_query}"

        # Register in context
        context.set_variable(var_name, merged_url)
        if var_name != "chat_url":
            context.set_variable("chat_url", merged_url)

        duration_ms = round((time.perf_counter() - start) * 1000.0, 2)

        return {
            "status": "SUCCESS",
            "chat_url": merged_url,
            "url": merged_url,
            "base_url": resolved_base,
            "query_template": query_tmpl,
            "resolved_query": resolved_query,
            "variable_name": var_name,
            "captured_variables": {
                var_name: merged_url,
                "chat_url": merged_url
            },
            "response": {
                "chat_url": merged_url,
                "url": merged_url,
                "base_url": resolved_base,
                "query": resolved_query
            },
            "duration_ms": duration_ms
        }
