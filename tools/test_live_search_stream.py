#!/usr/bin/env python3
"""
Smoke test for live-search parsing behavior using Qwen-like SSE event shapes.

Why this exists:
- qwen_chat.py handles search metadata in both:
  1) choices[0].delta.name == "web_search"
  2) response.info.web_search_info (authoritative URLs)
- Frontend should show a live "searching" phase and collect clickable sources.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, List
from urllib.parse import urlparse


URL_PATTERN = re.compile(r"https?://[^\s<>)\]\"']+", re.IGNORECASE)
CITATION_PATTERN = re.compile(r"\[\[(\d+)\]\]")


@dataclass
class StreamState:
    phase: str = ""
    reply: str = ""
    search_sources: List[Dict[str, str]] = None

    def __post_init__(self) -> None:
        if self.search_sources is None:
            self.search_sources = []


def normalize_url(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        parsed = urlparse(text)
    except Exception:
        return ""
    if parsed.scheme not in ("http", "https"):
        return ""
    if not parsed.netloc:
        return ""
    return text


def normalize_source(entry: Any, index: int) -> Dict[str, str] | None:
    source = entry if isinstance(entry, dict) else {"url": entry}
    url = normalize_url(
        source.get("url")
        or source.get("link")
        or source.get("href")
        or source.get("source_url")
        or source.get("sourceUrl")
        or source.get("uri")
        or source.get("reference")
        or source.get("ref")
    )
    if not url:
        return None
    title = str(
        source.get("title")
        or source.get("name")
        or source.get("site_name")
        or source.get("siteName")
        or source.get("domain")
        or source.get("host")
        or ""
    ).strip()
    if not title:
        title = f"Source {index + 1}"
    return {"url": url, "title": title}


def unique_sources(items: List[Any]) -> List[Dict[str, str]]:
    seen = set()
    result: List[Dict[str, str]] = []
    for idx, item in enumerate(items):
        normalized = normalize_source(item, idx)
        if not normalized:
            continue
        url = normalized["url"]
        if url in seen:
            continue
        seen.add(url)
        result.append(normalized)
    return result


def collect_sources(value: Any, out: List[Dict[str, str]], depth: int = 0) -> None:
    if depth > 6 or value is None:
        return

    if isinstance(value, str):
        for match in URL_PATTERN.findall(value):
            out.append({"url": match})
        return

    if isinstance(value, (int, float, bool)):
        return

    if isinstance(value, list):
        for item in value:
            collect_sources(item, out, depth + 1)
        return

    if not isinstance(value, dict):
        return

    direct = normalize_source(value, len(out))
    if direct:
        out.append(direct)

    for child in value.values():
        collect_sources(child, out, depth + 1)


def has_web_search_signal(value: Any, depth: int = 0) -> bool:
    if depth > 6 or value is None:
        return False

    if isinstance(value, list):
        return any(has_web_search_signal(item, depth + 1) for item in value)

    if not isinstance(value, dict):
        return False

    if str(value.get("name", "")).lower() == "web_search":
        return True

    web_info = value.get("web_search_info")
    if isinstance(web_info, list) and len(web_info) > 0:
        return True

    response_info = value.get("response.info")
    if response_info is not None and has_web_search_signal(response_info, depth + 1):
        return True

    response = value.get("response")
    if isinstance(response, dict) and has_web_search_signal(response.get("info"), depth + 1):
        return True

    response_info_alt = value.get("response_info")
    if response_info_alt is not None and has_web_search_signal(response_info_alt, depth + 1):
        return True

    return any(has_web_search_signal(child, depth + 1) for child in value.values())


def parse_data_line(data_text: str, state: StreamState) -> Dict[str, Any]:
    try:
        chunk = json.loads(data_text)
    except json.JSONDecodeError:
        return {"changed": False, "reason": "invalid-json"}

    response_info = None
    if isinstance(chunk, dict):
        response_info = chunk.get("response.info")
        if response_info is None:
            response = chunk.get("response")
            if isinstance(response, dict):
                response_info = response.get("info")
        if response_info is None:
            response_info = chunk.get("response_info")

    if isinstance(response_info, dict):
        gathered: List[Dict[str, str]] = []
        collect_sources(response_info, gathered)
        collect_sources(chunk, gathered)
        prior_count = len(state.search_sources)
        state.search_sources = unique_sources(state.search_sources + gathered)
        signal = has_web_search_signal(response_info) or has_web_search_signal(chunk)
        if signal:
            entering = state.phase != "searching"
            state.phase = "searching"
            return {
                "changed": entering or len(state.search_sources) > prior_count,
                "reason": "response.info-search-signal",
            }

    choices = chunk.get("choices") if isinstance(chunk, dict) else None
    choice = choices[0] if isinstance(choices, list) and choices else None
    if isinstance(choice, dict):
        delta = choice.get("delta")
        if isinstance(delta, dict) and delta.get("name") == "web_search":
            gathered = []
            collect_sources(delta, gathered)
            prior_count = len(state.search_sources)
            state.search_sources = unique_sources(state.search_sources + gathered)
            entering = state.phase != "searching"
            state.phase = "searching"
            return {
                "changed": entering or len(state.search_sources) > prior_count,
                "reason": "delta-web_search",
            }

        phase = str(delta.get("phase", "")) if isinstance(delta, dict) else ""
        content = str(delta.get("content", "")) if isinstance(delta, dict) else ""
        if content:
            state.reply += content
            if phase:
                state.phase = phase
            elif state.phase != "answer":
                state.phase = "answer"
            return {"changed": True, "reason": "answer-content"}

    return {"changed": False, "reason": "no-visual-delta"}


def inject_citations(text: str, sources: List[Dict[str, str]]) -> str:
    if not text or not sources:
        return text

    def replace(match: re.Match[str]) -> str:
        idx = int(match.group(1)) - 1
        if 0 <= idx < len(sources):
            return f"[{idx + 1}]({sources[idx]['url']})"
        return match.group(0)

    return CITATION_PATTERN.sub(replace, text)


def run_fixture() -> None:
    fixture_lines = [
        '{"choices":[{"delta":{"name":"web_search","extra":{"web_search_info":[{"title":"Reuters latest headlines"},{"title":"Associated Press world news"}]}}}]}',
        '{"response.info":{"web_search_info":[{"title":"Reuters World","url":"https://www.reuters.com/world/"},{"title":"AP World News","url":"https://apnews.com/hub/world-news"}]}}',
        '{"choices":[{"delta":{"phase":"answer","content":"Famous article websites include Reuters [[1]] and AP [[2]]."}}]}',
    ]

    state = StreamState()
    timeline = []

    for index, data_text in enumerate(fixture_lines, 1):
        result = parse_data_line(data_text, state)
        show_search_block = (state.phase == "searching") or bool(state.search_sources)
        timeline.append(
            {
                "event": index,
                "reason": result["reason"],
                "changed": result["changed"],
                "phase": state.phase,
                "sources": len(state.search_sources),
                "show_search_block": show_search_block,
            }
        )

    linked_reply = inject_citations(state.reply, state.search_sources)

    assert timeline[0]["phase"] == "searching", "Expected search phase after web_search signal"
    assert timeline[0]["show_search_block"] is True, "Expected live search block visibility during search phase"
    assert timeline[1]["sources"] >= 2, "Expected sources extracted from response.info.web_search_info"
    assert "[1](https://www.reuters.com/world/)" in linked_reply, "Citation [1] should map to first source URL"
    assert "[2](https://apnews.com/hub/world-news)" in linked_reply, "Citation [2] should map to second source URL"

    print("Live search fixture test: PASS")
    print("\nTimeline:")
    for row in timeline:
        print(
            f"  event={row['event']} reason={row['reason']} changed={row['changed']} "
            f"phase={row['phase']} sources={row['sources']} show_search_block={row['show_search_block']}"
        )

    print("\nReply with linked citations:")
    print(f"  {linked_reply}")


def main() -> None:
    run_fixture()


if __name__ == "__main__":
    main()
