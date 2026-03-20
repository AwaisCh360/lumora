#!/usr/bin/env python3
"""Live send->stop integration test against Qwen.

This script:
1) Logs into Qwen using an activated account from accounts.json.
2) Creates a new chat session.
3) Sends a long streaming prompt.
4) Calls /api/v2/chat/completions/stop when response_id appears.
5) Sends a follow-up prompt in the same session.

Usage:
  python tools/test_live_send_stop.py
  python tools/test_live_send_stop.py --account-number 1
  python tools/test_live_send_stop.py --account-number 1 --no-follow-up
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import requests


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run live send->stop test against Qwen.")
    parser.add_argument("--account-number", type=int, default=1, help="Activated account number from accounts.json")
    parser.add_argument("--no-follow-up", action="store_true", help="Skip follow-up message check")
    parser.add_argument("--timeout", type=float, default=120.0, help="Streaming read timeout in seconds")
    parser.add_argument("--stop-after-chars", type=int, default=80, help="Send stop after at least this many answer chars")
    parser.add_argument("--stop-after-seconds", type=float, default=1.0, help="Send stop once this many seconds elapsed and response_id exists")
    parser.add_argument("--follow-up-delay", type=float, default=0.0, help="Wait this many seconds before follow-up request")
    parser.add_argument(
        "--follow-up-parent-strategy",
        choices=["auto", "parent", "response", "none"],
        default="auto",
        help="Choose which parent id to use for follow-up",
    )
    return parser.parse_args()


def load_qwen_module(root_dir: Path):
    module_path = root_dir / "qwen_chat.py"
    if not module_path.exists():
        raise FileNotFoundError(f"qwen_chat.py not found at {module_path}")

    spec = importlib.util.spec_from_file_location("qwen_chat_module", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load qwen_chat.py module spec")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_account_credentials(accounts_path: Path, account_number: int) -> tuple[str, str]:
    if not accounts_path.exists():
        raise FileNotFoundError(f"accounts.json not found at {accounts_path}")

    data = json.loads(accounts_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("accounts.json must be an array")

    for item in data:
        if not isinstance(item, dict):
            continue
        if int(item.get("accountNumber", -1)) != int(account_number):
            continue
        if str(item.get("status", "")).lower() != "activated":
            raise ValueError(f"Account #{account_number} exists but is not activated")

        email = str(item.get("qwenEmail", "")).strip()
        password = str(item.get("qwenPassword", "")).strip()
        if not email or not password:
            raise ValueError(f"Account #{account_number} is missing email/password")
        return email, password

    raise ValueError(f"Activated account #{account_number} not found in accounts.json")


def mask_email(email: str) -> str:
    value = str(email or "")
    if "@" not in value:
        return "***"
    user, domain = value.split("@", 1)
    if len(user) <= 2:
        user_masked = user[0] + "*" if user else "*"
    else:
        user_masked = user[:2] + "*" * (len(user) - 2)
    return f"{user_masked}@{domain}"


def text_preview(text: str, limit: int = 220) -> str:
    value = str(text or "").replace("\n", " ").replace("\r", " ").strip()
    if len(value) <= limit:
        return value
    return value[:limit] + "..."


def payload_rejects_stop(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False

    payload_status = str(payload.get("status", "")).strip().lower()
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    data_status = str(data.get("status", "")).strip().lower()

    return (
        payload.get("success") is False
        or payload.get("status") is False
        or payload_status in {"false", "failed", "error", "denied"}
        or data.get("status") is False
        or data_status in {"false", "failed", "error", "denied"}
    )


def send_stop(
    qwen: Any,
    *,
    session_id: str,
    response_ids: list[str],
    token: str,
    ssxmod: dict[str, str],
) -> dict[str, Any]:
    headers = qwen.get_request_headers(token=token)
    headers["accept"] = "application/json, text/plain, */*"

    url = f"{qwen.BASE_URL}/api/v2/chat/completions/stop?chat_id={session_id}"
    attempts: list[dict[str, Any]] = []

    for response_id in response_ids:
        body = {"chat_id": session_id, "response_id": response_id}
        try:
            response = requests.post(
                url,
                json=body,
                headers=headers,
                cookies=qwen.get_request_cookies(ssxmod=ssxmod),
                timeout=30,
            )
        except Exception as error:  # noqa: BLE001
            attempts.append(
                {
                    "response_id": response_id,
                    "ok": False,
                    "status": None,
                    "error": str(error),
                    "body_preview": "",
                }
            )
            continue

        content_type = str(response.headers.get("content-type") or "")
        parsed_json: dict[str, Any] | None = None
        text_body = response.text
        if "json" in content_type.lower():
            try:
                maybe_json = response.json()
                if isinstance(maybe_json, dict):
                    parsed_json = maybe_json
            except Exception:  # noqa: BLE001
                parsed_json = None

        accepted = response.ok and not payload_rejects_stop(parsed_json)
        attempts.append(
            {
                "response_id": response_id,
                "ok": accepted,
                "status": response.status_code,
                "error": "",
                "body_preview": text_preview(text_body),
                "content_type": content_type,
            }
        )

        if accepted:
            return {
                "accepted": True,
                "chosen_response_id": response_id,
                "attempts": attempts,
            }

    return {
        "accepted": False,
        "chosen_response_id": "",
        "attempts": attempts,
    }


def extract_answer_text(chunk: dict[str, Any]) -> str:
    choices = chunk.get("choices") if isinstance(chunk.get("choices"), list) else []
    if choices:
        choice = choices[0] if isinstance(choices[0], dict) else {}
        delta = choice.get("delta") if isinstance(choice.get("delta"), dict) else {}
        content = delta.get("content")
        if isinstance(content, str):
            return content
        if isinstance(choice.get("text"), str):
            return choice["text"]
    content = chunk.get("content")
    if isinstance(content, str):
        return content
    data = chunk.get("data") if isinstance(chunk.get("data"), dict) else {}
    nested = data.get("content")
    if isinstance(nested, str):
        return nested
    return ""


def run_stream_then_stop(
    qwen: Any,
    *,
    session_id: str,
    token: str,
    ssxmod: dict[str, str],
    stop_after_chars: int,
    stop_after_seconds: float,
    timeout: float,
) -> dict[str, Any]:
    url = f"{qwen.BASE_URL}/api/v2/chat/completions?chat_id={session_id}"
    timestamp_ms = int(time.time() * 1000)
    message_id = str(uuid.uuid4())
    child_id = str(uuid.uuid4())

    payload = {
        "chat_id": session_id,
        "stream": True,
        "version": "2.1",
        "incremental_output": True,
        "chat_mode": "normal",
        "model": qwen.CURRENT_MODEL,
        "parent_id": None,
        "messages": [
            {
                "fid": message_id,
                "parentId": None,
                "childrenIds": [child_id],
                "role": "user",
                "content": "Write many lines continuously: line-1, line-2 ... line-500. Keep going until stopped.",
                "user_action": "chat",
                "files": [],
                "timestamp": timestamp_ms,
                "models": [qwen.CURRENT_MODEL],
                "chat_type": "t2t",
                "feature_config": {"output_schema": "phase", "thinking_enabled": False},
                "extra": {"meta": {"subChatType": "t2t"}},
                "sub_chat_type": "t2t",
                "parent_id": None,
            }
        ],
        "timestamp": timestamp_ms,
    }

    response = requests.post(
        url,
        json=payload,
        headers=qwen.get_request_headers(token=token),
        cookies=qwen.get_request_cookies(ssxmod=ssxmod),
        stream=True,
        timeout=(10, timeout),
    )
    response.raise_for_status()

    started_at = time.time()
    response_id = ""
    parent_user_id = ""
    total_answer_chars = 0
    stop_result: dict[str, Any] | None = None
    stop_sent_at: float | None = None

    for raw_line in response.iter_lines():
        if not raw_line:
            continue

        line = raw_line.decode("utf-8", errors="ignore") if isinstance(raw_line, bytes) else str(raw_line)
        if not line.startswith("data: "):
            continue

        payload_text = line[6:].strip()
        if payload_text == "[DONE]":
            break

        try:
            chunk = json.loads(payload_text)
        except json.JSONDecodeError:
            continue

        created = chunk.get("response.created") if isinstance(chunk.get("response.created"), dict) else {}
        if not response_id:
            candidate = created.get("response_id") or chunk.get("response_id")
            if isinstance(candidate, str):
                response_id = candidate.strip()
        if not parent_user_id:
            parent_candidate = created.get("parent_id") or chunk.get("parent_id")
            if isinstance(parent_candidate, str):
                parent_user_id = parent_candidate.strip()

        answer_delta = extract_answer_text(chunk)
        if answer_delta:
            total_answer_chars += len(answer_delta)

        elapsed = time.time() - started_at
        should_stop = (
            stop_result is None
            and bool(response_id)
            and (total_answer_chars >= stop_after_chars or elapsed >= stop_after_seconds)
        )

        if should_stop:
            candidates = []
            for candidate in [response_id, parent_user_id]:
                value = str(candidate or "").strip()
                if value and value not in candidates:
                    candidates.append(value)

            stop_result = send_stop(
                qwen,
                session_id=session_id,
                response_ids=candidates,
                token=token,
                ssxmod=ssxmod,
            )
            stop_sent_at = time.time()

        if stop_sent_at is not None and (time.time() - stop_sent_at) > 8:
            break

    return {
        "response_id": response_id,
        "parent_user_id": parent_user_id,
        "answer_chars": total_answer_chars,
        "stop": stop_result,
    }


def run_follow_up(
    qwen: Any,
    *,
    session_id: str,
    parent_id: str,
    token: str,
    ssxmod: dict[str, str],
) -> dict[str, Any]:
    url = f"{qwen.BASE_URL}/api/v2/chat/completions?chat_id={session_id}"
    timestamp_ms = int(time.time() * 1000)
    message_id = str(uuid.uuid4())
    child_id = str(uuid.uuid4())

    payload = {
        "chat_id": session_id,
        "stream": True,
        "version": "2.1",
        "incremental_output": True,
        "chat_mode": "normal",
        "model": qwen.CURRENT_MODEL,
        "parent_id": parent_id or None,
        "messages": [
            {
                "fid": message_id,
                "parentId": parent_id or None,
                "childrenIds": [child_id],
                "role": "user",
                "content": "Reply only with: OK",
                "user_action": "chat",
                "files": [],
                "timestamp": timestamp_ms,
                "models": [qwen.CURRENT_MODEL],
                "chat_type": "t2t",
                "feature_config": {"output_schema": "phase", "thinking_enabled": False},
                "extra": {"meta": {"subChatType": "t2t"}},
                "sub_chat_type": "t2t",
                "parent_id": parent_id or None,
            }
        ],
        "timestamp": timestamp_ms,
    }

    response = requests.post(
        url,
        json=payload,
        headers=qwen.get_request_headers(token=token),
        cookies=qwen.get_request_cookies(ssxmod=ssxmod),
        stream=True,
        timeout=(10, 90),
    )
    content_type = str(response.headers.get("content-type") or "")

    if "event-stream" in content_type.lower() and response.ok:
        first_event = ""
        for raw_line in response.iter_lines():
            if not raw_line:
                continue
            line = raw_line.decode("utf-8", errors="ignore") if isinstance(raw_line, bytes) else str(raw_line)
            if not line.startswith("data: "):
                continue
            payload_text = line[6:].strip()
            if payload_text == "[DONE]":
                continue
            first_event = payload_text
            break
        return {
            "status": response.status_code,
            "ok": response.ok,
            "content_type": content_type,
            "body_preview": text_preview(first_event or "<stream-opened-no-event>"),
        }

    body_text = response.text

    return {
        "status": response.status_code,
        "ok": response.ok,
        "content_type": content_type,
        "body_preview": text_preview(body_text),
    }


def main() -> int:
    args = parse_args()

    root_dir = Path(__file__).resolve().parents[2]
    qwen = load_qwen_module(root_dir)
    accounts_path = root_dir / "accounts.json"

    email, password = load_account_credentials(accounts_path, args.account_number)
    print(f"Using account #{args.account_number}: {mask_email(email)}")

    token = qwen.do_login(email, password)
    if not token:
        print("[FAIL] login failed")
        return 2

    ssxmod = qwen.generate_ssxmod_cookies()
    session_id = qwen.create_session(
        title=f"Stop test {int(time.time())}",
        chat_type="t2t",
        token=token,
        ssxmod=ssxmod,
    )
    if not session_id:
        print("[FAIL] create_session failed")
        return 3

    print(f"Created session: {session_id}")

    stream_result = run_stream_then_stop(
        qwen,
        session_id=session_id,
        token=token,
        ssxmod=ssxmod,
        stop_after_chars=args.stop_after_chars,
        stop_after_seconds=args.stop_after_seconds,
        timeout=args.timeout,
    )

    print("-" * 72)
    print("Stream summary:")
    print(f"response_id: {stream_result['response_id'] or '<none>'}")
    print(f"parent_user_id: {stream_result['parent_user_id'] or '<none>'}")
    print(f"answer_chars_before_exit: {stream_result['answer_chars']}")

    stop_result = stream_result.get("stop") or {}
    print("Stop attempts:")
    attempts = stop_result.get("attempts") if isinstance(stop_result, dict) else None
    if not attempts:
        print("  <none>")
    else:
        for idx, attempt in enumerate(attempts, start=1):
            print(
                f"  {idx}. response_id={attempt.get('response_id')} "
                f"status={attempt.get('status')} ok={attempt.get('ok')} "
                f"content_type={attempt.get('content_type', '')}"
            )
            if attempt.get("error"):
                print(f"     error={attempt['error']}")
            if attempt.get("body_preview"):
                print(f"     body={attempt['body_preview']}")

    stop_ok = bool(stop_result.get("accepted")) if isinstance(stop_result, dict) else False
    print(f"Stop accepted: {stop_ok}")

    if args.no_follow_up:
        return 0 if stop_ok else 4

    if args.follow_up_delay > 0:
        print(f"waiting_before_follow_up={args.follow_up_delay}s")
        time.sleep(args.follow_up_delay)

    if args.follow_up_parent_strategy == "parent":
        follow_parent = str(stream_result.get("parent_user_id") or "").strip()
    elif args.follow_up_parent_strategy == "response":
        follow_parent = str(stream_result.get("response_id") or "").strip()
    elif args.follow_up_parent_strategy == "none":
        follow_parent = ""
    else:
        follow_parent = str(
            stream_result.get("parent_user_id")
            or stream_result.get("response_id")
            or ""
        ).strip()
    print(f"follow_up_parent_id={follow_parent or '<none>'}")
    follow = run_follow_up(
        qwen,
        session_id=session_id,
        parent_id=follow_parent,
        token=token,
        ssxmod=ssxmod,
    )

    print("-" * 72)
    print("Follow-up summary:")
    print(f"status={follow['status']} ok={follow['ok']} content_type={follow['content_type']}")
    print(f"body={follow['body_preview']}")

    return 0 if stop_ok else 4


if __name__ == "__main__":
    sys.exit(main())
