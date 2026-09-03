import re
import json
import time
import html
from typing import Dict, Any, List, Optional, Union
from bs4 import BeautifulSoup
from app.domain.context import ExecutionContext, JsonExtractor

class CaptureHandler:
    """
    Production-grade Result Capture Handler.
    Captures, extracts, parses, and normalizes responses across:
    - API JSON responses
    - Email / Web HTML documents & fragments
    - Multi-node step outputs
    - Plain text, Regex patterns, OTPs, verification URLs
    """

    @classmethod
    def _extract_text_from_html(cls, html_content: str) -> str:
        if not html_content or not isinstance(html_content, str):
            return str(html_content or "")
        try:
            soup = BeautifulSoup(html_content, "html.parser")
            # Remove scripts, styles, head, meta
            for element in soup(["script", "style", "head", "meta", "noscript"]):
                element.decompose()
            text = soup.get_text(separator="\n", strip=True)
            # Collapse excessive newlines
            text = re.sub(r"\n{3,}", "\n\n", text)
            return text
        except Exception:
            clean = re.sub(r"<[^>]+>", " ", html_content)
            return html.unescape(clean).strip()

    @classmethod
    def _extract_links_from_html(cls, html_content: str, filter_keyword: Optional[str] = None) -> List[str]:
        if not html_content or not isinstance(html_content, str):
            return []
        links: List[str] = []
        try:
            soup = BeautifulSoup(html_content, "html.parser")
            for a in soup.find_all("a", href=True):
                href = a["href"].strip()
                if href and (href.startswith("http://") or href.startswith("https://") or href.startswith("/")):
                    if filter_keyword:
                        if re.search(filter_keyword, href, re.IGNORECASE) or re.search(filter_keyword, a.get_text(), re.IGNORECASE):
                            links.append(href)
                    else:
                        links.append(href)
        except Exception:
            pass

        # Fallback raw regex search for URLs in text/HTML
        if not links:
            raw_urls = re.findall(r'https?://[^\s<>"\'\])]+', html_content)
            for url in raw_urls:
                if filter_keyword:
                    if re.search(filter_keyword, url, re.IGNORECASE):
                        links.append(url)
                else:
                    links.append(url)
        return list(dict.fromkeys(links))  # preserve order, unique

    @classmethod
    def _extract_css_selector(cls, html_content: str, selector: str, extract_attr: Optional[str] = None) -> Any:
        if not html_content or not isinstance(html_content, str) or not selector:
            return None
        try:
            soup = BeautifulSoup(html_content, "html.parser")
            elements = soup.select(selector)
            if not elements:
                return None
            
            results = []
            for el in elements:
                if extract_attr:
                    val = el.get(extract_attr)
                    if val:
                        results.append(str(val).strip())
                else:
                    text = el.get_text(separator=" ", strip=True)
                    results.append(text)
            
            if len(results) == 1:
                return results[0]
            return results if results else None
        except Exception:
            return None

    @classmethod
    def _extract_regex(cls, text_content: str, pattern: str) -> Any:
        if not text_content or not pattern:
            return None
        if not isinstance(text_content, str):
            text_content = json.dumps(text_content) if isinstance(text_content, (dict, list)) else str(text_content)
        
        try:
            match = re.search(pattern, text_content, re.IGNORECASE | re.MULTILINE)
            if match:
                if match.groupdict():
                    return match.groupdict()
                if match.groups():
                    return match.group(1) if len(match.groups()) == 1 else match.groups()
                return match.group(0)
            
            all_matches = re.findall(pattern, text_content, re.IGNORECASE | re.MULTILINE)
            if all_matches:
                return all_matches[0] if len(all_matches) == 1 else all_matches

            # If no match and text contains HTML tags, try stripping HTML and matching again
            if "<" in text_content and ">" in text_content:
                clean_text = cls._extract_text_from_html(text_content)
                match_clean = re.search(pattern, clean_text, re.IGNORECASE | re.MULTILINE)
                if match_clean:
                    if match_clean.groupdict():
                        return match_clean.groupdict()
                    if match_clean.groups():
                        return match_clean.group(1) if len(match_clean.groups()) == 1 else match_clean.groups()
                    return match_clean.group(0)

            return None
        except Exception:
            return None

    @classmethod
    def _get_candidate_text_strings(cls, source_data: Any, context: ExecutionContext) -> List[str]:
        candidates: List[str] = []
        if isinstance(source_data, str) and source_data.strip():
            candidates.append(source_data)
            for k in ["body", "response", "html", "email_html", "html_body", "raw_html", "content", "message"]:
                if k in source_data and isinstance(source_data[k], str) and source_data[k].strip():
                    candidates.append(source_data[k])
                elif k in source_data and isinstance(source_data[k], dict):
                    for nk in ["html_content", "content", "body", "html", "message"]:
                        if nk in source_data[k] and isinstance(source_data[k][nk], str) and source_data[k][nk].strip():
                            candidates.append(source_data[k][nk])
                    if "metadata" in source_data[k] and isinstance(source_data[k]["metadata"], dict):
                        for mk in ["html_content", "content", "html"]:
                            if mk in source_data[k]["metadata"] and isinstance(source_data[k]["metadata"][mk], str) and source_data[k]["metadata"][mk].strip():
                                candidates.append(source_data[k]["metadata"][mk])
            
            # Check inside steps
            if "steps" in source_data and isinstance(source_data["steps"], dict):
                for step_v in reversed(list(source_data["steps"].values())):
                    if isinstance(step_v, str) and step_v.strip():
                        candidates.append(step_v)
                    elif isinstance(step_v, dict):
                        for k in ["body", "response", "html", "email_html", "html_body", "raw_html", "content", "message"]:
                            if k in step_v and isinstance(step_v[k], str) and step_v[k].strip():
                                candidates.append(step_v[k])
        
        # Check context step_outputs
        for step_v in reversed(list(context.step_outputs.values())):
            if isinstance(step_v, str) and step_v.strip():
                candidates.append(step_v)
            elif isinstance(step_v, dict):
                for k in ["body", "response", "html", "email_html", "html_body", "raw_html", "content", "message"]:
                    if k in step_v and isinstance(step_v[k], str) and step_v[k].strip():
                        candidates.append(step_v[k])
                    elif k in step_v and isinstance(step_v[k], dict):
                        if "metadata" in step_v[k] and isinstance(step_v[k]["metadata"], dict):
                            for mk in ["html_content", "content", "html"]:
                                if mk in step_v[k]["metadata"] and isinstance(step_v[k]["metadata"][mk], str) and step_v[k]["metadata"][mk].strip():
                                    candidates.append(step_v[k]["metadata"][mk])

        if not candidates and source_data is not None and not isinstance(source_data, (dict, list)):
            candidates.append(str(source_data))

        return list(dict.fromkeys(candidates))

    @classmethod
    def _resolve_source_data(cls, source_mode: str, source_node_key: Optional[str], context: ExecutionContext) -> Any:
        source_mode = (source_mode or "ALL_PREVIOUS").upper()

        if source_mode == "SPECIFIC_NODE" and source_node_key:
            if source_node_key in context.step_outputs:
                return context.step_outputs[source_node_key]
            all_v = context.get_all_variables()
            if source_node_key in all_v:
                return all_v[source_node_key]

        if source_mode in ("EMAIL_HTML", "EMAIL_CONTEXT"):
            all_v = context.get_all_variables()
            for key in ["email_html", "html_body", "body_html", "email_body", "html", "content", "raw_html", "message"]:
                if key in all_v and isinstance(all_v[key], str) and ("<" in all_v[key] or "http" in all_v[key]):
                    return all_v[key]
            for step_id, step_val in reversed(list(context.step_outputs.items())):
                if isinstance(step_val, dict):
                    for k in ["email_html", "html_body", "body_html", "html", "content", "response", "body"]:
                        if k in step_val and isinstance(step_val[k], str) and "<" in step_val[k]:
                            return step_val[k]

        latest_steps = dict(context.step_outputs)
        merged_all = context.get_all_variables()
        return {
            **merged_all,
            "steps": latest_steps,
            "latest_step": list(latest_steps.values())[-1] if latest_steps else None
        }

    @classmethod
    async def execute(cls, node_config: Dict[str, Any], context: ExecutionContext) -> Dict[str, Any]:
        start = time.perf_counter()
        source_mode = node_config.get("source_mode", "ALL_PREVIOUS")
        source_node_key = node_config.get("source_node_key")
        rules = node_config.get("rules", [])
        
        if not rules and node_config.get("extractions"):
            rules = [
                {
                    "name": ext.get("variable_name"),
                    "target_variable": ext.get("variable_name"),
                    "mode": "JSON_PATH",
                    "expression": ext.get("json_path"),
                    "description": ext.get("description", "")
                }
                for ext in node_config.get("extractions", [])
            ]

        source_data = cls._resolve_source_data(source_mode, source_node_key, context)
        candidates = cls._get_candidate_text_strings(source_data, context)
        
        captured_results: Dict[str, Any] = {}
        rule_details: List[Dict[str, Any]] = []

        for rule in rules:
            rule_name = (rule.get("name") or rule.get("target_variable") or "captured_item").strip()
            target_var = (rule.get("target_variable") or rule_name).strip()
            mode = (rule.get("mode") or "JSON_PATH").upper()
            expr = (rule.get("expression") or "").strip()
            rule_source_node = rule.get("source_node_key") or source_node_key
            extract_attr = rule.get("extract_attr")

            rule_source_data = None
            if rule_source_node:
                if rule_source_node in context.step_outputs:
                    rule_source_data = context.step_outputs[rule_source_node]
                elif rule_source_node in context.get_all_variables():
                    rule_source_data = context.get_all_variables()[rule_source_node]
                else:
                    # Fuzzy match across step_outputs keys (node_key or label)
                    clean_target = re.sub(r'[^a-zA-Z0-9]', '', str(rule_source_node)).lower()
                    for step_k, step_v in context.step_outputs.items():
                        clean_k = re.sub(r'[^a-zA-Z0-9]', '', str(step_k)).lower()
                        if clean_k and (clean_k == clean_target or clean_target in clean_k or clean_k in clean_target):
                            rule_source_data = step_v
                            break
            elif not source_node_key:
                # If rule didn't have source_node_key, try to infer from rule target_variable or rule_name prefix
                clean_target = re.sub(r'[^a-zA-Z0-9]', '', str(target_var)).lower()
                for step_k, step_v in context.step_outputs.items():
                    clean_k = re.sub(r'[^a-zA-Z0-9]', '', str(step_k)).lower()
                    if clean_k and (clean_k in clean_target):
                        rule_source_data = step_v
                        break

            if rule_source_data is None:
                rule_source_data = source_data

            # Target data extraction using expression if present
            target_data = rule_source_data
            if expr and expr != "*":
                val = JsonExtractor.extract_value(rule_source_data, expr)
                if val is None and isinstance(rule_source_data, dict):
                    if "response" in rule_source_data:
                        val = JsonExtractor.extract_value(rule_source_data["response"], expr)
                    if val is None and "body" in rule_source_data:
                        val = JsonExtractor.extract_value(rule_source_data["body"], expr)
                    # Simple dot notation navigation e.g. "metadata.html_content" or "content"
                    if val is None:
                        curr = rule_source_data.get("response") if isinstance(rule_source_data.get("response"), dict) else rule_source_data
                        parts = expr.lstrip("$.").split(".")
                        for p in parts:
                            if isinstance(curr, dict) and p in curr:
                                curr = curr[p]
                            else:
                                curr = None
                                break
                        val = curr
                if val is not None:
                    target_data = val

            extracted_value = None

            if mode in ("JSON_PATH", "JSONPATH"):
                extracted_value = target_data if (expr and target_data is not rule_source_data) else JsonExtractor.extract_value(rule_source_data, expr)

            elif mode in ("HTML", "HTML_CONTENT", "RAW_HTML", "HTML_TEXT"):
                if isinstance(target_data, str) and target_data.strip():
                    extracted_value = target_data
                else:
                    rule_candidates = cls._get_candidate_text_strings(target_data if target_data is not rule_source_data else rule_source_data, context)
                    for text_sample in rule_candidates:
                        if "<html" in text_sample.lower() or "<body" in text_sample.lower() or "<div" in text_sample.lower():
                            extracted_value = text_sample
                            break
                    if not extracted_value and rule_candidates:
                        extracted_value = rule_candidates[0]
                    elif not extracted_value and target_data and not isinstance(target_data, dict):
                        extracted_value = str(target_data)

            elif mode in ("HTML_STRIP", "CLEAN_TEXT"):
                if isinstance(target_data, str) and target_data.strip():
                    extracted_value = cls._extract_text_from_html(target_data)
                else:
                    rule_candidates = cls._get_candidate_text_strings(target_data if target_data is not rule_source_data else rule_source_data, context)
                    for text_sample in rule_candidates:
                        extracted_value = cls._extract_text_from_html(text_sample)
                        if extracted_value:
                            break
                    if not extracted_value and target_data and not isinstance(target_data, dict):
                        extracted_value = str(target_data)

            elif mode in ("HTML_SELECTOR", "CSS_SELECTOR", "HTML_TAG"):
                rule_candidates = cls._get_candidate_text_strings(target_data if target_data is not rule_source_data else rule_source_data, context)
                for text_sample in rule_candidates:
                    extracted_value = cls._extract_css_selector(text_sample, expr, extract_attr)
                    if extracted_value:
                        break

            elif mode in ("HTML_LINKS", "EXTRACT_LINKS", "VERIFICATION_URL"):
                rule_candidates = cls._get_candidate_text_strings(target_data if target_data is not rule_source_data else rule_source_data, context)
                for text_sample in rule_candidates:
                    links = cls._extract_links_from_html(text_sample, expr if expr else None)
                    if links:
                        extracted_value = links[0] if len(links) == 1 else links
                        break

            elif mode in ("REGEX", "REGEX_MATCH", "OTP"):
                regex_pattern = expr if expr else r'(?:OTP|code|token|pin)[:\s]+([0-9A-Za-z_-]{4,12})'
                rule_candidates = cls._get_candidate_text_strings(target_data if target_data is not rule_source_data else rule_source_data, context)
                for text_sample in rule_candidates:
                    extracted_value = cls._extract_regex(text_sample, regex_pattern)
                    if extracted_value:
                        break

            elif mode in ("FULL_OUTPUT", "RAW_PAYLOAD", "PASSTHROUGH", "ENTIRE_RESPONSE", "FULL_RESPONSE"):
                if expr and target_data is not rule_source_data:
                    extracted_value = target_data
                elif isinstance(rule_source_data, dict):
                    extracted_value = rule_source_data.get("response") or rule_source_data.get("body") or rule_source_data
                else:
                    extracted_value = rule_source_data

            if extracted_value is not None:
                context.set_variable(target_var, extracted_value)
                captured_results[target_var] = extracted_value

            rule_details.append({
                "rule_name": rule_name,
                "target_variable": target_var,
                "mode": mode,
                "expression": expr,
                "extracted_value": extracted_value,
                "status": "CAPTURED" if extracted_value is not None else "NOT_FOUND"
            })

        duration_ms = round((time.perf_counter() - start) * 1000.0, 2)

        return {
            "status": "SUCCESS",
            "source_mode": source_mode,
            "captured_count": len([r for r in rule_details if r["status"] == "CAPTURED"]),
            "total_rules": len(rules),
            "captured_variables": captured_results,
            "rules_execution": rule_details,
            "response": captured_results,
            "duration_ms": duration_ms
        }
