#!/usr/bin/env python3
"""Replay captured Qwen stop requests from tools/network.txt.

Usage examples:
  python tools/test_stop_from_network.py --dry-run
  python tools/test_stop_from_network.py --index 0
  python tools/test_stop_from_network.py --index all --target worker
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

STOP_PATH_FRAGMENT = "/api/v2/chat/completions/stop"
DEFAULT_WORKER_BASE = "https://cors-bypass.quotesiaofficial.workers.dev"


@dataclass
class CapturedRequest:
    index: int
    url: str
    method: str
    headers: dict[str, str]
    body_raw: str
    body_json: dict[str, Any] | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Replay captured stop requests from network trace.")
    parser.add_argument(
        "--network",
        default="tools/network.txt",
        help="Path to the captured network file (default: tools/network.txt)",
    )
    parser.add_argument(
        "--index",
        default="all",
        help="Which stop request to replay: 'all' or numeric index (0-based)",
    )
    parser.add_argument(
        "--target",
        choices=["direct", "worker"],
        default="direct",
        help="Send request directly to chat.qwen.ai or via worker route",
    )
    parser.add_argument(
        "--worker-base",
        default=DEFAULT_WORKER_BASE,
        help="Worker base URL used when --target worker",
    )
    parser.add_argument(
        "--strip-cookie",
        action="store_true",
        help="Drop Cookie header before replay (useful for safe dry experiments)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only parse and print details, do not send network requests",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=25.0,
        help="Network timeout in seconds (default: 25)",
    )
    return parser.parse_args()


def decode_body_string(body_escaped: str) -> str:
    return str(body_escaped or "")


def find_matching_brace(text: str, start_index: int) -> int:
    depth = 0
    in_string = False
    escaped = False

    for index in range(start_index, len(text)):
        char = text[index]

        if in_string:
            if escaped:
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue
        if char == "{":
            depth += 1
            continue
        if char == "}":
            depth -= 1
            if depth == 0:
                return index

    raise ValueError("Unbalanced braces while parsing fetch options object.")


def parse_fetch_blocks(raw_text: str) -> list[tuple[str, dict[str, Any]]]:
    blocks: list[tuple[str, dict[str, Any]]] = []
    cursor = 0

    while True:
        fetch_index = raw_text.find('fetch("', cursor)
        if fetch_index == -1:
            break

        url_start = fetch_index + len('fetch("')
        url_end = raw_text.find('"', url_start)
        if url_end == -1:
            break
        url = raw_text[url_start:url_end]

        options_start = raw_text.find("{", url_end)
        if options_start == -1:
            break
        options_end = find_matching_brace(raw_text, options_start)
        options_text = raw_text[options_start:options_end + 1]

        try:
            options = json.loads(options_text)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Unable to parse fetch options near index {fetch_index}: {exc}") from exc

        blocks.append((url, options))
        cursor = options_end + 1

    return blocks


def parse_captured_requests(raw_text: str) -> list[CapturedRequest]:
    parsed_blocks = parse_fetch_blocks(raw_text)
    requests: list[CapturedRequest] = []
    for idx, (url, options) in enumerate(parsed_blocks):
        method = str(options.get("method") or "GET").strip().upper()
        headers_raw = options.get("headers")
        headers = headers_raw if isinstance(headers_raw, dict) else {}
        body_value = options.get("body")
        body_raw = decode_body_string(body_value) if isinstance(body_value, str) else ""
        body_json: dict[str, Any] | None = None
        try:
            parsed_body = json.loads(body_raw)
            if isinstance(parsed_body, dict):
                body_json = parsed_body
        except json.JSONDecodeError:
            body_json = None

        requests.append(
            CapturedRequest(
                index=idx,
                url=url,
                method=method,
                headers={str(key): str(value) for key, value in headers.items()},
                body_raw=body_raw,
                body_json=body_json,
            )
        )
    return requests


def select_stop_requests(all_requests: list[CapturedRequest]) -> list[CapturedRequest]:
    return [request for request in all_requests if STOP_PATH_FRAGMENT in request.url]


def summarize_stop_request(request: CapturedRequest) -> str:
    parsed = urlparse(request.url)
    query = parse_qs(parsed.query)
    query_chat_id = (query.get("chat_id") or [""])[0]
    body_chat_id = ""
    body_response_id = ""
    if request.body_json:
        body_chat_id = str(request.body_json.get("chat_id") or "").strip()
        body_response_id = str(request.body_json.get("response_id") or "").strip()

    present_headers = [
        key
        for key in [
            "accept",
            "bx-ua",
            "bx-umidtoken",
            "bx-v",
            "source",
            "timezone",
            "x-accel-buffering",
            "x-request-id",
            "cookie",
            "referer",
        ]
        if any(existing.lower() == key for existing in request.headers)
    ]

    return (
        f"stop#{request.index}: chat_id(query)={query_chat_id} "
        f"chat_id(body)={body_chat_id} response_id={body_response_id} "
        f"headers={','.join(present_headers)}"
    )


def header_get(headers: dict[str, str], key: str, default: str = "") -> str:
    for existing_key, value in headers.items():
        if existing_key.lower() == key.lower():
            return value
    return default


def filter_headers(headers: dict[str, str], strip_cookie: bool) -> dict[str, str]:
    blocked = {"content-length", "host", ":authority", ":method", ":path", ":scheme"}
    result: dict[str, str] = {}
    for key, value in headers.items():
        lowered = key.lower().strip()
        if lowered in blocked:
            continue
        if strip_cookie and lowered == "cookie":
            continue
        result[key] = value
    return result


def map_to_worker_url(direct_url: str, worker_base: str) -> str:
    parsed = urlparse(direct_url)
    base = worker_base.rstrip("/")
    query_suffix = f"?{parsed.query}" if parsed.query else ""
    return f"{base}/x7a9/stop{query_suffix}"


def replay_one(
    request: CapturedRequest,
    *,
    target: str,
    worker_base: str,
    strip_cookie: bool,
    timeout: float,
) -> tuple[int, str, str]:
    url = request.url if target == "direct" else map_to_worker_url(request.url, worker_base)
    headers = filter_headers(request.headers, strip_cookie=strip_cookie)

    if target == "worker":
        # Worker does not need Qwen origin/referer values.
        headers.pop("origin", None)

    data = request.body_raw.encode("utf-8")
    req = Request(url=url, data=data, method=request.method)
    for key, value in headers.items():
        req.add_header(key, value)

    try:
        with urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            return response.status, header_get(dict(response.headers), "content-type", ""), body
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        return error.code, header_get(dict(error.headers or {}), "content-type", ""), body
    except URLError as error:
        raise RuntimeError(f"Network error while replaying request: {error}") from error


def resolve_selected_requests(stop_requests: list[CapturedRequest], index_arg: str) -> list[CapturedRequest]:
    if not stop_requests:
        return []
    if index_arg.strip().lower() == "all":
        return stop_requests

    try:
        target = int(index_arg)
    except ValueError as exc:
        raise ValueError("--index must be 'all' or a non-negative integer") from exc

    if target < 0 or target >= len(stop_requests):
        raise ValueError(f"--index out of range. Found {len(stop_requests)} stop requests.")
    return [stop_requests[target]]


def main() -> int:
    args = parse_args()
    network_path = Path(args.network)
    if not network_path.exists():
        print(f"[error] network file not found: {network_path}")
        return 2

    raw_text = network_path.read_text(encoding="utf-8", errors="replace")
    captured_requests = parse_captured_requests(raw_text)
    stop_requests = select_stop_requests(captured_requests)

    print(f"Captured requests parsed: {len(captured_requests)}")
    print(f"Stop requests found: {len(stop_requests)}")
    if not stop_requests:
        return 1

    for request in stop_requests:
        print(summarize_stop_request(request))

    try:
        selected = resolve_selected_requests(stop_requests, args.index)
    except ValueError as error:
        print(f"[error] {error}")
        return 2

    if args.dry_run:
        print("Dry run complete. No requests sent.")
        return 0

    for request in selected:
        print("-" * 80)
        print(f"Replaying stop#{request.index} target={args.target}")
        status, content_type, body = replay_one(
            request,
            target=args.target,
            worker_base=args.worker_base,
            strip_cookie=args.strip_cookie,
            timeout=args.timeout,
        )
        preview = body[:420].replace("\n", "\\n")
        print(f"status={status}")
        print(f"content-type={content_type}")
        print(f"body-preview={preview}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
